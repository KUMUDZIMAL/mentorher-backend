// app/api/auth/login/route.ts
import { NextResponse } from 'next/server';
import { dbConnect } from '../../../../lib/mongodb';
import User from '@/models/User';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';

const SECRET_KEY = process.env.JWT_SECRET || 'your_secret_key';
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://mentorher-frontend.vercel.app',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'true',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json();
    if (!username || !password) {
      return new NextResponse(JSON.stringify({ error: 'Missing credentials' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    await dbConnect();
    const user = await User.findOne({ username });
    if (!user) {
      return new NextResponse(JSON.stringify({ error: 'Invalid credentials' }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return new NextResponse(JSON.stringify({ error: 'Invalid credentials' }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const token = await new SignJWT({ id: String(user._id) })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(SECRET_KEY));

    const response = NextResponse.json({ message: 'Login successful' }, { status: 200 });
    response.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 3600,
    });
    
    // Set CORS headers on the response
    for (const [key, value] of Object.entries(corsHeaders)) {
      response.headers.set(key, value);
    }

    return response;
  } catch (error) {
    console.error('Error in POST:', error);
    return new NextResponse(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}
