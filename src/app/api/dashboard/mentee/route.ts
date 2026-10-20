import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { getAuthUserId } from "@/lib/auth";
import SessionRequest from "@/models/SessionRequest";
import Mentee from "@/models/Mentee";
import { serializeRequests, parseSessionDate, startOfToday, SerializedRequest } from "@/lib/requests";
import { getInbox } from "@/lib/inbox";
import { cacheGet, cacheSet } from "@/lib/cache";

export const dynamic = "force-dynamic";

const DASHBOARD_TTL_SECONDS = 120; // 2 minutes - dashboard freshness matters

/**
 * GET /api/dashboard/mentee
 * Everything the mentee dashboard renders, derived from the logged-in user's
 * real MongoDB data: stats, sessions, activity and messages.
 */
export async function GET(req: NextRequest) {
  const userId = getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Auth already verified - safe to serve the per-user cache.
    const cacheKey = `dash:mentee:${userId}`;
    const cached = await cacheGet(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    await dbConnect();

    const menteeProfile = await Mentee.findOne({ userId })
      .select("fullName profilePhoto currentStatus")
      .lean<any>();

    if (!menteeProfile) {
      return NextResponse.json(
        { success: false, error: "No mentee profile exists for this user" },
        { status: 404 }
      );
    }

    const docs = await SessionRequest.find({ menteeUserId: userId })
      .sort({ createdAt: -1 })
      .lean<any[]>();

    const requests = await serializeRequests(docs);
    const today = startOfToday();

    const isUpcoming = (r: SerializedRequest) => {
      if (r.status !== "accepted") return false;
      const date = parseSessionDate(r.date);
      return !date || date.getTime() >= today.getTime();
    };

    const upcoming = requests.filter(isUpcoming);
    const requested = requests.filter((r) => r.status === "pending");
    const past = requests.filter(
      (r) => r.status === "completed" || r.status === "declined" || (r.status === "accepted" && !isUpcoming(r))
    );

    const myMentors = new Set(
      requests.filter((r) => r.status === "accepted" || r.status === "completed").map((r) => String(r.mentor?.userId))
    ).size;

    const hoursOfMentorship = requests
      .filter((r) => r.status === "completed")
      .reduce((sum, r) => sum + (r.durationHours || 1), 0);

    const completedSessions = requests.filter((r) => r.status === "completed").length;

    const inbox = await getInbox(userId, 10);

    // Real activity trail derived from the user's own requests.
    const activity = requests.slice(0, 8).map((r) => {
      const mentorName = r.mentor?.fullName ?? "a mentor";
      switch (r.status) {
        case "accepted":
          return { _id: r._id, type: "session_accepted", text: `${mentorName} accepted your session request "${r.topic}"`, date: r.createdAt };
        case "declined":
          return { _id: r._id, type: "session_declined", text: `${mentorName} declined your session request "${r.topic}"`, date: r.createdAt };
        case "completed":
          return { _id: r._id, type: "session_completed", text: `You completed a session with ${mentorName} on "${r.topic}"`, date: r.createdAt };
        default:
          return { _id: r._id, type: "request_sent", text: `You requested a session with ${mentorName} on "${r.topic}"`, date: r.createdAt };
      }
    });

    const payload = {
      success: true,
      profile: {
        fullName: menteeProfile.fullName,
        profilePhoto: menteeProfile.profilePhoto ?? "",
        currentStatus: menteeProfile.currentStatus ?? "",
      },
      stats: {
        myMentors,
        upcomingSessions: upcoming.length,
        hoursOfMentorship,
        completedSessions,
        pendingRequests: requested.length,
      },
      sessions: { upcoming, past, requested },
      activity,
      messages: inbox,
    };
    await cacheSet(cacheKey, payload, DASHBOARD_TTL_SECONDS);

    return NextResponse.json(payload);
  } catch (error: any) {
    console.error("Error in GET /api/dashboard/mentee:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
