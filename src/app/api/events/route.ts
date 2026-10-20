import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { getAuthUserId } from "@/lib/auth";
import Event from "@/models/Event";
import Registration from "@/models/Registration";
import Mentor from "@/models/Mentor2";
import mongoose from "mongoose";
import { cacheGet, cacheSet, bumpVersion, getVersion } from "@/lib/cache";

export const dynamic = "force-dynamic";

const EVENTS_TTL_SECONDS = 1800; // 30 minutes

function serialize(
  event: any,
  attendeeCount: number,
  isRegistered: boolean,
  currentUserId: string | null
) {
  const createdBy = event.createdBy ? String(event.createdBy) : "";
  return {
    _id: String(event._id),
    title: event.title,
    description: event.description ?? "",
    date: event.date,
    time: event.time,
    location: event.location ?? "",
    image: event.image ?? "",
    category: event.category ?? "Event",
    isVirtual: Boolean(event.isVirtual),
    attendees: attendeeCount,
    createdBy,
    isMine: Boolean(currentUserId && createdBy && createdBy === currentUserId),
    isRegistered,
    createdAt: String(event.createdAt ?? ""),
  };
}

/** GET /api/events - platform events with registration counts + per-user state. */
export async function GET(req: NextRequest) {
  try {
    const currentUserId = getAuthUserId(req);

    // isRegistered/isMine are per-user, so the cache key includes the viewer.
    const ver = await getVersion("events");
    const cacheKey = `events:list:${ver}:${currentUserId ?? "anon"}`;
    const cached = await cacheGet(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    await dbConnect();
    const events = await Event.find({}).sort({ createdAt: -1 }).limit(20).lean();
    const eventIds = events.map((e) => String(e._id));
    const titles = events.map((e) => e.title);

    const match: any = {
      $or: [{ title: { $in: titles } }],
    };
    if (eventIds.length) {
      match.$or.push({ eventId: { $in: eventIds.map((id) => new mongoose.Types.ObjectId(id)) } });
    }

    const registrations = await Registration.find(match)
      .select("title eventId userId")
      .lean();

    const countByTitle = new Map<string, number>();
    const countByEvent = new Map<string, number>();
    const registeredByTitle = new Set<string>();
    const registeredByEvent = new Set<string>();

    for (const r of registrations as any[]) {
      const byEvent = r.eventId ? String(r.eventId) : null;
      const byTitle = r.title ?? "";
      if (byEvent) countByEvent.set(byEvent, (countByEvent.get(byEvent) ?? 0) + 1);
      else countByTitle.set(byTitle, (countByTitle.get(byTitle) ?? 0) + 1);

      if (currentUserId && String(r.userId) === currentUserId) {
        if (byEvent) registeredByEvent.add(byEvent);
        registeredByTitle.add(byTitle);
      }
    }

    const payload = {
      success: true,
      events: events.map((e) => {
        const id = String(e._id);
        const attendees = (countByEvent.get(id) ?? 0) + (countByTitle.get(e.title) ?? 0);
        const isRegistered = registeredByEvent.has(id) || registeredByTitle.has(e.title);
        return serialize(e, attendees, isRegistered, currentUserId);
      }),
    };
    await cacheSet(cacheKey, payload, EVENTS_TTL_SECONDS);

    return NextResponse.json(payload);
  } catch (error: any) {
    console.error("Error in GET /api/events:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/** POST /api/events - mentors only. */
export async function POST(req: NextRequest) {
  const userId = getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    await dbConnect();

    const mentor = await Mentor.findOne({ userId }).select("_id").lean();
    if (!mentor) {
      return NextResponse.json(
        { success: false, error: "Only mentors can create events." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { title, description, date, time, location, image, category, isVirtual } = body ?? {};

    if (!title || !date || !time) {
      return NextResponse.json(
        { success: false, error: "title, date and time are required" },
        { status: 400 }
      );
    }

    const event = await Event.create({
      title,
      description: description ?? "",
      date,
      time,
      location: location ?? "",
      image: image ?? "",
      category: category ?? "Event",
      isVirtual: isVirtual ?? true,
      createdBy: userId,
    });

    // New event affects every viewer's list - bump the shared version.
    await bumpVersion("events");

    return NextResponse.json({ success: true, event: serialize(event, 0, false, userId) }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/events:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
