import type { WorkRecord } from "@citemesh/contracts";

// ─── CSV Export ───────────────────────────────────────────────────────────────
// Produces RFC 4180-compliant CSV output from an array of WorkRecords.

const CSV_COLUMNS = [
  "doi",
  "title",
  "authors",
  "year",
  "source",
  "type",
  "publisher",
  "url",
  "abstract",
] as const;

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  // Quote cells containing comma, newline, or double-quote
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatAuthors(work: WorkRecord): string {
  return work.authors
    .map((a) => {
      if (a.family && a.given) return `${a.family}, ${a.given}`;
      if (a.family) return a.family;
      if (a.name) return a.name;
      return "";
    })
    .filter(Boolean)
    .join("; ");
}

export function worksToCsv(works: WorkRecord[]): string {
  const header = CSV_COLUMNS.join(",");

  const rows = works.map((w) => {
    const cells = [
      w.doi,
      w.title,
      formatAuthors(w),
      w.year,
      w.source,
      w.type,
      w.publisher ?? "",
      w.url ?? "",
      w.abstract ?? "",
    ];
    return cells.map(escapeCell).join(",");
  });

  return [header, ...rows].join("\r\n");
}
