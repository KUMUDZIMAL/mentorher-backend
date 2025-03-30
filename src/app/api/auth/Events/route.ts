// app/api/auth/Events/route.ts (or appropriate path)
import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import jwt, { JwtPayload } from 'jsonwebtoken';
import User from '@/models/User';
import Registration from '@/models/Registration';

export async function GET(req: NextRequest) {
  // Retrieve the token from cookies
  const token = req.cookies.get('token')?.value;
  if (!token) {
    return NextResponse.json({ error: "No token found" }, { status: 401 });
  }

  try {
    // Decode the JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;
    if (!decoded || !decoded.id) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Get the user (if needed)
    const user = await User.findById(decoded.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Fetch all events registered by the user as an array
    const events = await Registration.find({ userId: decoded.id });

    return NextResponse.json({ events });
  } catch (error) {
    console.error("JWT verification error:", error);
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}
