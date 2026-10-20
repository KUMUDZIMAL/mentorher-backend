import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/lib/mongodb";
import { getAuthUserId } from "@/lib/auth";
import SessionRequest from "@/models/SessionRequest";
import Mentor2 from "@/models/Mentor2";
import { serializeRequests } from "@/lib/requests";
import { cacheDel } from "@/lib/cache";
import { dispatchNotification } from "@/lib/notifications";

/**
 * GET /api/requests
 * Returns the mentorship/session requests of the logged-in user
 * (as mentee when `?role=mentee`, as mentor when `?role=mentor`, both otherwise).
 */
export async function GET(req: NextRequest) {
  const userId = getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const role = searchParams.get("role");

    let query: mongoose.FilterQuery<typeof SessionRequest> = {
      $or: [{ mentorUserId: userId }, { menteeUserId: userId }],
    };
    if (role === "mentor") query = { mentorUserId: userId };
    if (role === "mentee") query = { menteeUserId: userId };

    const docs = await SessionRequest.find(query).sort({ createdAt: -1 }).lean();
    const requests = await serializeRequests(docs as any);

    return NextResponse.json({ success: true, requests });
  } catch (error: any) {
    console.error("Error in GET /api/requests:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/requests
 * A mentee requests a session with a mentor.
 */
export async function POST(req: NextRequest) {
  const userId = getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    await dbConnect();
    const body = await req.json();
    const { mentorUserId, topic, message, date, time, durationHours } = body ?? {};

    if (!mentorUserId || !topic || !date || !time) {
      return NextResponse.json(
        { success: false, error: "mentorUserId, topic, date and time are required" },
        { status: 400 }
      );
    }
    if (!mongoose.Types.ObjectId.isValid(mentorUserId)) {
      return NextResponse.json({ success: false, error: "Invalid mentor id" }, { status: 400 });
    }
    if (mentorUserId === userId) {
      return NextResponse.json({ success: false, error: "You cannot request a session with yourself" }, { status: 400 });
    }

    const mentor = await Mentor2.findOne({ userId: mentorUserId }).lean();
    if (!mentor) {
      return NextResponse.json({ success: false, error: "Mentor not found" }, { status: 404 });
    }

    const request = await SessionRequest.create({
      mentorUserId,
      menteeUserId: userId,
      topic,
      message,
      date,
      time,
      durationHours: durationHours ?? 1,
      status: "pending",
    });

    // Both parties' dashboards just changed — drop their caches.
    await cacheDel(`dash:mentor:${mentorUserId}`, `dash:mentee:${userId}`);

    // Request is persisted — now notify the mentor (publish, or direct write
    // if the broker is down). Never fails the request itself.
    await dispatchNotification({
      jobId: `notif:request.created:${request._id}:${mentorUserId}`,
      type: "session_request.created",
      actorId: userId,
      targetId: String(request._id),
      recipientId: mentorUserId,
    });

    return NextResponse.json({ success: true, request }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/requests:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
