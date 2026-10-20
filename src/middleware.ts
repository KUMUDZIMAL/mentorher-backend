import { NextRequest, NextResponse } from 'next/server';

// Origins allowed to call the API with credentials.
// CORS_ORIGINS (comma-separated) extends this list at runtime, e.g. for the
// Docker Compose frontend running on a non-default host port.
const allowedOrigins = [
  'https://mentorher.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  ...((process.env['CORS_ORIGINS'] ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)),
];

function corsHeaders(origin: string | null): Record<string, string> {
  const allowOrigin = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };
}

export function middleware(req: NextRequest) {
  const origin = req.headers.get('origin');
  const headers = corsHeaders(origin);

  // Answer CORS preflight directly so PATCH/DELETE etc. are allowed.
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers });
  }

  const response = NextResponse.next();
  Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
  return response;
}

export const config = {
  matcher: '/api/:path*',
};
