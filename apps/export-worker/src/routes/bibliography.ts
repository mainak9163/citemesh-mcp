import type { FastifyInstance } from "fastify";
import {
  BibliographyRequestSchema,
  ErrorType,
  makeError,
} from "@citemesh/contracts";
import { buildBibliography } from "../services/bibliography.js";
import type { Logger } from "pino";

export async function bibliographyRoute(app: FastifyInstance, logger: Logger) {
  app.post("/bibliography", async (req, reply) => {
    const parsed = BibliographyRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send(
        makeError(ErrorType.VALIDATION_ERROR, "Invalid request", parsed.error.flatten())
      );
    }

    const { works, format } = parsed.data;

    if (!works || works.length === 0) {
      return reply.status(400).send(
        makeError(
          ErrorType.VALIDATION_ERROR,
          "At least one work must be provided"
        )
      );
    }

    const { content, errors } = await buildBibliography(works, format, logger);

    return reply.send({
      format,
      content,
      count: works.length,
      errors: errors.map((msg) =>
        makeError(ErrorType.INTERNAL_ERROR, msg)
      ),
    });
  });
}
