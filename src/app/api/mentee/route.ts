import { NextRequest, NextResponse } from "next/server";
import { dbConnect }from "@/lib/mongodb"; // Make sure this helper is correctly exported
import Mentee from "@/models/Mentee";
import jwt, { JwtPayload } from "jsonwebtoken";

export async function POST(request: NextRequest) {
  try {
    await dbConnect(); // Connect to MongoDB

    // Retrieve and verify JWT token from cookies
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, error: "No token provided" },
        { status: 401 }
      );
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;
    if (!decoded || !decoded.id) {
      return NextResponse.json(
        { success: false, error: "Invalid token" },
        { status: 401 }
      );
    }

    // Parse request body and assign the logged-in user ID
    const data = await request.json();
    data.userId = decoded.id;

    // Check if the mentor profile already exists
    const existingProfile = await Mentee.findOne({ userId: decoded.id });
    if (existingProfile) {
      return NextResponse.json(
        { success: false, error: "Mentor profile already exists" },
        { status: 400 }
      );
    }

    // Create a new mentor (or mentee) profile
    const newProfile = await Mentee.create(data);
    return NextResponse.json({ success: true, profile: newProfile }, { status: 201 });
  } catch (error: any) {
    console.error("Error in mentor API:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
