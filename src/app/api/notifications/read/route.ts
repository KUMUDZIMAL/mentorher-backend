import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/lib/mongodb";
import { getAuthUserId } from "@/lib/auth";
import Notification from "@/models/Notification";

/**
 * POST /api/notifications/read
 * Marks the current user's notifications as read.
 * Body (optional): { ids: string[] } — only those; omit to mark all.
 * Never touches another user's notifications.
 */
export async function POST(req: NextRequest) {
  const userId = getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    await dbConnect();
    const body = await req.json().catch(() => ({}) as any);
    const rawIds: unknown = body?.ids;
    const filter: Record<string, unknown> = { userId, read: false };

    if (Array.isArray(rawIds) && rawIds.length > 0) {
      const ids = rawIds.filter(
        (id: unknown): id is string => typeof id === "string" && mongoose.Types.ObjectId.isValid(id)
      );
      if (ids.length === 0) {
        return NextResponse.json({ success: true, modified: 0 });
      }
      filter._id = { $in: ids };
    }

    const result = await Notification.updateMany(filter, { $set: { read: true } });
    return NextResponse.json({ success: true, modified: result.modifiedCount });
  } catch (error: any) {
    console.error("Error in POST /api/notifications/read:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
