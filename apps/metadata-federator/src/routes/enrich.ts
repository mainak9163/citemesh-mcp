import type { FastifyInstance } from "fastify";
import {
  EnrichRequestSchema,
  ErrorType,
  makeError,
} from "@citemesh/contracts";
import type { CrossrefClient } from "../services/crossref-client.js";
import type { WikidataClient } from "../services/wikidata-client.js";
import { isValidDoi } from "../services/doi-utils.js";

export async function enrichRoute(
  app: FastifyInstance,
  crossref: CrossrefClient,
  wikidata: WikidataClient
) {
  app.post("/enrich", async (req, reply) => {
    const parsed = EnrichRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send(
        makeError(ErrorType.VALIDATION_ERROR, "Invalid request", parsed.error.flatten())
      );
    }

    const { doi, title } = parsed.data;

    if (!doi && !title) {
      return reply.status(400).send(
        makeError(ErrorType.VALIDATION_ERROR, "Provide at least doi or title")
      );
    }

    // Step 1: Resolve the base work record via Crossref
    let work;
    try {
      if (doi && isValidDoi(doi)) {
        work = await crossref.resolveWork(doi);
      } else if (title) {
        // Search by title — take best result
        const result = await crossref.searchWorks(title, undefined, 1, 0);
        work = result.items[0];
        if (!work) {
          return reply.status(404).send(
            makeError(ErrorType.NOT_FOUND, `No works found for title: "${title}"`)
          );
        }
      } else {
        return reply.status(400).send(
          makeError(ErrorType.VALIDATION_ERROR, "doi is invalid and no title given")
        );
      }
    } catch (err: unknown) {
      const e = err as { type?: string };
      if (e?.type === ErrorType.NOT_FOUND) return reply.status(404).send(err);
      return reply.status(502).send(err);
    }

    // Step 2: Enrich with Wikidata — non-fatal if it fails
    let wikidataEntity = null;
    try {
      wikidataEntity = work.doi
        ? await wikidata.findWorkByDoi(work.doi)
        : await wikidata.findWorkByTitle(work.title);
    } catch (err) {
      req.log.warn({ err }, "Wikidata enrichment failed (non-fatal)");
    }

    return reply.send({
      ...work,
      entities: {
        work: wikidataEntity,
        authors: [], // Author-level Wikidata lookup is a future extension
      },
    });
  });
}
