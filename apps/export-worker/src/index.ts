import "dotenv/config";
import Fastify from "fastify";
import pino from "pino";
import { exportRoute } from "./routes/export.js";
import { bibliographyRoute } from "./routes/bibliography.js";

const PORT = Number(process.env.EXPORT_WORKER_PORT ?? 3002);
const LOG_LEVEL = process.env.LOG_LEVEL ?? "info";

const logger = pino({ level: LOG_LEVEL, name: "export-worker" });

const app = Fastify({
  logger: { level: LOG_LEVEL },
  genReqId: () => crypto.randomUUID(),
});

app.get("/health", async () => ({ status: "ok", service: "export-worker" }));

await exportRoute(app);
await bibliographyRoute(app, logger);

app.listen({ port: PORT, host: "0.0.0.0" }, (err) => {
  if (err) {
    logger.error(err, "Failed to start export-worker");
    process.exit(1);
  }
  logger.info({ port: PORT }, "export-worker listening");
});

process.on("SIGTERM", async () => {
  await app.close();
  process.exit(0);
});
