// app/api/availability/route.ts
import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { getAuthUserId } from "@/lib/auth";
import Mentor from "@/models/Mentor2";
import { bumpVersion, cacheDel } from "@/lib/cache";

/** GET /api/availability — the signed-in mentor's saved availability. */
export async function GET(request: NextRequest) {
  const userId = getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    await dbConnect();
    const mentor = await Mentor.findOne({ userId }).select("availability").lean();
    if (!mentor) {
      return NextResponse.json(
        { success: false, error: "Mentor not found.", availability: [] },
        { status: 404 }
      );
    }
    return NextResponse.json({
      success: true,
      availability: (mentor as any).availability ?? [],
    });
  } catch (error) {
    console.error("Error fetching availability:", error);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}

/** POST /api/availability — replace the signed-in mentor's availability. */
export async function POST(request: NextRequest) {
  const userId = getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    await dbConnect();
    const body = await request.json();
    const { availability } = body;

    if (!availability || !Array.isArray(availability)) {
      return NextResponse.json(
        { success: false, error: "Availability must be an array." },
        { status: 400 }
      );
    }

    for (const slot of availability) {
      if (!slot?.day || !slot?.startTime || !slot?.endTime) {
        return NextResponse.json(
          { success: false, error: "Each slot needs day, startTime and endTime." },
          { status: 400 }
        );
      }
    }

    const updatedMentor = await Mentor.findOneAndUpdate(
      { userId },
      { availability },
      { new: true }
    );
    if (!updatedMentor) {
      return NextResponse.json({ success: false, error: "Mentor not found." }, { status: 404 });
    }
    // Availability is part of the public mentor payloads — invalidate them.
    await bumpVersion("mentors");
    await cacheDel(`me:mentor:${userId}`);
    return NextResponse.json({
      success: true,
      message: "Availability updated",
      availability: updatedMentor.availability ?? [],
    });
  } catch (error) {
    console.error("Error updating availability:", error);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
