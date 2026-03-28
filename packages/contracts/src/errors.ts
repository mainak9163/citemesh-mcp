import { z } from "zod";

// ─── Error Types ─────────────────────────────────────────────────────────────
// Structured errors are passed between services and surfaced to MCP consumers.

export const ErrorType = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  NOT_FOUND: "NOT_FOUND",
  UPSTREAM_API_FAILURE: "UPSTREAM_API_FAILURE",
  PARTIAL_BATCH_FAILURE: "PARTIAL_BATCH_FAILURE",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorType = (typeof ErrorType)[keyof typeof ErrorType];

export const CitemeshErrorSchema = z.object({
  type: z.nativeEnum(ErrorType),
  message: z.string(),
  details: z.unknown().optional(),
});

export type CitemeshError = z.infer<typeof CitemeshErrorSchema>;

export function makeError(
  type: ErrorType,
  message: string,
  details?: unknown
): CitemeshError {
  return { type, message, ...(details !== undefined ? { details } : {}) };
}

// Per-item error used in batch results
export const BatchItemErrorSchema = z.object({
  doi: z.string(),
  error: CitemeshErrorSchema,
});

export type BatchItemError = z.infer<typeof BatchItemErrorSchema>;
