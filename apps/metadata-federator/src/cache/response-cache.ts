import Database from "better-sqlite3";
import type { Database as DB } from "better-sqlite3";
import path from "node:path";
import crypto from "node:crypto";

// ─── SQLite Response Cache ────────────────────────────────────────────────────
// Caches raw upstream API responses keyed by endpoint + normalized params.
// TTL is enforced on read (lazy expiry) and on periodic cleanup.

export interface CacheEntry {
  key: string;
  data: string; // serialized JSON
  created_at: number;
  ttl_seconds: number;
}

export class ResponseCache {
  private db: DB;
  private defaultTtl: number;

  constructor(dbPath: string, defaultTtlSeconds = 3600) {
    const resolved = path.resolve(dbPath);
    this.db = new Database(resolved);
    this.defaultTtl = defaultTtlSeconds;
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS response_cache (
        key          TEXT PRIMARY KEY,
        data         TEXT NOT NULL,
        created_at   INTEGER NOT NULL,
        ttl_seconds  INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_created_at ON response_cache(created_at);
    `);
  }

  /** Build a deterministic cache key from an endpoint and params. */
  static buildKey(endpoint: string, params: Record<string, unknown>): string {
    const normalized = JSON.stringify(params, Object.keys(params).sort());
    const hash = crypto
      .createHash("sha256")
      .update(`${endpoint}:${normalized}`)
      .digest("hex")
      .slice(0, 16);
    return `${endpoint}:${hash}`;
  }

  get<T>(key: string): T | null {
    const row = this.db
      .prepare<[string], CacheEntry>(
        "SELECT * FROM response_cache WHERE key = ?"
      )
      .get(key);

    if (!row) return null;

    const now = Math.floor(Date.now() / 1000);
    if (now - row.created_at > row.ttl_seconds) {
      // Lazy expiry
      this.db.prepare("DELETE FROM response_cache WHERE key = ?").run(key);
      return null;
    }

    return JSON.parse(row.data) as T;
  }

  set(key: string, data: unknown, ttlSeconds = this.defaultTtl): void {
    const now = Math.floor(Date.now() / 1000);
    this.db
      .prepare(
        `INSERT OR REPLACE INTO response_cache (key, data, created_at, ttl_seconds)
         VALUES (?, ?, ?, ?)`
      )
      .run(key, JSON.stringify(data), now, ttlSeconds);
  }

  /** Prune all expired entries. Call periodically or on startup. */
  prune(): number {
    const now = Math.floor(Date.now() / 1000);
    const result = this.db
      .prepare(
        "DELETE FROM response_cache WHERE (created_at + ttl_seconds) < ?"
      )
      .run(now);
    return result.changes;
  }

  close(): void {
    this.db.close();
  }
}
