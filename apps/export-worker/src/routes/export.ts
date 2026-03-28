import type { FastifyInstance } from "fastify";
import {
  ExportRequestSchema,
  ErrorType,
  makeError,
} from "@citemesh/contracts";
import { worksToCsv } from "../services/csv-exporter.js";

export async function exportRoute(app: FastifyInstance) {
  app.post("/export", async (req, reply) => {
    const parsed = ExportRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send(
        makeError(ErrorType.VALIDATION_ERROR, "Invalid request", parsed.error.flatten())
      );
    }

    const { works, format } = parsed.data;

    if (format === "json") {
      return reply.send({
        format: "json",
        content_type: "application/json",
        data: JSON.stringify(works, null, 2),
        count: works.length,
      });
    }

    if (format === "csv") {
      return reply.send({
        format: "csv",
        content_type: "text/csv",
        data: worksToCsv(works),
        count: works.length,
      });
    }

    return reply.status(400).send(
      makeError(ErrorType.VALIDATION_ERROR, `Unknown format: ${format}`)
    );
  });
}
