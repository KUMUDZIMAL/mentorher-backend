import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MemoryRedis } from "./memory-redis";

// Replace ioredis with the in-memory stub before cache.ts is imported.
vi.mock("ioredis", () => {
  return {
    default: class MockRedis extends MemoryRedis {
      constructor(_url: string, _opts?: unknown) {
        super();
      }
    },
  };
});

process.env.REDIS_URL = "redis://127.0.0.1:6379";
process.env.REDIS_ENABLED = "true";

import {
  cacheGet,
  cacheSet,
  cacheDel,
  getVersion,
  bumpVersion,
  closeCache,
} from "../cache";

/** Grab (and lazily initialise) the stub instance held by the cache module. */
async function stub(): Promise<MemoryRedis> {
  // Any helper call initialises the shared client on first use.
  await cacheSet("__init__", 1, 5);
  const client = (globalThis as any).__mentorherRedis?.client;
  if (!client) throw new Error("cache client not initialised");
  return client as MemoryRedis;
}

beforeEach(async () => {
  await closeCache();
  process.env.REDIS_URL = "redis://127.0.0.1:6379";
  process.env.REDIS_ENABLED = "true";
});

afterEach(async () => {
  await closeCache();
});

describe("cacheGet / cacheSet", () => {
  it("misses on empty cache", async () => {
    expect(await cacheGet("k1")).toBeNull();
  });

  it("hits after set", async () => {
    await cacheSet("k2", { hello: "world" }, 60);
    expect(await cacheGet("k2")).toEqual({ hello: "world" });
  });

  it("misses after TTL expiry (simulated clock)", async () => {
    await cacheSet("k3", { n: 1 }, 5); // 5 s TTL
    expect(await cacheGet("k3")).toEqual({ n: 1 });
    (await stub()).advance(6_000); // jump past TTL
    expect(await cacheGet("k3")).toBeNull();
  });

  it("round-trips arrays and nested JSON", async () => {
    const value = { recommendations: [{ mentor: { _id: "a" }, similarity: 0.5 }] };
    await cacheSet("k4", value, 60);
    expect(await cacheGet("k4")).toEqual(value);
  });
});

describe("cacheDel", () => {
  it("removes one key", async () => {
    await cacheSet("k5", 1, 60);
    await cacheDel("k5");
    expect(await cacheGet("k5")).toBeNull();
  });

  it("removes multiple keys", async () => {
    await cacheSet("a", 1, 60);
    await cacheSet("b", 2, 60);
    await cacheDel("a", "b");
    expect(await cacheGet("a")).toBeNull();
    expect(await cacheGet("b")).toBeNull();
  });

  it("is a no-op for unknown keys", async () => {
    await expect(cacheDel("ghost")).resolves.toBeUndefined();
  });
});

describe("version invalidation", () => {
  it("starts at 0 and bumps", async () => {
    expect(await getVersion("mentors")).toBe(0);
    await bumpVersion("mentors");
    expect(await getVersion("mentors")).toBe(1);
  });

  it("versioned keys miss after bump (old entries left to expire)", async () => {
    const v1 = await getVersion("mentors");
    await cacheSet(`mentors:list:${v1}`, { success: true }, 300);
    expect(await cacheGet(`mentors:list:${v1}`)).toEqual({ success: true });

    await bumpVersion("mentors"); // invalidation

    const v2 = await getVersion("mentors");
    expect(v2).toBe(v1 + 1);
    expect(await cacheGet(`mentors:list:${v2}`)).toBeNull(); // new namespace is cold
  });

  it("namespaces are independent", async () => {
    await bumpVersion("mentors");
    expect(await getVersion("mentors")).toBe(1);
    expect(await getVersion("events")).toBe(0);
  });
});

describe("graceful Redis failure", () => {
  it("cacheGet returns null (miss) when Redis throws", async () => {
    await cacheSet("k6", { a: 1 }, 60);
    (await stub()).failNext = true;
    expect(await cacheGet("k6")).toBeNull();
  });

  it("cacheSet swallows errors without throwing", async () => {
    (await stub()).failNext = true;
    await expect(cacheSet("k7", 1, 60)).resolves.toBeUndefined();
  });

  it("cacheDel swallows errors without throwing", async () => {
    (await stub()).failNext = true;
    await expect(cacheDel("k7")).resolves.toBeUndefined();
  });

  it("bumpVersion / getVersion degrade to safe defaults", async () => {
    (await stub()).failNext = true;
    await expect(bumpVersion("mentors")).resolves.toBeUndefined();
    expect(await getVersion("mentors")).toBe(0); // treats as version 0 - cache serves stale until TTL
  });

  it("recovers when Redis comes back", async () => {
    (await stub()).failNext = true;
    expect(await cacheGet("k8")).toBeNull();
    (await stub()).failNext = false;
    await cacheSet("k8", { ok: true }, 60);
    expect(await cacheGet("k8")).toEqual({ ok: true });
  });
});

describe("disabled mode", () => {
  it("does nothing when REDIS_ENABLED=false", async () => {
    await closeCache();
    process.env.REDIS_ENABLED = "false";

    await expect(cacheSet("k9", 1, 60)).resolves.toBeUndefined();
    expect(await cacheGet("k9")).toBeNull();
    await expect(cacheDel("k9")).resolves.toBeUndefined();
    expect(await getVersion("x")).toBe(0);
    await expect(bumpVersion("x")).resolves.toBeUndefined();
  });

  it("does nothing when REDIS_URL is unset", async () => {
    await closeCache();
    process.env.REDIS_ENABLED = "true";
    delete process.env.REDIS_URL;

    expect(await cacheGet("k10")).toBeNull();
    await expect(cacheSet("k10", 1, 60)).resolves.toBeUndefined();
  });
});

