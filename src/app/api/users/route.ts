// app/api/users/route.ts — directory of platform users (for messages / people list)
import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { getAuthUserId } from "@/lib/auth";
import User from "@/models/User";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    await dbConnect();
    const users = await User.find({})
      .select("username email")
      .sort({ username: 1 })
      .limit(200)
      .lean();

    return NextResponse.json({
      success: true,
      users: users
        .filter((u: any) => String(u._id) !== userId)
        .map((u: any) => ({
          _id: String(u._id),
          username: u.username ?? "Member",
        })),
    });
  } catch (error: any) {
    console.error("Error in GET /api/users:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
