import { EventEmitter } from "node:events";
import Redis from "ioredis";
import { attachDatabasePool } from "@vercel/functions";

/**
 * Minimal store abstraction used by the game server.
 * - `IoRedisStore` for production (Upstash / any Redis via REDIS_URL, TLS ok).
 * - `MemoryStore` for local dev + tests when REDIS_URL is not set (single process only).
 */
export interface Store {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec: number): Promise<void>;
  del(key: string): Promise<void>;
  rpush(key: string, values: string[], ttlSec: number): Promise<void>;
  lrange(key: string): Promise<string[]>;
  publish(channel: string, message: string): Promise<void>;
  /** Subscribe to a channel; returns an unsubscribe function. */
  subscribe(channel: string, handler: (message: string) => void): Promise<() => void>;
  /** SET NX PX lock. Returns a token on success, null if held by someone else. */
  acquireLock(key: string, ttlMs: number): Promise<string | null>;
  releaseLock(key: string, token: string): Promise<void>;
}

const CHANNEL_PATTERN = "room:*";

class MemoryStore implements Store {
  private kv = new Map<string, { value: string; expires: number }>();
  private lists = new Map<string, { values: string[]; expires: number }>();
  private bus = new EventEmitter();

  constructor() {
    this.bus.setMaxListeners(0);
  }

  private sweep(now = Date.now()) {
    for (const [k, v] of this.kv) if (v.expires <= now) this.kv.delete(k);
    for (const [k, v] of this.lists) if (v.expires <= now) this.lists.delete(k);
  }

  async get(key: string) {
    this.sweep();
    return this.kv.get(key)?.value ?? null;
  }
  async set(key: string, value: string, ttlSec: number) {
    this.kv.set(key, { value, expires: Date.now() + ttlSec * 1000 });
  }
  async del(key: string) {
    this.kv.delete(key);
    this.lists.delete(key);
  }
  async rpush(key: string, values: string[], ttlSec: number) {
    this.sweep();
    const entry = this.lists.get(key) ?? { values: [], expires: 0 };
    entry.values.push(...values);
    entry.expires = Date.now() + ttlSec * 1000;
    this.lists.set(key, entry);
  }
  async lrange(key: string) {
    this.sweep();
    return [...(this.lists.get(key)?.values ?? [])];
  }
  async publish(channel: string, message: string) {
    // Deliver asynchronously to mimic a network bus.
    setImmediate(() => this.bus.emit(channel, message));
  }
  async subscribe(channel: string, handler: (message: string) => void) {
    this.bus.on(channel, handler);
    return () => {
      this.bus.off(channel, handler);
    };
  }
  async acquireLock(key: string, ttlMs: number) {
    this.sweep();
    if (this.kv.has(key)) return null;
    const token = Math.random().toString(36).slice(2);
    this.kv.set(key, { value: token, expires: Date.now() + ttlMs });
    return token;
  }
  async releaseLock(key: string, token: string) {
    if (this.kv.get(key)?.value === token) this.kv.delete(key);
  }
}

const RELEASE_LUA = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;

class IoRedisStore implements Store {
  private client: Redis;
  private sub: Redis | null = null;
  private bus = new EventEmitter();
  private subReady: Promise<void> | null = null;

  constructor(url: string) {
    this.client = new Redis(url, {
      maxRetriesPerRequest: 3,
      enableAutoPipelining: true,
      lazyConnect: false,
    });
    this.client.on("error", (e) => console.error("[redis] client error", e.message));
    try {
      // Lets Fluid Compute release idle connections before suspending an instance.
      attachDatabasePool(this.client as unknown as Parameters<typeof attachDatabasePool>[0]);
    } catch {
      /* helper does not recognise this ioredis version; connections still close on their own */
    }
    this.bus.setMaxListeners(0);
  }

  private async ensureSubscriber() {
    if (this.subReady) return this.subReady;
    this.subReady = (async () => {
      const sub = this.client.duplicate();
      sub.on("error", (e) => console.error("[redis] subscriber error", e.message));
      sub.on("pmessage", (_pattern: string, channel: string, message: string) => {
        this.bus.emit(channel, message);
      });
      // ioredis re-subscribes automatically after reconnects.
      await sub.psubscribe(CHANNEL_PATTERN);
      this.sub = sub;
    })();
    return this.subReady;
  }

  async get(key: string) {
    return this.client.get(key);
  }
  async set(key: string, value: string, ttlSec: number) {
    await this.client.set(key, value, "EX", ttlSec);
  }
  async del(key: string) {
    await this.client.del(key);
  }
  async rpush(key: string, values: string[], ttlSec: number) {
    if (!values.length) return;
    await this.client.multi().rpush(key, ...values).expire(key, ttlSec).exec();
  }
  async lrange(key: string) {
    return this.client.lrange(key, 0, -1);
  }
  async publish(channel: string, message: string) {
    await this.client.publish(channel, message);
  }
  async subscribe(channel: string, handler: (message: string) => void) {
    await this.ensureSubscriber();
    this.bus.on(channel, handler);
    return () => {
      this.bus.off(channel, handler);
    };
  }
  async acquireLock(key: string, ttlMs: number) {
    const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const ok = await this.client.set(key, token, "PX", ttlMs, "NX");
    return ok === "OK" ? token : null;
  }
  async releaseLock(key: string, token: string) {
    await this.client.eval(RELEASE_LUA, 1, key, token);
  }
}

declare global {
  var __pictionaryStore: Store | undefined;
}

export function getStore(): Store {
  if (globalThis.__pictionaryStore) return globalThis.__pictionaryStore;
  const url = process.env.REDIS_URL || process.env.KV_URL || process.env.UPSTASH_REDIS_URL;
  const store: Store = url ? new IoRedisStore(url) : new MemoryStore();
  if (!url) {
    console.warn("[pictionary] REDIS_URL not set — using in-memory store (single process only)");
  }
  globalThis.__pictionaryStore = store;
  return store;
}

export function isMemoryStore(): boolean {
  return getStore() instanceof MemoryStore;
}
