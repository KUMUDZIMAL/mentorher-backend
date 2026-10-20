/**
 * Minimal in-memory Redis stand-in for unit tests.
 * Implements just the commands cache.ts uses: GET / SET EX / DEL / INCR.
 * Supports manual clock advance to test TTL expiry without waiting.
 */
export class MemoryRedis {
  private store = new Map<string, { value: string; expiresAt?: number }>();
  private clock = Date.now();
  failNext = false; // when true, every command throws (simulates Redis down)

  private checkFailure() {
    if (this.failNext) {
      throw new Error("Connection is closed.");
    }
  }

  /** Advance the fake clock (ms) so TTLs can expire instantly in tests. */
  advance(ms: number) {
    this.clock += ms;
  }

  private alive(entry?: { expiresAt?: number }) {
    return entry && (entry.expiresAt === undefined || entry.expiresAt > this.clock);
  }

  async get(key: string): Promise<string | null> {
    this.checkFailure();
    const entry = this.store.get(key);
    if (!this.alive(entry)) {
      this.store.delete(key);
      return null;
    }
    return entry!.value;
  }

  async set(key: string, value: string, mode?: string, ttl?: number): Promise<"OK"> {
    this.checkFailure();
    let expiresAt: number | undefined;
    if (mode === "EX" && typeof ttl === "number") {
      expiresAt = this.clock + ttl * 1000;
    }
    this.store.set(key, { value, expiresAt });
    return "OK";
  }

  async del(...keys: string[]): Promise<number> {
    this.checkFailure();
    let removed = 0;
    for (const key of keys) {
      if (this.store.delete(key)) removed++;
    }
    return removed;
  }

  async incr(key: string): Promise<number> {
    this.checkFailure();
    const entry = this.alive(this.store.get(key)) ? this.store.get(key) : undefined;
    const next = (entry ? parseInt(entry.value, 10) || 0 : 0) + 1;
    this.store.set(key, { value: String(next) });
    return next;
  }

  async quit(): Promise<"OK"> {
    return "OK";
  }

  disconnect() {}

  on() {
    return this;
  }

  /** Test helper: raw key count (ignoring TTLs for simplicity). */
  get size() {
    return this.store.size;
  }

  has(key: string) {
    return this.alive(this.store.get(key));
  }
}
