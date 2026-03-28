import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { ResponseCache } from "../cache/response-cache.js";
import { CrossrefClient } from "../services/crossref-client.js";
import { WikidataClient } from "../services/wikidata-client.js";
import { searchRoute } from "../routes/search.js";
import { resolveRoute } from "../routes/resolve.js";
import { batchRoute } from "../routes/batch.js";
import pino from "pino";

// ─── Integration Test: Full MCP Tool Flow ─────────────────────────────────────
// Uses a real Fastify instance with an in-memory SQLite cache.
// Network calls go to the live Crossref API, so these tests require connectivity.
// Mark as slow / skip in CI if no network is available.

const logger = pino({ level: "silent" });
let app: FastifyInstance;
let cache: ResponseCache;

beforeAll(async () => {
  cache = new ResponseCache(":memory:", 60);
  const crossref = new CrossrefClient({
    mailto: "test@example.com",
    cache,
    logger,
  });
  const wikidata = new WikidataClient(cache, logger);

  app = Fastify({ logger: false });
  await searchRoute(app, crossref);
  await resolveRoute(app, crossref);
  await batchRoute(app, crossref);
  await app.ready();
});

afterAll(async () => {
  await app.close();
  cache.close();
});

// Detect network availability once before the suite
let networkAvailable = false;

beforeAll(async () => {
  try {
    const { fetch } = await import("undici");
    const probe = await fetch("https://api.crossref.org/works?rows=1", {
      signal: AbortSignal.timeout(4000),
    });
    networkAvailable = probe.ok;
  } catch {
    networkAvailable = false;
  }
}, 6_000);

describe("metadata-federator integration", () => {
  it("search_works: returns normalized items for a keyword query", async () => {
    if (!networkAvailable) {
      console.log("⚠  Skipping: no network access to api.crossref.org");
      return;
    }
    const res = await app.inject({
      method: "POST",
      url: "/search",
      payload: { query: "protein structure prediction", rows: 3 },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("items");
    expect(body).toHaveProperty("pagination");
    expect(Array.isArray(body.items)).toBe(true);

    if (body.items.length > 0) {
      const item = body.items[0];
      expect(item).toHaveProperty("doi");
      expect(item).toHaveProperty("title");
      expect(item).toHaveProperty("authors");
      expect(item).toHaveProperty("raw_source", "crossref");
    }
  }, 15_000);

  it("resolve_doi: resolves a known DOI to a WorkRecord", async () => {
    if (!networkAvailable) {
      console.log("⚠  Skipping: no network access to api.crossref.org");
      return;
    }
    const res = await app.inject({
      method: "POST",
      url: "/resolve",
      payload: { doi: "10.1038/s41586-021-03819-2" },
    });

    expect(res.statusCode).toBe(200);
    const work = res.json();
    expect(work.doi).toBe("10.1038/s41586-021-03819-2");
    expect(work.title).toContain("AlphaFold");
    expect(work.raw_source).toBe("crossref");
    expect(work.year).toBe(2021);
  }, 15_000);

  it("resolve_doi: returns 400 for invalid DOI format (no network needed)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/resolve",
      payload: { doi: "not-a-valid-doi" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().type).toBe("VALIDATION_ERROR");
  });

  it("batch_lookup: resolves multiple DOIs and tracks not_found", async () => {
    if (!networkAvailable) {
      console.log("⚠  Skipping: no network access to api.crossref.org");
      return;
    }
    const res = await app.inject({
      method: "POST",
      url: "/batch",
      payload: {
        dois: ["10.1038/s41586-021-03819-2", "10.1000/this-doi-does-not-exist-xyz"],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    expect(body).toHaveProperty("not_found");
    expect(body).toHaveProperty("errors");
  }, 20_000);

  it("search_works: returns 400 when neither query nor author is given (no network needed)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/search",
      payload: { rows: 5 },
    });
    expect(res.statusCode).toBe(400);
  });
});
