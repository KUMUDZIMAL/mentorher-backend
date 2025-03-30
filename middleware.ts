import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const SECRET_KEY = process.env.JWT_SECRET || 'your_secret_key';

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('token')?.value;

  // If no token, redirect to login
  if (!token) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  try {
    // Verify the JWT token using jose
    await jwtVerify(token, new TextEncoder().encode(SECRET_KEY));
    return NextResponse.next(); // Proceed to the requested route
  } catch (error) {
    console.error('Invalid token:', error);
    return NextResponse.redirect(new URL('/auth/login', request.url)); // Redirect to login on error
  }
}

// Protect specific routes
export const config = {
  matcher: ['/Become-mentee','/BecomeMentor','/recommendations/:userId','/create-group','/profile/mentee','/profile/mentor','/room'], // Protect these routes
};