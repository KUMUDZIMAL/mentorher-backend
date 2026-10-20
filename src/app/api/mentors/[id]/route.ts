import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/lib/mongodb";
import Mentor2 from "@/models/Mentor2";
import SessionRequest from "@/models/SessionRequest";
import { cacheGet, cacheSet, getVersion } from "@/lib/cache";

export const dynamic = "force-dynamic";

const PROFILE_TTL_SECONDS = 600; // 10 minutes — stats stay fairly fresh

/**
 * GET /api/mentors/[id]
 * Full mentor profile. `id` may be the mentor's user id or the mentor document id.
 * Returns 400 for malformed ids and 404 when no mentor matches.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ success: false, error: "Invalid mentor id" }, { status: 400 });
  }

  try {
    const ver = await getVersion("mentors");
    const cacheKey = `mentor:profile:${ver}:${id}`;

    const cached = await cacheGet(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    await dbConnect();

    const orFilter: mongoose.FilterQuery<typeof Mentor2>[] = [{ userId: id }];
    if (mongoose.Types.ObjectId.isValid(id)) {
      orFilter.push({ _id: id });
    }

    const mentor = await Mentor2.findOne({ $or: orFilter }).lean<any>();
    if (!mentor) {
      return NextResponse.json({ success: false, error: "Mentor not found" }, { status: 404 });
    }

    const mentorUserId = String(mentor.userId);

    const [activeMentees, completedSessions] = await Promise.all([
      SessionRequest.distinct("menteeUserId", { mentorUserId, status: { $in: ["accepted", "completed"] } }),
      SessionRequest.countDocuments({ mentorUserId, status: "completed" }),
    ]);

    const payload = {
      success: true,
      mentor: { ...mentor, userId: mentorUserId, _id: String(mentor._id) },
      stats: {
        menteeCount: activeMentees.length,
        completedSessions,
      },
    };
    await cacheSet(cacheKey, payload, PROFILE_TTL_SECONDS);

    return NextResponse.json(payload);
  } catch (error: any) {
    console.error("Error in GET /api/mentors/[id]:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
