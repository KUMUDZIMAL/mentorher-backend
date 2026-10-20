import Redis from "ioredis";

/**
 * Redis cache layer for MentorHer.
 *
 * - Lazy singleton client (same global pattern as the mongoose connection).
 * - Every helper swallows Redis errors: on failure we log a warning once and
 *   behave as a cache miss so MongoDB always serves the request.
 * - Only public/read-heavy JSON payloads belong here. Never cache tokens,
 *   cookies, or raw auth material.
 *
 * Env:
 *   REDIS_URL       e.g. redis://127.0.0.1:6379  (unset => caching disabled)
 *   REDIS_ENABLED   "false" to hard-disable caching
 */

interface RedisGlobal {
  client?: Redis | null;
  warned?: boolean;
}
declare global {
  var __mentorherRedis: RedisGlobal | undefined;
}
const g: RedisGlobal = (globalThis.__mentorherRedis ??= {});

/** Returns a shared client, or null when caching is off/unavailable. */
function getClient(): Redis | null {
  // Read env at call time so tests (and restart-free toggles) work.
  if (process.env.REDIS_ENABLED === "false") return null;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (g.client === undefined) {
    try {
      const client = new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        connectTimeout: 2000,
        retryStrategy: (times) => Math.min(times * 500, 5000),
      });
      client.on("error", (err) => {
        if (!g.warned) {
          g.warned = true;
          console.warn("[cache] Redis error — continuing without cache:", err.message);
        }
      });
      client.on("ready", () => {
        if (g.warned) console.info("[cache] Redis reconnected");
        g.warned = false;
      });
      g.client = client;
    } catch (err: any) {
      console.warn("[cache] Failed to create Redis client:", err?.message);
      g.client = null;
    }
  }
  return g.client;
}

function warnOnce(err: unknown) {
  if (!g.warned) {
    g.warned = true;
    console.warn("[cache] Operation failed — serving from DB:", err instanceof Error ? err.message : err);
  }
}

/** JSON cache get. Returns null on miss, error, or disabled cache. */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = getClient();
  if (!client) return null;
  try {
    const raw = await client.get(key);
    if (raw == null) return null;
    return JSON.parse(raw) as T;
  } catch (err) {
    warnOnce(err);
    return null;
  }
}

/** JSON cache set with TTL (seconds). No-op when cache is off. */
export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    await client.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (err) {
    warnOnce(err);
  }
}

/** Delete one or more keys. Never throws. */
export async function cacheDel(...keys: string[]): Promise<void> {
  const client = getClient();
  if (!client || keys.length === 0) return;
  try {
    await client.del(...keys);
  } catch (err) {
    warnOnce(err);
  }
}

/**
 * Versioned namespace: keys embed the version so invalidation is a single INCR
 * (old entries simply expire via TTL — no key scanning required).
 */
export async function getVersion(namespace: string): Promise<number> {
  const client = getClient();
  if (!client) return 0;
  try {
    const v = await client.get(`ver:${namespace}`);
    return v ? parseInt(v, 10) || 0 : 0;
  } catch (err) {
    warnOnce(err);
    return 0;
  }
}

/** Bump the namespace version, invalidating every key that embeds it. */
export async function bumpVersion(namespace: string): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    await client.incr(`ver:${namespace}`);
  } catch (err) {
    warnOnce(err);
  }
}

/** Test/ops helper: drop the shared client so the next call re-initialises. */
export async function closeCache(): Promise<void> {
  const client = g.client;
  g.client = undefined;
  g.warned = false;
  if (client) {
    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
  }
}
