import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { getAuthUserId } from "@/lib/auth";
import Notification from "@/models/Notification";

export const dynamic = "force-dynamic";

/**
 * GET /api/notifications
 * The current user's notifications (newest first) plus their unread count.
 * Never cached — per-user and freshness-sensitive.
 */
export async function GET(req: NextRequest) {
  const userId = getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    await dbConnect();
    const [notifications, unreadCount] = await Promise.all([
      Notification.find({ userId }).sort({ createdAt: -1 }).limit(20).lean(),
      Notification.countDocuments({ userId, read: false }),
    ]);
    return NextResponse.json({ success: true, notifications, unreadCount });
  } catch (error: any) {
    console.error("Error in GET /api/notifications:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
