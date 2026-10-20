import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

const PING_TIMEOUT_MS = 3000;

export async function GET() {
  const check = async () => {
    if (mongoose.connection.readyState !== 1) {
      await dbConnect();
    }
    const db = mongoose.connection.db;
    if (!db) throw new Error("MongoDB connection has no database handle");
    await db.admin().ping();
  };

  const attempt = check();
  attempt.catch(() => {});
  const ok = await Promise.race([
    attempt.then(() => true).catch(() => false),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), PING_TIMEOUT_MS)),
  ]);

  return NextResponse.json(
    { status: ok ? "ok" : "degraded", mongo: ok ? "ok" : "down" },
    {
      status: ok ? 200 : 503,
      headers: { "cache-control": "no-store" },
    }
  );
}
