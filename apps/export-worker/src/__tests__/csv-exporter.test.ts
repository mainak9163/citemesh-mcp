import { describe, it, expect } from "vitest";
import { worksToCsv } from "../services/csv-exporter.js";
import type { WorkRecord } from "@citemesh/contracts";

function makeWork(overrides: Partial<WorkRecord> = {}): WorkRecord {
  return {
    doi: "10.1000/test",
    title: "A Test Paper",
    authors: [
      { family: "Doe", given: "Jane" },
      { family: "Smith", given: "John" },
    ],
    year: 2024,
    source: "Journal of Testing",
    type: "journal-article",
    publisher: "Test Press",
    url: "https://doi.org/10.1000/test",
    external_ids: { doi: "10.1000/test" },
    raw_source: "crossref",
    ...overrides,
  };
}

describe("worksToCsv", () => {
  it("produces a header row", () => {
    const csv = worksToCsv([makeWork()]);
    const [header] = csv.split("\r\n");
    expect(header).toContain("doi");
    expect(header).toContain("title");
    expect(header).toContain("authors");
    expect(header).toContain("year");
    expect(header).toContain("source");
  });

  it("produces one data row per work", () => {
    const csv = worksToCsv([makeWork(), makeWork({ doi: "10.1000/b" })]);
    const rows = csv.split("\r\n");
    expect(rows).toHaveLength(3); // header + 2 data rows
  });

  it("joins multiple authors with semicolons", () => {
    const csv = worksToCsv([makeWork()]);
    expect(csv).toContain("Doe, Jane; Smith, John");
  });

  it("quotes cells containing commas", () => {
    const csv = worksToCsv([makeWork({ title: "Title, With Comma" })]);
    expect(csv).toContain('"Title, With Comma"');
  });

  it("escapes double-quotes inside quoted cells", () => {
    const csv = worksToCsv([makeWork({ title: 'Say "hello"' })]);
    expect(csv).toContain('"Say ""hello"""');
  });

  it("handles works with no authors gracefully", () => {
    const csv = worksToCsv([makeWork({ authors: [] })]);
    expect(csv).not.toThrow;
    expect(csv.split("\r\n")).toHaveLength(2);
  });

  it("uses 'name' field for authors without family name", () => {
    const csv = worksToCsv([
      makeWork({ authors: [{ name: "Anonymous Org" }] }),
    ]);
    expect(csv).toContain("Anonymous Org");
  });

  it("handles empty works array", () => {
    const csv = worksToCsv([]);
    const rows = csv.split("\r\n");
    expect(rows).toHaveLength(1); // header only
  });

  it("uses CRLF line endings (RFC 4180)", () => {
    const csv = worksToCsv([makeWork()]);
    expect(csv).toContain("\r\n");
  });
});
