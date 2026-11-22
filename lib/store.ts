import { Redis } from "@upstash/redis";

/**
 * Almacenamiento mínimo que necesita el bot: claves con vencimiento y listas cortas.
 * En producción usa Upstash Redis (o Vercel KV, que es lo mismo); sin credenciales
 * usa memoria (sirve para probar en tu compu, no para producción).
 */
export interface Store {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, opts?: { ttlSeconds?: number; onlyIfNew?: boolean }): Promise<boolean>;
  del(key: string): Promise<void>;
  /** Agrega al final y deja solo los últimos `max` elementos. */
  pushTrim(key: string, value: string, max: number, ttlSeconds: number): Promise<void>;
  list(key: string): Promise<string[]>;
  ttl(key: string): Promise<number>;
}

export class MemoryStore implements Store {
  private data = new Map<string, { v: string | string[]; exp: number | null }>();
  constructor(private now: () => number = Date.now) {}

  private live(key: string) {
    const e = this.data.get(key);
    if (!e) return undefined;
    if (e.exp !== null && e.exp <= this.now()) {
      this.data.delete(key);
      return undefined;
    }
    return e;
  }
  async get(key: string) {
    const e = this.live(key);
    return typeof e?.v === "string" ? e.v : null;
  }
  async set(key: string, value: string, opts: { ttlSeconds?: number; onlyIfNew?: boolean } = {}) {
    if (opts.onlyIfNew && this.live(key)) return false;
    this.data.set(key, { v: value, exp: opts.ttlSeconds ? this.now() + opts.ttlSeconds * 1000 : null });
    return true;
  }
  async del(key: string) {
    this.data.delete(key);
  }
  async pushTrim(key: string, value: string, max: number, ttlSeconds: number) {
    const e = this.live(key);
    const arr = Array.isArray(e?.v) ? [...e.v, value] : [value];
    this.data.set(key, { v: arr.slice(-max), exp: this.now() + ttlSeconds * 1000 });
  }
  async list(key: string) {
    const e = this.live(key);
    return Array.isArray(e?.v) ? [...e.v] : [];
  }
  async ttl(key: string) {
    const e = this.live(key);
    if (!e) return -2;
    if (e.exp === null) return -1;
    return Math.ceil((e.exp - this.now()) / 1000);
  }
}

export class RedisStore implements Store {
  constructor(private redis: Redis) {}
  async get(key: string) {
    const v = await this.redis.get<string>(key);
    return v ?? null;
  }
  async set(key: string, value: string, opts: { ttlSeconds?: number; onlyIfNew?: boolean } = {}) {
    const r = opts.ttlSeconds
      ? opts.onlyIfNew
        ? await this.redis.set(key, value, { ex: opts.ttlSeconds, nx: true })
        : await this.redis.set(key, value, { ex: opts.ttlSeconds })
      : opts.onlyIfNew
        ? await this.redis.set(key, value, { nx: true })
        : await this.redis.set(key, value);
    return r === "OK";
  }
  async del(key: string) {
    await this.redis.del(key);
  }
  async pushTrim(key: string, value: string, max: number, ttlSeconds: number) {
    const p = this.redis.pipeline();
    p.rpush(key, value);
    p.ltrim(key, -max, -1);
    p.expire(key, ttlSeconds);
    await p.exec();
  }
  async list(key: string) {
    return (await this.redis.lrange<string>(key, 0, -1)) ?? [];
  }
  async ttl(key: string) {
    return this.redis.ttl(key);
  }
}

let shared: Store | null = null;

export function getStore(env = process.env): Store {
  if (shared) return shared;
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (url && token) {
    shared = new RedisStore(new Redis({ url, token, automaticDeserialization: false }));
  } else {
    if (env.NODE_ENV === "production") {
      console.warn("[store] Sin base de datos configurada: usando memoria. Cargá UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN.");
    }
    shared = new MemoryStore();
  }
  return shared;
}
