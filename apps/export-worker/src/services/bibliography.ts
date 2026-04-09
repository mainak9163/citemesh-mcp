import type { WorkRecord } from "@citemesh/contracts";
import type { BibliographyFormat } from "@citemesh/contracts";
import type { Logger } from "pino";

// ─── Bibliography Service ─────────────────────────────────────────────────────
// Converts WorkRecords to CSL-JSON, then uses Citation.js to render BibTeX
// or formatted bibliography strings.
//
// Citation.js is loaded dynamically because it is a CommonJS module that uses
// require() internally. Dynamic import() works across the ESM/CJS boundary in
// Node 20 when moduleResolution is NodeNext.

interface CslJsonItem {
  id: string;
  type: string;
  title: string;
  author?: Array<{ given?: string; family?: string; literal?: string }>;
  issued?: { "date-parts": number[][] };
  "container-title"?: string;
  publisher?: string;
  DOI?: string;
  URL?: string;
  abstract?: string;
  ISBN?: string[];
  ISSN?: string[];
}

export function workToCslJson(work: WorkRecord): CslJsonItem {
  const item: CslJsonItem = {
    id: work.doi || `work-${Date.now()}`,
    type: mapType(work.type),
    title: work.title,
  };

  if (work.authors.length > 0) {
    item.author = work.authors.map((a) =>
      a.family
        ? { given: a.given, family: a.family }
        : { literal: a.name ?? "Unknown" }
    );
  }

  if (work.year) {
    item.issued = { "date-parts": [[work.year]] };
  }

  if (work.source) item["container-title"] = work.source;
  if (work.publisher) item.publisher = work.publisher;
  if (work.doi) item.DOI = work.doi;
  if (work.url) item.URL = work.url;
  if (work.abstract) item.abstract = work.abstract;
  if (work.external_ids.isbn) item.ISBN = work.external_ids.isbn;
  if (work.external_ids.issn) item.ISSN = work.external_ids.issn;

  return item;
}

// Map Crossref types to CSL types
function mapType(crossrefType: string): string {
  const map: Record<string, string> = {
    "journal-article": "article-journal",
    "book-chapter": "chapter",
    "proceedings-article": "paper-conference",
    book: "book",
    "edited-book": "book",
    report: "report",
    thesis: "thesis",
    dataset: "dataset",
    "posted-content": "manuscript",
  };
  return map[crossrefType] ?? "document";
}

export async function buildBibliography(
  works: WorkRecord[],
  format: BibliographyFormat,
  logger: Logger
): Promise<{ content: string; errors: string[] }> {
  const cslItems = works.map(workToCslJson);
  const errors: string[] = [];

  if (format === "csljson") {
    return { content: JSON.stringify(cslItems, null, 2), errors };
  }

  // Use Citation.js for BibTeX and formatted bibliography
  try {
    // Dynamic import handles the CJS/ESM boundary
    const { default: Cite } = (await import("citation-js") as unknown as {
      default: new (data: unknown) => {
        format: (
          type: string,
          opts?: Record<string, unknown>
        ) => string;
      };
    });

    const cite = new Cite(cslItems);

    if (format === "bibtex") {
      const bibtex = cite.format("bibtex");
      return { content: bibtex, errors };
    }

    if (format === "bibliography") {
      const bib = cite.format("bibliography", {
        format: "text",
        template: "apa",
        lang: "en-US",
      });
      return { content: bib, errors };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "Citation.js failed");
    errors.push(`Bibliography generation failed: ${msg}`);
    // Fallback to CSL-JSON so the caller always gets something
    return { content: JSON.stringify(cslItems, null, 2), errors };
  }

  return { content: "", errors: [`Unknown format: ${format}`] };
}
