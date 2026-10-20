import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { getAuthUserId } from "@/lib/auth";
import { markInboxRead } from "@/lib/inbox";

/**
 * POST /api/messages/read
 * Marks all direct messages addressed to the current user as read.
 */
export async function POST(req: NextRequest) {
  const userId = getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    await dbConnect();
    const modified = await markInboxRead(userId);
    return NextResponse.json({ success: true, modified });
  } catch (error: any) {
    console.error("Error in POST /api/messages/read:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
