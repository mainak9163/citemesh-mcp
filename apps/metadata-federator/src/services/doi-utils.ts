// ─── DOI Normalization ───────────────────────────────────────────────────────
// Accepts bare DOIs, doi.org URLs, or dx.doi.org URLs and returns a clean DOI.

const DOI_PREFIX_RE = /^https?:\/\/(?:dx\.)?doi\.org\//i;

export function normalizeDoi(raw: string): string {
  return raw.trim().replace(DOI_PREFIX_RE, "").toLowerCase();
}

export function doiToUrl(doi: string): string {
  return `https://doi.org/${normalizeDoi(doi)}`;
}

export function isValidDoi(raw: string): boolean {
  const doi = normalizeDoi(raw);
  // DOIs start with "10." followed by registrant code and suffix
  return /^10\.\d{4,}\/\S+$/.test(doi);
}
