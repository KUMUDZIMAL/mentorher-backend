import { NextRequest } from "next/server";
import jwt, { JwtPayload } from "jsonwebtoken";

const JWT_SECRET = () => process.env.JWT_SECRET || "your_secret_key";

/**
 * Verifies the JWT session cookie and returns the authenticated user's id,
 * or null when the request is unauthenticated / the token is invalid.
 */
export function getAuthUserId(req: NextRequest): string | null {
  const token = req.cookies.get("token")?.value;
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, JWT_SECRET()) as JwtPayload;
    if (!decoded || !decoded.id) return null;
    return String(decoded.id);
  } catch {
    return null;
  }
}
