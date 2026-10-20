// app/api/registerEvent/route.ts
import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import Registration from "@/models/Registration";
import Event from "@/models/Event";
import { getAuthUserId } from "@/lib/auth";
import mongoose from "mongoose";
import { bumpVersion } from "@/lib/cache";

export async function POST(request: NextRequest) {
  const userId = getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  await dbConnect();

  const data = await request.json();
  const { title, date, time, fullName, email, phone, isMentor } = data;
  let eventId: string | null = typeof data.eventId === "string" && data.eventId ? data.eventId : null;

  if (!title || !date || !time || !fullName || !email || !phone || isMentor === undefined) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  try {
    if (eventId) {
      if (!mongoose.Types.ObjectId.isValid(eventId)) {
        return NextResponse.json({ error: "Invalid event id." }, { status: 400 });
      }
      const event = await Event.findById(eventId).select("_id title").lean();
      if (!event) {
        return NextResponse.json({ error: "Event not found." }, { status: 404 });
      }
    }

    // Prevent duplicate registration (by eventId when known, otherwise by title)
    const duplicateQuery: any = eventId
      ? { eventId, userId }
      : { title, userId, eventId: null };
    const duplicate = await Registration.findOne(duplicateQuery).select("_id").lean();
    if (duplicate) {
      return NextResponse.json(
        { error: "You have already registered for this event." },
        { status: 409 }
      );
    }

    const registration = await Registration.create({
      userId,
      eventId: eventId || null,
      title,
      date,
      time,
      fullName,
      email,
      phone,
      isMentor: isMentor === "yes" || isMentor === true,
    });

    // Registration changes attendee counts and per-user flags on event lists.
    await bumpVersion("events");

    return NextResponse.json(
      { message: "Registration successful", registration },
      { status: 201 }
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * GET /api/registerEvent?eventId=... — registrant list for an event.
 * Only the event's creator (mentor) can see it.
 */
export async function GET(request: NextRequest) {
  const userId = getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("eventId");
  if (!eventId || !mongoose.Types.ObjectId.isValid(eventId)) {
    return NextResponse.json({ error: "eventId query param is required." }, { status: 400 });
  }

  try {
    await dbConnect();
    const event: any = await Event.findById(eventId).select("createdBy title").lean();
    if (!event) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }
    if (!event.createdBy || String(event.createdBy) !== userId) {
      return NextResponse.json(
        { error: "Only the event creator can view registrations." },
        { status: 403 }
      );
    }

    const registrations = await Registration.find({ eventId })
      .select("fullName email phone isMentor registeredAt")
      .sort({ registeredAt: -1 })
      .lean();

    return NextResponse.json({ success: true, eventTitle: event.title, registrations });
  } catch (error) {
    console.error("Error fetching registrations:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
