import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import Mentor2 from "@/models/Mentor2";
import { cacheGet, cacheSet, getVersion } from "@/lib/cache";

export const dynamic = "force-dynamic";

const LIST_TTL_SECONDS = 3600; // 1 hour

/**
 * GET /api/mentors
 * Public list of mentor profiles (used by find-mentor, dashboards, etc.).
 */
export async function GET() {
  try {
    const ver = await getVersion("mentors");
    const cacheKey = `mentors:list:${ver}`;

    const cached = await cacheGet(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    await dbConnect();

    const mentors = await Mentor2.find({})
      .select(
        "userId fullName profilePhoto currentRole company technicalSkills softSkills areasOfInterest mentoringGoals personalBio availability yearsOfExperience education"
      )
      .sort({ createdAt: -1 })
      .lean();

    const payload = {
      success: true,
      mentors: mentors.map((m) => ({ ...m, userId: String(m.userId), _id: String(m._id) })),
    };
    await cacheSet(cacheKey, payload, LIST_TTL_SECONDS);

    return NextResponse.json(payload);
  } catch (error: any) {
    console.error("Error in GET /api/mentors:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
