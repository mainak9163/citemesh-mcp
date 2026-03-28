import { z } from "zod";
import { WorkRecordSchema, EnrichedWorkSchema } from "./work.js";
import { CitemeshErrorSchema, BatchItemErrorSchema } from "./errors.js";

// ─── Metadata Federator DTOs ──────────────────────────────────────────────────

export const SearchWorksRequestSchema = z.object({
  query: z.string().optional(),
  author: z.string().optional(),
  rows: z.number().int().min(1).max(100).default(10),
  offset: z.number().int().min(0).default(0),
});
export type SearchWorksRequest = z.infer<typeof SearchWorksRequestSchema>;

export const PaginationSchema = z.object({
  total_results: z.number().int(),
  rows: z.number().int(),
  offset: z.number().int(),
});

export const SearchWorksResponseSchema = z.object({
  items: z.array(WorkRecordSchema),
  pagination: PaginationSchema,
  warnings: z.array(z.string()),
});
export type SearchWorksResponse = z.infer<typeof SearchWorksResponseSchema>;

export const ResolveDoiRequestSchema = z.object({
  doi: z.string().min(1),
});
export type ResolveDoiRequest = z.infer<typeof ResolveDoiRequestSchema>;

export const BatchLookupRequestSchema = z.object({
  dois: z.array(z.string().min(1)).min(1).max(50),
});
export type BatchLookupRequest = z.infer<typeof BatchLookupRequestSchema>;

export const BatchLookupResponseSchema = z.object({
  items: z.array(WorkRecordSchema),
  not_found: z.array(z.string()),
  errors: z.array(BatchItemErrorSchema),
});
export type BatchLookupResponse = z.infer<typeof BatchLookupResponseSchema>;

export const EnrichRequestSchema = z.object({
  doi: z.string().optional(),
  title: z.string().optional(),
});
export type EnrichRequest = z.infer<typeof EnrichRequestSchema>;

// ─── Export Worker DTOs ───────────────────────────────────────────────────────

export const ExportFormatSchema = z.enum(["json", "csv"]);
export type ExportFormat = z.infer<typeof ExportFormatSchema>;

export const BibliographyFormatSchema = z.enum(["bibtex", "csljson", "bibliography"]);
export type BibliographyFormat = z.infer<typeof BibliographyFormatSchema>;

export const ExportRequestSchema = z.object({
  works: z.array(WorkRecordSchema).min(1),
  format: ExportFormatSchema,
});
export type ExportRequest = z.infer<typeof ExportRequestSchema>;

export const ExportResponseSchema = z.object({
  format: ExportFormatSchema,
  content_type: z.string(),
  data: z.string(),
  count: z.number().int(),
});
export type ExportResponse = z.infer<typeof ExportResponseSchema>;

export const BibliographyRequestSchema = z.object({
  dois: z.array(z.string()).optional(),
  works: z.array(WorkRecordSchema).optional(),
  format: BibliographyFormatSchema,
});
export type BibliographyRequest = z.infer<typeof BibliographyRequestSchema>;

export const BibliographyResponseSchema = z.object({
  format: BibliographyFormatSchema,
  content: z.string(),
  count: z.number().int(),
  errors: z.array(CitemeshErrorSchema),
});
export type BibliographyResponse = z.infer<typeof BibliographyResponseSchema>;
