import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { getAuthUserId } from "@/lib/auth";
import SessionRequest from "@/models/SessionRequest";
import Mentor2 from "@/models/Mentor2";
import { serializeRequests, parseSessionDate, startOfToday, startOfMonth, SerializedRequest } from "@/lib/requests";
import { getInbox } from "@/lib/inbox";
import { cacheGet, cacheSet } from "@/lib/cache";

export const dynamic = "force-dynamic";

const DASHBOARD_TTL_SECONDS = 120; // 2 minutes - dashboard freshness matters

/**
 * GET /api/dashboard/mentor
 * Everything the mentor dashboard renders, derived from the logged-in user's
 * real MongoDB data: stats, requests, schedule and messages.
 */
export async function GET(req: NextRequest) {
  const userId = getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Auth already verified - safe to serve the per-user cache.
    const cacheKey = `dash:mentor:${userId}`;
    const cached = await cacheGet(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    await dbConnect();

    const mentorProfile = await Mentor2.findOne({ userId })
      .select("fullName profilePhoto currentRole company")
      .lean<any>();

    if (!mentorProfile) {
      return NextResponse.json(
        { success: false, error: "No mentor profile exists for this user" },
        { status: 404 }
      );
    }

    const docs = await SessionRequest.find({ mentorUserId: userId })
      .sort({ createdAt: -1 })
      .lean<any[]>();

    const requests = await serializeRequests(docs);
    const today = startOfToday();
    const monthStart = startOfMonth();

    const isUpcoming = (r: SerializedRequest) => {
      if (r.status !== "accepted") return false;
      const date = parseSessionDate(r.date);
      return !date || date.getTime() >= today.getTime();
    };

    const pending = requests.filter((r) => r.status === "pending");
    const upcoming = requests.filter(isUpcoming);
    const past = requests.filter(
      (r) => r.status === "completed" || r.status === "declined" || (r.status === "accepted" && !isUpcoming(r))
    );

    const totalMentees = new Set(
      requests
        .filter((r) => r.status === "accepted" || r.status === "completed")
        .map((r) => String(r.mentee?.userId))
    ).size;

    const totalSessions = requests.filter((r) => r.status === "accepted" || r.status === "completed").length;

    const sessionsThisMonth = requests.filter((r) => {
      if (r.status === "declined") return false;
      const created = new Date(r.createdAt);
      if (!Number.isNaN(created.getTime()) && created.getTime() >= monthStart.getTime()) return true;
      const sessionDate = parseSessionDate(r.date);
      return Boolean(sessionDate && sessionDate.getTime() >= monthStart.getTime());
    }).length;

    const inbox = await getInbox(userId, 10);

    const payload = {
      success: true,
      profile: {
        fullName: mentorProfile.fullName,
        profilePhoto: mentorProfile.profilePhoto ?? "",
        currentRole: mentorProfile.currentRole ?? "",
        company: mentorProfile.company ?? "",
      },
      stats: {
        totalMentees,
        sessionsThisMonth,
        totalSessions,
        pendingRequests: pending.length,
      },
      requests: { pending, upcoming, past },
      schedule: upcoming,
      messages: inbox,
    };
    await cacheSet(cacheKey, payload, DASHBOARD_TTL_SECONDS);

    return NextResponse.json(payload);
  } catch (error: any) {
    console.error("Error in GET /api/dashboard/mentor:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
