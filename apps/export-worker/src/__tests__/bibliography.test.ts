import { describe, it, expect } from "vitest";
import pino from "pino";
import type { WorkRecord } from "@citemesh/contracts";
import { buildBibliography, workToCslJson } from "../services/bibliography.js";

function makeWork(overrides: Partial<WorkRecord> = {}): WorkRecord {
  return {
    doi: "10.1038/s41586-021-03819-2",
    title: "Highly accurate protein structure prediction with AlphaFold",
    authors: [{ family: "Jumper", given: "John" }],
    year: 2021,
    source: "Nature",
    type: "journal-article",
    publisher: "Springer Nature",
    url: "https://doi.org/10.1038/s41586-021-03819-2",
    abstract: "Proteins are essential to life.",
    external_ids: {
      doi: "10.1038/s41586-021-03819-2",
      issn: ["0028-0836"],
    },
    raw_source: "crossref",
    ...overrides,
  };
}

describe("workToCslJson", () => {
  it("maps a journal article to CSL-JSON", () => {
    const csl = workToCslJson(makeWork());

    expect(csl.type).toBe("article-journal");
    expect(csl.DOI).toBe("10.1038/s41586-021-03819-2");
    expect(csl.author).toEqual([{ given: "John", family: "Jumper" }]);
  });
});

describe("buildBibliography", () => {
  const logger = pino({ level: "silent" });

  it("renders BibTeX output with Citation.js", async () => {
    const result = await buildBibliography([makeWork()], "bibtex", logger);

    expect(result.errors).toEqual([]);
    expect(result.content).toContain("@article");
    expect(result.content).toContain("AlphaFold");
  });

  it("returns CSL-JSON directly when requested", async () => {
    const result = await buildBibliography([makeWork()], "csljson", logger);

    expect(result.errors).toEqual([]);
    expect(result.content).toContain("\"DOI\": \"10.1038/s41586-021-03819-2\"");
  });
});
