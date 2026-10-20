import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { dbConnect } from '@/lib/mongodb';
import { getAuthUserId } from '@/lib/auth';
import User from '@/models/User';

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "No token found" }, { status: 401 });
  }

  try {
    await dbConnect();
    const user = await User.findById(userId).select('username email age gender').lean();

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      _id: String(user._id),
      username: user.username,
      email: user.email,
      age: user.age,
      gender: user.gender,
    });
  } catch (error) {
    console.error('JWT verification error:', error);
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}
