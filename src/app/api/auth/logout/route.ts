import { NextResponse } from "next/server";
import { serialize } from "cookie";

export async function POST() {
  try {
    // Clear the session or authentication token (cookie).
    // Attributes must match how login sets it, or the browser won't delete it.
    const cookie = serialize("token", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      expires: new Date(0),
      path: "/",
    });

    const response = NextResponse.json({ message: "Logged out successfully" });
    response.headers.set("Set-Cookie", cookie);

    return response;
  } catch (error) {
    console.error("Logout error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
