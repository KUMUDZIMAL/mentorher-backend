// app/api/register/route.ts
import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "../../../lib/mongodb"
import Registration from "../../../models/Registration"
import jwt, { JwtPayload } from "jsonwebtoken";

export async function POST(request: NextRequest) {
  // Connect to MongoDB
  await dbConnect();

  // Retrieve and verify JWT token from cookies
  const token = request.cookies.get("token")?.value;
  if (!token) {
    return NextResponse.json(
      { success: false, error: "No token provided" },
      { status: 401 }
    );
  }

  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Invalid token" },
      { status: 401 }
    );
  }

  if (!decoded || !decoded.id) {
    return NextResponse.json(
      { success: false, error: "Invalid token" },
      { status: 401 }
    );
  }

  // Parse request body and override userId with the logged-in user's id
  const data = await request.json();
  data.userId = decoded.id;

  const { title,date,time, fullName, email, phone, isMentor } = data;

  // Basic validation
  if (  !title || !date || !time || !fullName || !email || !phone || isMentor === undefined) {
    return NextResponse.json(
      { error: "Missing required fields." },
      { status: 400 }
    );
  }

  try {
    const registration = new Registration({
      userId: data.userId,
      title,
      date,
      time,
      fullName,
      email,
      phone,
      isMentor: isMentor === "yes" ? true : false,
    });

    await registration.save();

    return NextResponse.json(
      { message: "Registration successful", registration },
      { status: 200 }
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json(
    { error: "Method GET not allowed" },
    { status: 405 }
  );
}
