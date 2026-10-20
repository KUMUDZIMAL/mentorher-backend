import { NextResponse } from 'next/server';
import { dbConnect } from '../../../../lib/mongodb';
import User from '@/models/User';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';

const SECRET_KEY = process.env.JWT_SECRET || 'your_secret_key';

// CORS (including preflights and origin echoing) is handled globally in middleware.ts.

// POST handler for login requests
export async function POST(req: Request) {
  try {
    // Parse the incoming JSON body for credentials.
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json({ error: 'Missing credentials' }, { status: 400 });
    }

    // Ensure the database connection is established.
    await dbConnect();

    // Find the user by username.
    const user = await User.findOne({ username });
    console.log('User found:', Boolean(user));
    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Validate the provided password.
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Create the JWT using jose.
    const token = await new SignJWT({ id: String(user._id) })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(SECRET_KEY));

    // Prepare the response with the token set in an HTTP-only cookie.
    const response = NextResponse.json({ message: 'Login successful' }, { status: 200 });
    response.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      // Browsers reject SameSite=None unless Secure is set, so local http
      // dev uses Lax (localhost:3000 -> :3001 is same-site). Production is
      // cross-site (mentorher.vercel.app -> mentorher-backend.vercel.app).
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 3600
    });

    return response;
  } catch (error) {
    console.error('Error in POST /api/auth/login:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
