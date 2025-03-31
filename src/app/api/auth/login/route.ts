import { NextResponse } from 'next/server';
import { dbConnect } from '../../../../lib/mongodb';
import User from '@/models/User';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';

const SECRET_KEY = process.env.JWT_SECRET || 'your_secret_key';

// Define CORS headers (must use an explicit origin when sending credentials)
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://mentorher-frontend.vercel.app',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'true',
};

// OPTIONS handler for preflight requests
export async function OPTIONS(req: Request) {
  console.log("OPTIONS preflight request received");
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

// POST handler for login requests
export async function POST(req: Request) {
  try {
    // Parse the incoming JSON body for credentials.
    const { username, password } = await req.json();
    
    if (!username || !password) {
      return new NextResponse(
        JSON.stringify({ error: 'Missing credentials' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Ensure the database connection is established.
    await dbConnect();

    // Find the user by username.
    const user = await User.findOne({ username });
    console.log('User found:', Boolean(user));
    if (!user) {
      return new NextResponse(
        JSON.stringify({ error: 'Invalid credentials' }),
        { status: 401, headers: corsHeaders }
      );
    }

    // Validate the provided password.
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return new NextResponse(
        JSON.stringify({ error: 'Invalid credentials' }),
        { status: 401, headers: corsHeaders }
      );
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
      sameSite: 'none', // Allow cross-site cookie
      maxAge: 3600 
    });

    // Apply the CORS headers to the response.
    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error) {
    console.error('Error in POST /api/auth/login:', error);
    return new NextResponse(
      JSON.stringify({ error: 'Internal Server Error' }),
      { status: 500, headers: corsHeaders }
    );
  }
}
