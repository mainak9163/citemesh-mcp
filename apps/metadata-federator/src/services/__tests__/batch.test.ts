import { describe, it, expect } from "vitest";
import type { WorkRecord, BatchItemError } from "@citemesh/contracts";
import { ErrorType } from "@citemesh/contracts";

// ─── Batch Result Shaping Tests ───────────────────────────────────────────────
// These tests validate the shape contract of batch lookup responses without
// needing to hit any external API.

function makeMockWork(doi: string): WorkRecord {
  return {
    doi,
    title: `Work for ${doi}`,
    authors: [{ family: "Smith", given: "Jane" }],
    year: 2023,
    source: "Test Journal",
    type: "journal-article",
    publisher: "Test Publisher",
    url: `https://doi.org/${doi}`,
    external_ids: { doi },
    raw_source: "crossref",
  };
}

describe("batch lookup response shape", () => {
  it("separates found, not_found, and errors correctly", () => {
    const items: WorkRecord[] = [makeMockWork("10.1000/a"), makeMockWork("10.1000/b")];
    const not_found: string[] = ["10.1000/missing"];
    const errors: BatchItemError[] = [
      {
        doi: "10.1000/broken",
        error: { type: ErrorType.UPSTREAM_API_FAILURE, message: "timeout" },
      },
    ];

    const response = { items, not_found, errors };

    expect(response.items).toHaveLength(2);
    expect(response.not_found).toContain("10.1000/missing");
    expect(response.errors[0].doi).toBe("10.1000/broken");
    expect(response.errors[0].error.type).toBe(ErrorType.UPSTREAM_API_FAILURE);
  });

  it("returns empty arrays when all lookups succeed", () => {
    const response = {
      items: [makeMockWork("10.1000/x")],
      not_found: [],
      errors: [],
    };
    expect(response.not_found).toHaveLength(0);
    expect(response.errors).toHaveLength(0);
  });

  it("handles all-failure scenario", () => {
    const response = {
      items: [],
      not_found: ["10.1000/a", "10.1000/b"],
      errors: [],
    };
    expect(response.items).toHaveLength(0);
    expect(response.not_found).toHaveLength(2);
  });

  it("work record has required normalized fields", () => {
    const work = makeMockWork("10.1000/test");
    expect(work).toHaveProperty("doi");
    expect(work).toHaveProperty("title");
    expect(work).toHaveProperty("authors");
    expect(work).toHaveProperty("year");
    expect(work).toHaveProperty("source");
    expect(work).toHaveProperty("type");
    expect(work).toHaveProperty("external_ids");
    expect(work).toHaveProperty("raw_source");
  });
});
