import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import UserProfile from '@/models/userProfile';

// Connect to MongoDB
const connectDB = async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI!);
  }
};

export async function GET(req: NextRequest) {
  try {
    // Connect to database
    await connectDB();
  } catch (error) {
    return NextResponse.json(
      { error: "Database connection failed" },
      { status: 500 }
    );
  }

  const token = req.cookies.get('token')?.value;
  if (!token) {
    return NextResponse.json(
      { error: "Authorization required" },
      { status: 401 }
    );
  }

  try {
    // Verify and decode token
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string };

    // Find user profile using the user reference
    const userProfile = await UserProfile.findOne({ userId: decoded.id });

    if (!userProfile) {
      // Return default profile data if not found
      return NextResponse.json({
        profilePicture: '',
        userId: decoded.id,
        exists: false
      });
    }

    return NextResponse.json({
      profilePicture: userProfile.profilePicture,
      userId: decoded.id,
      exists: true
    });

  } catch (error) {
    console.error("Profile fetch error:", error);
    
    // Handle specific JWT errors
    if (error instanceof jwt.TokenExpiredError) {
      return NextResponse.json(
        { error: "Session expired" },
        { status: 401 }
      );
    }
    
    if (error instanceof jwt.JsonWebTokenError) {
      return NextResponse.json(
        { error: "Invalid token" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}