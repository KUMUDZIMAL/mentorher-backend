import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const response = NextResponse.next();
  response.headers.set('Access-Control-Allow-Origin', 'https://mentorher.vercel.app');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  return response;
}

export const config = {
  matcher: '/api/:path*',
};
