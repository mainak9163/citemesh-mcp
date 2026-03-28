import { fetch } from "undici";
import type {
  SearchWorksResponse,
  WorkRecord,
  BatchLookupResponse,
  EnrichedWork,
  ExportResponse,
  BibliographyResponse,
  BibliographyFormat,
  ExportFormat,
} from "@citemesh/contracts";
import { ErrorType, makeError } from "@citemesh/contracts";
import type { Logger } from "pino";

// ─── Internal Service Client ─────────────────────────────────────────────────
// The MCP gateway is intentionally thin — all business logic lives in the
// downstream services. This client is the only place HTTP is done in the gateway.

async function post<T>(url: string, body: unknown, logger: Logger): Promise<T> {
  logger.debug({ url }, "→ service call");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json() as T;

  if (!res.ok) {
    const err = data as { type?: string; message?: string };
    throw makeError(
      (err.type as (typeof ErrorType)[keyof typeof ErrorType]) ?? ErrorType.UPSTREAM_API_FAILURE,
      err.message ?? `Service error ${res.status}`,
      data
    );
  }

  return data;
}

export function createServiceClient(
  federatorUrl: string,
  exportUrl: string,
  logger: Logger
) {
  const log = logger.child({ module: "service-client" });

  return {
    async searchWorks(params: {
      query?: string;
      author?: string;
      rows?: number;
      offset?: number;
    }): Promise<SearchWorksResponse> {
      return post(`${federatorUrl}/search`, params, log);
    },

    async resolveDoi(doi: string): Promise<WorkRecord> {
      return post(`${federatorUrl}/resolve`, { doi }, log);
    },

    async batchLookup(dois: string[]): Promise<BatchLookupResponse> {
      return post(`${federatorUrl}/batch`, { dois }, log);
    },

    async enrichWork(params: {
      doi?: string;
      title?: string;
    }): Promise<EnrichedWork> {
      return post(`${federatorUrl}/enrich`, params, log);
    },

    async exportWorks(
      works: WorkRecord[],
      format: ExportFormat
    ): Promise<ExportResponse> {
      return post(`${exportUrl}/export`, { works, format }, log);
    },

    async buildBibliography(params: {
      works?: WorkRecord[];
      dois?: string[];
      format: BibliographyFormat;
    }): Promise<BibliographyResponse> {
      return post(`${exportUrl}/bibliography`, params, log);
    },
  };
}

export type ServiceClient = ReturnType<typeof createServiceClient>;
