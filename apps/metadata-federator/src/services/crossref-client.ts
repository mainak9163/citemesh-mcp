import { fetch } from "undici";
import type { WorkRecord, Author } from "@citemesh/contracts";
import { ErrorType, makeError } from "@citemesh/contracts";
import type { ResponseCache } from "../cache/response-cache.js";
import { ResponseCache as RC } from "../cache/response-cache.js";
import { normalizeDoi, doiToUrl } from "./doi-utils.js";
import type { Logger } from "pino";

// ─── Crossref API Client ─────────────────────────────────────────────────────
// Wraps the Crossref REST API with caching, normalization, and error handling.
// Docs: https://api.crossref.org/swagger-ui/index.html

const BASE_URL = "https://api.crossref.org";

export interface CrossrefClientOptions {
  mailto?: string;
  cache: ResponseCache;
  logger: Logger;
}

// Raw Crossref shapes (partial — only what we use)
interface CrossrefAuthor {
  given?: string;
  family?: string;
  name?: string;
  ORCID?: string;
  affiliation?: Array<{ name: string }>;
}

interface CrossrefWork {
  DOI: string;
  title?: string[];
  author?: CrossrefAuthor[];
  "published-print"?: { "date-parts": number[][] };
  "published-online"?: { "date-parts": number[][] };
  "container-title"?: string[];
  type?: string;
  publisher?: string;
  URL?: string;
  abstract?: string;
  ISBN?: string[];
  ISSN?: string[];
}

interface CrossrefSearchResponse {
  status: string;
  message: {
    "total-results": number;
    items: CrossrefWork[];
  };
}

export class CrossrefClient {
  private mailto: string;
  private cache: ResponseCache;
  private logger: Logger;

  constructor({ mailto = "", cache, logger }: CrossrefClientOptions) {
    this.mailto = mailto;
    this.cache = cache;
    this.logger = logger.child({ service: "CrossrefClient" });
  }

  private headers(): Record<string, string> {
    const ua = this.mailto
      ? `CItemesh-MCP/0.1 (mailto:${this.mailto})`
      : "CItemesh-MCP/0.1";
    return { "User-Agent": ua };
  }

  private async fetchJson<T>(url: string, cacheKey: string): Promise<T> {
    const cached = this.cache.get<T>(cacheKey);
    if (cached) {
      this.logger.debug({ cacheKey }, "cache hit");
      return cached;
    }

    this.logger.debug({ url }, "fetching from Crossref");
    const res = await fetch(url, { headers: this.headers() });

    if (!res.ok) {
      if (res.status === 404) {
        throw makeError(ErrorType.NOT_FOUND, `Crossref returned 404 for ${url}`);
      }
      throw makeError(
        ErrorType.UPSTREAM_API_FAILURE,
        `Crossref request failed: ${res.status} ${res.statusText}`,
        { url, status: res.status }
      );
    }

    const data = (await res.json()) as T;
    this.cache.set(cacheKey, data);
    return data;
  }

  async searchWorks(
    query?: string,
    author?: string,
    rows = 10,
    offset = 0
  ): Promise<{ items: WorkRecord[]; total: number }> {
    const params: Record<string, string> = {
      rows: String(rows),
      offset: String(offset),
    };
    if (query) params.query = query;
    if (author) params["query.author"] = author;

    const qs = new URLSearchParams(params).toString();
    const url = `${BASE_URL}/works?${qs}`;
    const cacheKey = RC.buildKey("crossref:works:search", params);

    const data = await this.fetchJson<CrossrefSearchResponse>(url, cacheKey);

    return {
      items: (data.message.items ?? []).map(normalizeCrossrefWork),
      total: data.message["total-results"] ?? 0,
    };
  }

  async resolveWork(doi: string): Promise<WorkRecord> {
    const clean = normalizeDoi(doi);
    const url = `${BASE_URL}/works/${encodeURIComponent(clean)}`;
    const cacheKey = RC.buildKey("crossref:works:doi", { doi: clean });

    const data = await this.fetchJson<{ status: string; message: CrossrefWork }>(
      url,
      cacheKey
    );

    return normalizeCrossrefWork(data.message);
  }
}

// ─── Normalization ────────────────────────────────────────────────────────────

export function normalizeCrossrefWork(raw: CrossrefWork): WorkRecord {
  const doi = normalizeDoi(raw.DOI ?? "");
  const title = raw.title?.[0] ?? "Untitled";

  const authors: Author[] = (raw.author ?? []).map((a) => ({
    given: a.given,
    family: a.family,
    name: a.name,
    orcid: a.ORCID ? a.ORCID.replace("http://orcid.org/", "") : undefined,
    affiliation: a.affiliation?.map((af) => af.name),
  }));

  const dateParts =
    raw["published-print"]?.["date-parts"]?.[0] ??
    raw["published-online"]?.["date-parts"]?.[0];
  const year = dateParts?.[0] ?? null;

  const source =
    raw["container-title"]?.[0] ?? raw.publisher ?? "Unknown Source";

  return {
    doi,
    title,
    authors,
    year,
    source,
    type: raw.type ?? "unknown",
    publisher: raw.publisher,
    url: raw.URL ?? (doi ? doiToUrl(doi) : undefined),
    abstract: raw.abstract?.replace(/<[^>]+>/g, ""), // strip JATS XML tags
    external_ids: {
      doi,
      isbn: raw.ISBN,
      issn: raw.ISSN,
    },
    raw_source: "crossref",
  };
}
