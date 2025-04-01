import { NextResponse, NextRequest } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import Mentor2 from "@/models/Mentor2";
// Ensure the User model is registered by importing it
import User from "@/models/User";
import jwt, { JwtPayload } from "jsonwebtoken";

export async function GET(req: NextRequest) {
  try {
    await dbConnect();

    const token = req.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, error: "No token found" },
        { status: 401 }
      );
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET as string
    ) as JwtPayload;
    if (!decoded || !decoded.id) {
      return NextResponse.json(
        { success: false, error: "Invalid token" },
        { status: 401 }
      );
    }

    const mentor = await Mentor2.findOne({ userId: decoded.id })
      .populate("userId", "username email age gender")
      .lean();

    console.log("Fetched mentor data:", mentor);

    if (!mentor) {
      return NextResponse.redirect(new URL("/BecomeMentor", req.url));
    }

    return NextResponse.json({ success: true, data: mentor });
  } catch (error: any) {
    console.error("Error fetching mentor profile:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
