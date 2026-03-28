import "dotenv/config";
import Fastify from "fastify";
import pino from "pino";
import { ResponseCache } from "./cache/response-cache.js";
import { CrossrefClient } from "./services/crossref-client.js";
import { WikidataClient } from "./services/wikidata-client.js";
import { searchRoute } from "./routes/search.js";
import { resolveRoute } from "./routes/resolve.js";
import { batchRoute } from "./routes/batch.js";
import { enrichRoute } from "./routes/enrich.js";

const PORT = Number(process.env.METADATA_FEDERATOR_PORT ?? 3001);
const LOG_LEVEL = process.env.LOG_LEVEL ?? "info";
const CACHE_DB_PATH = process.env.CACHE_DB_PATH ?? "./cache.db";
const CACHE_TTL = Number(process.env.CACHE_TTL_SECONDS ?? 3600);
const CROSSREF_MAILTO = process.env.CROSSREF_MAILTO ?? "";

const logger = pino({ level: LOG_LEVEL, name: "metadata-federator" });

const cache = new ResponseCache(CACHE_DB_PATH, CACHE_TTL);
// Prune expired entries at startup
const pruned = cache.prune();
logger.info({ pruned }, "cache pruned");

const crossref = new CrossrefClient({ mailto: CROSSREF_MAILTO, cache, logger });
const wikidata = new WikidataClient(cache, logger);

const app = Fastify({
  logger: { level: LOG_LEVEL },
  genReqId: () => crypto.randomUUID(),
});

// Health check
app.get("/health", async () => ({ status: "ok", service: "metadata-federator" }));

// Register domain routes
await searchRoute(app, crossref);
await resolveRoute(app, crossref);
await batchRoute(app, crossref);
await enrichRoute(app, crossref, wikidata);

app.listen({ port: PORT, host: "0.0.0.0" }, (err) => {
  if (err) {
    logger.error(err, "Failed to start metadata-federator");
    process.exit(1);
  }
  logger.info({ port: PORT }, "metadata-federator listening");
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  await app.close();
  cache.close();
  process.exit(0);
});
