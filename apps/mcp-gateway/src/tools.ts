import { z } from "zod";
import {
  WorkRecordSchema,
  BibliographyFormatSchema,
  ExportFormatSchema,
} from "@citemesh/contracts";
import type { ServiceClient } from "./service-client.js";
import type { Logger } from "pino";

// ─── MCP Tool Registry ────────────────────────────────────────────────────────
// Each tool has: name, description, inputSchema (Zod), and a handler function.
// The gateway registers all tools with the MCP SDK and delegates to the handler.

export const toolDefinitions = [
  {
    name: "search_works",
    description:
      "Search scholarly works by keyword query or author name using Crossref. Returns normalized metadata with pagination.",
    inputSchema: z.object({
      query: z.string().optional().describe("Full-text search query"),
      author: z.string().optional().describe("Author name filter"),
      rows: z.number().int().min(1).max(100).optional().default(10).describe("Results per page"),
      offset: z.number().int().min(0).optional().default(0).describe("Pagination offset"),
    }),
  },
  {
    name: "resolve_doi",
    description:
      "Resolve a single DOI to its full normalized work metadata via Crossref.",
    inputSchema: z.object({
      doi: z.string().describe("DOI to resolve, e.g. 10.1038/s41586-021-03819-2"),
    }),
  },
  {
    name: "batch_lookup_dois",
    description:
      "Resolve up to 50 DOIs in a single call. Returns found works, not-found DOIs, and per-item errors.",
    inputSchema: z.object({
      dois: z.array(z.string()).min(1).max(50).describe("Array of DOIs to look up"),
    }),
  },
  {
    name: "enrich_work_entities",
    description:
      "Resolve a work by DOI or title, then enrich it with Wikidata entity data where available.",
    inputSchema: z.object({
      doi: z.string().optional().describe("DOI of the work to enrich"),
      title: z.string().optional().describe("Title of the work (used if DOI not provided)"),
    }),
  },
  {
    name: "build_bibliography",
    description:
      "Generate a bibliography from works in BibTeX, CSL-JSON, or formatted APA text.",
    inputSchema: z.object({
      dois: z.array(z.string()).optional().describe("DOIs to look up and include"),
      works: z.array(WorkRecordSchema).optional().describe("Pre-fetched work records"),
      format: BibliographyFormatSchema.describe("Output format: bibtex | csljson | bibliography"),
    }),
  },
  {
    name: "export_results",
    description:
      "Export an array of normalized work records as JSON or CSV.",
    inputSchema: z.object({
      works: z.array(WorkRecordSchema).min(1).describe("Work records to export"),
      format: ExportFormatSchema.describe("Output format: json | csv"),
    }),
  },
] as const;

// ─── Tool Handlers ────────────────────────────────────────────────────────────

export function createToolHandlers(client: ServiceClient, logger: Logger) {
  const log = logger.child({ module: "tool-handlers" });

  return {
    async search_works(input: {
      query?: string;
      author?: string;
      rows?: number;
      offset?: number;
    }) {
      log.info({ input }, "search_works called");
      const result = await client.searchWorks(input);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },

    async resolve_doi(input: { doi: string }) {
      log.info({ doi: input.doi }, "resolve_doi called");
      const work = await client.resolveDoi(input.doi);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(work, null, 2) }],
      };
    },

    async batch_lookup_dois(input: { dois: string[] }) {
      log.info({ count: input.dois.length }, "batch_lookup_dois called");
      const result = await client.batchLookup(input.dois);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },

    async enrich_work_entities(input: { doi?: string; title?: string }) {
      log.info({ input }, "enrich_work_entities called");
      const result = await client.enrichWork(input);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },

    async build_bibliography(input: {
      dois?: string[];
      works?: unknown[];
      format: "bibtex" | "csljson" | "bibliography";
    }) {
      log.info({ format: input.format, count: (input.works?.length ?? 0) + (input.dois?.length ?? 0) }, "build_bibliography called");

      // If DOIs were given but no works, resolve them first
      let works = input.works as import("@citemesh/contracts").WorkRecord[] | undefined;
      const allDois = input.dois ?? [];

      if (allDois.length > 0) {
        const batch = await client.batchLookup(allDois);
        works = [...(works ?? []), ...batch.items];
      }

      if (!works || works.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "No works resolved for bibliography" }),
            },
          ],
          isError: true,
        };
      }

      const result = await client.buildBibliography({ works, format: input.format });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },

    async export_results(input: {
      works: import("@citemesh/contracts").WorkRecord[];
      format: "json" | "csv";
    }) {
      log.info({ format: input.format, count: input.works.length }, "export_results called");
      const result = await client.exportWorks(input.works, input.format);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  };
}
