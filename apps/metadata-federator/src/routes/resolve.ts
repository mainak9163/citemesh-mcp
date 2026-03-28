import type { FastifyInstance } from "fastify";
import { ResolveDoiRequestSchema, ErrorType, makeError } from "@citemesh/contracts";
import type { CrossrefClient } from "../services/crossref-client.js";
import { isValidDoi } from "../services/doi-utils.js";

export async function resolveRoute(
  app: FastifyInstance,
  crossref: CrossrefClient
) {
  app.post("/resolve", async (req, reply) => {
    const parsed = ResolveDoiRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send(
        makeError(ErrorType.VALIDATION_ERROR, "Invalid request", parsed.error.flatten())
      );
    }

    const { doi } = parsed.data;

    if (!isValidDoi(doi)) {
      return reply.status(400).send(
        makeError(ErrorType.VALIDATION_ERROR, `"${doi}" does not look like a valid DOI`)
      );
    }

    try {
      const work = await crossref.resolveWork(doi);
      return reply.send(work);
    } catch (err: unknown) {
      req.log.error({ err, doi }, "resolve_doi failed");
      const e = err as { type?: string };
      if (e?.type === ErrorType.NOT_FOUND) return reply.status(404).send(err);
      if (e?.type) return reply.status(502).send(err);
      return reply.status(500).send(
        makeError(ErrorType.INTERNAL_ERROR, "Unexpected error resolving DOI")
      );
    }
  });
}
