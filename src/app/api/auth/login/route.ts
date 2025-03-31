import { NextResponse } from 'next/server';
import { dbConnect } from '../../../../lib/mongodb';
import User from '@/models/User';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';

const SECRET_KEY = process.env.JWT_SECRET || 'your_secret_key';

// CORS configuration options
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://mentorher-frontend.vercel.app',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  // If needed: 'Access-Control-Allow-Credentials': 'true'
};

// Handle preflight OPTIONS requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function POST(req: Request) {
  // Set CORS headers on the response
  const responseHeaders = { ...corsHeaders };

  // Parse the incoming JSON body for credentials.
  const { username, password }: { username: string; password: string } = await req.json();

  if (!username || !password) {
    return new NextResponse(
      JSON.stringify({ error: 'Missing credentials' }),
      { status: 400, headers: responseHeaders }
    );
  }

  // Ensure the database connection is established.
  await dbConnect();

  // Find the user by username.
  const user = await User.findOne({ username });

  if (!user) {
    return new NextResponse(
      JSON.stringify({ error: 'Invalid credentials' }),
      { status: 401, headers: responseHeaders }
    );
  }

  // Validate the provided password.
  const isPasswordValid = await bcrypt.compare(password, user.password);

  if (!isPasswordValid) {
    return new NextResponse(
      JSON.stringify({ error: 'Invalid credentials' }),
      { status: 401, headers: responseHeaders }
    );
  }

  // Create the JWT using jose, converting user._id to a string.
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
    maxAge: 3600 
  });
  
  // Add CORS headers to the final response
  Object.entries(responseHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}
