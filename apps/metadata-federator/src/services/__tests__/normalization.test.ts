import { describe, it, expect } from "vitest";
import {
  normalizeDoi,
  doiToUrl,
  isValidDoi,
} from "../../services/doi-utils.js";
import { normalizeCrossrefWork } from "../../services/crossref-client.js";

// ─── DOI Normalization Tests ──────────────────────────────────────────────────

describe("normalizeDoi", () => {
  it("strips https://doi.org/ prefix", () => {
    expect(normalizeDoi("https://doi.org/10.1038/s41586-021-03819-2")).toBe(
      "10.1038/s41586-021-03819-2"
    );
  });

  it("strips http://dx.doi.org/ prefix", () => {
    expect(normalizeDoi("http://dx.doi.org/10.1016/j.cell.2020.01.001")).toBe(
      "10.1016/j.cell.2020.01.001"
    );
  });

  it("lowercases the result", () => {
    expect(normalizeDoi("10.1038/S41586-021-03819-2")).toBe(
      "10.1038/s41586-021-03819-2"
    );
  });

  it("trims whitespace", () => {
    expect(normalizeDoi("  10.1038/test  ")).toBe("10.1038/test");
  });

  it("returns bare DOI unchanged (lowercased)", () => {
    expect(normalizeDoi("10.1145/3290605.3300400")).toBe(
      "10.1145/3290605.3300400"
    );
  });
});

describe("doiToUrl", () => {
  it("produces a valid doi.org URL", () => {
    expect(doiToUrl("10.1038/test")).toBe("https://doi.org/10.1038/test");
  });

  it("handles doi.org-prefixed input", () => {
    expect(doiToUrl("https://doi.org/10.1038/test")).toBe(
      "https://doi.org/10.1038/test"
    );
  });
});

describe("isValidDoi", () => {
  it("accepts valid DOIs", () => {
    expect(isValidDoi("10.1038/s41586-021-03819-2")).toBe(true);
    expect(isValidDoi("10.1145/3290605.3300400")).toBe(true);
    expect(isValidDoi("https://doi.org/10.1000/xyz123")).toBe(true);
  });

  it("rejects invalid DOIs", () => {
    expect(isValidDoi("not-a-doi")).toBe(false);
    expect(isValidDoi("10.abc/test")).toBe(false); // less than 4 digits
    expect(isValidDoi("")).toBe(false);
  });
});

// ─── Crossref Normalization Tests ─────────────────────────────────────────────

describe("normalizeCrossrefWork", () => {
  const rawWork = {
    DOI: "10.1038/s41586-021-03819-2",
    title: ["Highly accurate protein structure prediction with AlphaFold"],
    author: [
      {
        given: "John",
        family: "Jumper",
        ORCID: "http://orcid.org/0000-0001-6169-6580",
        affiliation: [{ name: "DeepMind" }],
      },
      { given: "Richard", family: "Evans" },
    ],
    "published-print": { "date-parts": [[2021, 8, 26]] },
    "container-title": ["Nature"],
    type: "journal-article",
    publisher: "Springer Nature",
    URL: "http://dx.doi.org/10.1038/s41586-021-03819-2",
    abstract: "<jats:p>Proteins are essential to life.</jats:p>",
    ISSN: ["0028-0836"],
  };

  it("normalizes DOI to lowercase", () => {
    const work = normalizeCrossrefWork(rawWork);
    expect(work.doi).toBe("10.1038/s41586-021-03819-2");
  });

  it("extracts first title", () => {
    const work = normalizeCrossrefWork(rawWork);
    expect(work.title).toBe(
      "Highly accurate protein structure prediction with AlphaFold"
    );
  });

  it("maps authors with ORCID", () => {
    const work = normalizeCrossrefWork(rawWork);
    expect(work.authors[0].family).toBe("Jumper");
    expect(work.authors[0].orcid).toBe("0000-0001-6169-6580");
    expect(work.authors[0].affiliation).toEqual(["DeepMind"]);
  });

  it("extracts year from published-print", () => {
    const work = normalizeCrossrefWork(rawWork);
    expect(work.year).toBe(2021);
  });

  it("strips JATS XML from abstract", () => {
    const work = normalizeCrossrefWork(rawWork);
    expect(work.abstract).toBe("Proteins are essential to life.");
  });

  it("sets raw_source to crossref", () => {
    const work = normalizeCrossrefWork(rawWork);
    expect(work.raw_source).toBe("crossref");
  });

  it("handles missing title gracefully", () => {
    const work = normalizeCrossrefWork({ ...rawWork, title: undefined });
    expect(work.title).toBe("Untitled");
  });

  it("handles missing authors gracefully", () => {
    const work = normalizeCrossrefWork({ ...rawWork, author: undefined });
    expect(work.authors).toEqual([]);
  });

  it("falls back to online date if print not available", () => {
    const work = normalizeCrossrefWork({
      ...rawWork,
      "published-print": undefined,
      "published-online": { "date-parts": [[2020]] },
    });
    expect(work.year).toBe(2020);
  });
});
