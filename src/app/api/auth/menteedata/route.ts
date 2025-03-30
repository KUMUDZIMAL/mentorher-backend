import { NextResponse, NextRequest } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import Mentee from "@/models/Mentee";
import jwt, { JwtPayload } from "jsonwebtoken";

export async function GET(req: NextRequest) {
  try {
    // Connect to MongoDB
    await dbConnect();

    // Get the token from cookies
    const token = req.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, error: "No token found" },
        { status: 401 }
      );
    }

    // Verify and decode the token
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

    // Find mentee document by matching userId and convert to plain object using lean()
    const mentee = await Mentee.findOne({ userId: decoded.id })
      .populate("userId", "username email age gender")
      .lean();

    // Log the mentee data to verify the output
    console.log("Fetched mentee data:", mentee);

    // If mentee does not exist, redirect to /Become-mentee
    if (!mentee) {
      return NextResponse.redirect(new URL('/Become-mentee', req.url));
    }

    // Return the mentee data if found
    return NextResponse.json({ success: true, data: mentee });
  } catch (error: any) {
    console.error("Error fetching mentee profile:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
