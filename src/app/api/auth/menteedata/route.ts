import { NextResponse, NextRequest } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import Mentee from "@/models/Mentee";
import jwt, { JwtPayload } from "jsonwebtoken";
import { cacheGet, cacheSet } from "@/lib/cache";

const MENTEEDATA_TTL_SECONDS = 900; // 15 minutes

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

    // Auth verified - serve the per-user cache when warm.
    const cacheKey = `me:mentee:${decoded.id}`;
    const cached = await cacheGet(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Find mentee document by matching userId and convert to plain object using lean()
    const mentee = await Mentee.findOne({ userId: decoded.id })
      .populate("userId", "username email age gender")
      .lean();

    // If mentee does not exist, return JSON (never redirect an API call to an
    // HTML page - cross-origin fetch follows cannot read it and CORS blocks it)
    if (!mentee) {
      return NextResponse.json(
        { success: false, data: null, error: "Mentee profile not found" },
        { status: 404 }
      );
    }

    // Return the mentee data if found
    const payload = { success: true, data: mentee };
    await cacheSet(cacheKey, payload, MENTEEDATA_TTL_SECONDS);

    return NextResponse.json(payload);
  } catch (error: any) {
    console.error("Error fetching mentee profile:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
