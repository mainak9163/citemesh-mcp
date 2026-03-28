import type { FastifyInstance } from "fastify";
import { SearchWorksRequestSchema } from "@citemesh/contracts";
import { ErrorType, makeError } from "@citemesh/contracts";
import type { CrossrefClient } from "../services/crossref-client.js";

export async function searchRoute(
  app: FastifyInstance,
  crossref: CrossrefClient
) {
  app.post("/search", async (req, reply) => {
    const parsed = SearchWorksRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send(
        makeError(ErrorType.VALIDATION_ERROR, "Invalid request", parsed.error.flatten())
      );
    }

    const { query, author, rows, offset } = parsed.data;

    if (!query && !author) {
      return reply.status(400).send(
        makeError(ErrorType.VALIDATION_ERROR, "At least one of query or author is required")
      );
    }

    try {
      const result = await crossref.searchWorks(query, author, rows, offset);
      return reply.send({
        items: result.items,
        pagination: { total_results: result.total, rows, offset },
        warnings: [],
      });
    } catch (err: unknown) {
      req.log.error({ err }, "search_works failed");
      const e = err as { type?: string; message?: string };
      if (e?.type) return reply.status(502).send(err);
      return reply.status(500).send(
        makeError(ErrorType.INTERNAL_ERROR, "Unexpected error during search")
      );
    }
  });
}
