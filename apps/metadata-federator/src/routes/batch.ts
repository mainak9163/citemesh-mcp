import type { FastifyInstance } from "fastify";
import {
  BatchLookupRequestSchema,
  ErrorType,
  makeError,
} from "@citemesh/contracts";
import type { WorkRecord, BatchItemError } from "@citemesh/contracts";
import type { CrossrefClient } from "../services/crossref-client.js";
import { normalizeDoi } from "../services/doi-utils.js";

export async function batchRoute(
  app: FastifyInstance,
  crossref: CrossrefClient
) {
  app.post("/batch", async (req, reply) => {
    const parsed = BatchLookupRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send(
        makeError(ErrorType.VALIDATION_ERROR, "Invalid request", parsed.error.flatten())
      );
    }

    const { dois } = parsed.data;
    const items: WorkRecord[] = [];
    const not_found: string[] = [];
    const errors: BatchItemError[] = [];

    // Fan out concurrently with a concurrency cap to be polite to Crossref
    const CONCURRENCY = 5;
    for (let i = 0; i < dois.length; i += CONCURRENCY) {
      const chunk = dois.slice(i, i + CONCURRENCY);
      await Promise.all(
        chunk.map(async (doi) => {
          try {
            const work = await crossref.resolveWork(doi);
            items.push(work);
          } catch (err: unknown) {
            const e = err as { type?: string; message?: string };
            const normalized = normalizeDoi(doi);
            if (e?.type === ErrorType.NOT_FOUND) {
              not_found.push(normalized);
            } else {
              errors.push({
                doi: normalized,
                error: makeError(
                  ErrorType.UPSTREAM_API_FAILURE,
                  e?.message ?? "Unknown error",
                  e
                ),
              });
            }
          }
        })
      );
    }

    return reply.send({ items, not_found, errors });
  });
}
