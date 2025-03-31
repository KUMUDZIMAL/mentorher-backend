import NextCors from 'nextjs-cors';
import { NextResponse } from 'next/server';
import { dbConnect } from '../../../../lib/mongodb';
import User from '@/models/User';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';

const SECRET_KEY = process.env.JWT_SECRET || 'your_secret_key';

// OPTIONS handler for preflight requests.
export async function OPTIONS(req: Request) {
  // Create a dummy response to allow NextCors to set headers.
  const dummyRes = new Response();
  await NextCors(req, dummyRes, {
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
    origin: 'https://mentorher-frontend.vercel.app',
    optionsSuccessStatus: 200,
  });
  return new NextResponse(null, { status: 204, headers: dummyRes.headers });
}

export async function POST(req: Request) {
  // Create a dummy response to allow NextCors to set headers.
  const dummyRes = new Response();
  await NextCors(req, dummyRes, {
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
    origin: 'https://mentorher-frontend.vercel.app',
    optionsSuccessStatus: 200,
  });

  // Retrieve the CORS headers set by NextCors.
  const corsHeaders = dummyRes.headers;

  try {
    const { username, password } = await req.json();
    if (!username || !password) {
      return new NextResponse(
        JSON.stringify({ error: 'Missing credentials' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Ensure DB connection.
    await dbConnect();

    // Find user.
    const user = await User.findOne({ username });
    if (!user) {
      return new NextResponse(
        JSON.stringify({ error: 'Invalid credentials' }),
        { status: 401, headers: corsHeaders }
      );
    }

    // Validate password.
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return new NextResponse(
        JSON.stringify({ error: 'Invalid credentials' }),
        { status: 401, headers: corsHeaders }
      );
    }

    // Create JWT.
    const token = await new SignJWT({ id: String(user._id) })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(SECRET_KEY));

    // Prepare final response.
    const response = NextResponse.json({ message: 'Login successful' }, { status: 200 });
    response.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 3600,
    });

    // Apply CORS headers from dummyRes.
    corsHeaders.forEach((value, key) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error) {
    console.error('Error in POST:', error);
    return new NextResponse(
      JSON.stringify({ error: 'Internal Server Error' }),
      { status: 500, headers: corsHeaders }
    );
  }
}
