// app/api/availability/route.ts
import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import jwt, { JwtPayload } from "jsonwebtoken";
import Mentor from "@/models/Mentor2"; // Adjust your import as needed

export async function POST(request: NextRequest) {
  await dbConnect();

  // Retrieve and verify the token from cookies
  const token = request.cookies.get("token")?.value;
  if (!token) {
    return NextResponse.json({ error: "No token provided" }, { status: 401 });
  }

  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;
  } catch (error) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
  if (!decoded || !decoded.id) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { availability } = body;
    if (!availability || !Array.isArray(availability)) {
      return NextResponse.json({ error: "Availability must be an array." }, { status: 400 });
    }
    // Update the mentor's availability
    const updatedMentor = await Mentor.findOneAndUpdate(
      { userId: decoded.id },
      { availability },
      { new: true }
    );
    if (!updatedMentor) {
      return NextResponse.json({ error: "Mentor not found." }, { status: 404 });
    }
    return NextResponse.json({ message: "Availability updated", mentor: updatedMentor });
  } catch (error) {
    console.error("Error updating availability:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
