import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/lib/mongodb";
import { getAuthUserId } from "@/lib/auth";
import SessionRequest from "@/models/SessionRequest";
import { cacheDel } from "@/lib/cache";
import { dispatchNotification } from "@/lib/notifications";

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ["accepted", "declined"],
  accepted: ["completed", "declined"],
};

/**
 * PATCH /api/requests/[id]
 * Updates the status of a session request (accept / decline / complete).
 * Only the mentor party may change the status.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    await dbConnect();
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: "Invalid request id" }, { status: 400 });
    }

    const body = await req.json();
    const status = body?.status;

    const request = await SessionRequest.findById(id);
    if (!request) {
      return NextResponse.json({ success: false, error: "Request not found" }, { status: 404 });
    }

    if (String(request.mentorUserId) !== userId) {
      return NextResponse.json({ success: false, error: "Only the mentor can update this request" }, { status: 403 });
    }

    if (!["pending", "accepted", "declined", "completed"].includes(status)) {
      return NextResponse.json({ success: false, error: "Invalid status" }, { status: 400 });
    }

    const allowed = ALLOWED_TRANSITIONS[request.status] ?? [];
    if (request.status !== status && !allowed.includes(status)) {
      return NextResponse.json(
        { success: false, error: `Cannot change status from "${request.status}" to "${status}"` },
        { status: 400 }
      );
    }

    const previousStatus = request.status;
    request.status = status;
    await request.save();

    // Status change affects both parties' dashboards — drop their caches.
    await cacheDel(
      `dash:mentor:${String(request.mentorUserId)}`,
      `dash:mentee:${String(request.menteeUserId)}`
    );

    // Status actually changed — notify the mentee (async, with direct-write
    // fallback if the broker is down).
    if (previousStatus !== status) {
      await dispatchNotification({
        jobId: `notif:request.updated:${request._id}:${String(request.menteeUserId)}:${status}`,
        type: "session_request.updated",
        actorId: userId,
        targetId: String(request._id),
        recipientId: String(request.menteeUserId),
        context: status,
      });
    }

    return NextResponse.json({ success: true, request });
  } catch (error: any) {
    console.error("Error in PATCH /api/requests/[id]:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
