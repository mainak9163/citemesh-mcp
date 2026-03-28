import { z } from "zod";

// ─── Core Normalized Work Record ──────────────────────────────────────────────
// This is the canonical shape that all upstream sources normalize into.
// Downstream consumers (export, bibliography, MCP tools) all operate on this type.

export const AuthorSchema = z.object({
  given: z.string().optional(),
  family: z.string().optional(),
  name: z.string().optional(), // full name fallback
  orcid: z.string().optional(),
  affiliation: z.array(z.string()).optional(),
});

export type Author = z.infer<typeof AuthorSchema>;

export const ExternalIdsSchema = z.object({
  doi: z.string().optional(),
  pmid: z.string().optional(),
  arxiv: z.string().optional(),
  wikidata: z.string().optional(),
  isbn: z.array(z.string()).optional(),
  issn: z.array(z.string()).optional(),
});

export type ExternalIds = z.infer<typeof ExternalIdsSchema>;

export const WorkRecordSchema = z.object({
  doi: z.string(),
  title: z.string(),
  authors: z.array(AuthorSchema),
  year: z.number().int().nullable(),
  source: z.string(),           // journal/conference/book name
  type: z.string(),             // article, book-chapter, proceedings-article, etc.
  publisher: z.string().optional(),
  url: z.string().url().optional(),
  abstract: z.string().optional(),
  external_ids: ExternalIdsSchema,
  raw_source: z.enum(["crossref", "wikidata", "manual"]),
});

export type WorkRecord = z.infer<typeof WorkRecordSchema>;

// Enrichment is kept separate so we never mutate the base shape unpredictably.
export const WikidataEntitySchema = z.object({
  entity_id: z.string(),
  label: z.string().optional(),
  description: z.string().optional(),
  aliases: z.array(z.string()).optional(),
  instance_of: z.array(z.string()).optional(),
  external_ids: z.record(z.string()).optional(),
});

export type WikidataEntity = z.infer<typeof WikidataEntitySchema>;

export const EnrichedWorkSchema = WorkRecordSchema.extend({
  entities: z.object({
    work: WikidataEntitySchema.nullable(),
    authors: z.array(WikidataEntitySchema),
  }).optional(),
});

export type EnrichedWork = z.infer<typeof EnrichedWorkSchema>;
