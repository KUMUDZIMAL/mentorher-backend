import { NextResponse, NextRequest } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import Mentor2 from "@/models/Mentor2";
// Ensure the User model is registered by importing it
import User from "@/models/User";
import jwt, { JwtPayload } from "jsonwebtoken";
import { cacheGet, cacheSet } from "@/lib/cache";

const MENTORDATA_TTL_SECONDS = 900; // 15 minutes

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

    // Auth verified - serve the per-user cache when warm.
    const cacheKey = `me:mentor:${decoded.id}`;
    const cached = await cacheGet(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const mentor = await Mentor2.findOne({ userId: decoded.id })
      .populate("userId", "username email age gender")
      .lean();

    // If mentor does not exist, return JSON (never redirect an API call to an
    // HTML page - cross-origin fetch follows cannot read it and CORS blocks it)
    if (!mentor) {
      return NextResponse.json(
        { success: false, data: null, error: "Mentor profile not found" },
        { status: 404 }
      );
    }

    const payload = { success: true, data: mentor };
    await cacheSet(cacheKey, payload, MENTORDATA_TTL_SECONDS);

    return NextResponse.json(payload);
  } catch (error: any) {
    console.error("Error fetching mentor profile:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
