import { fetch } from "undici";
import type { WikidataEntity } from "@citemesh/contracts";
import { ErrorType, makeError } from "@citemesh/contracts";
import type { ResponseCache } from "../cache/response-cache.js";
import { ResponseCache as RC } from "../cache/response-cache.js";
import type { Logger } from "pino";

// ─── Wikidata Enrichment Client ───────────────────────────────────────────────
// Uses the Wikidata SPARQL endpoint to look up scholarly works and their authors.
// We search by DOI first, then by title as fallback.

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";

export class WikidataClient {
  private cache: ResponseCache;
  private logger: Logger;

  constructor(cache: ResponseCache, logger: Logger) {
    this.cache = cache;
    this.logger = logger.child({ service: "WikidataClient" });
  }

  async findWorkByDoi(doi: string): Promise<WikidataEntity | null> {
    const cacheKey = RC.buildKey("wikidata:work:doi", { doi });
    const cached = this.cache.get<WikidataEntity | null>(cacheKey);
    if (cached !== null && cached !== undefined) return cached;

    const query = `
      SELECT ?item ?itemLabel ?itemDescription WHERE {
        ?item wdt:P356 "${doi.toUpperCase()}" .
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      } LIMIT 1
    `;

    const result = await this.runSparql(query);
    const binding = result?.results?.bindings?.[0];

    if (!binding) {
      this.cache.set(cacheKey, null);
      return null;
    }

    const entity: WikidataEntity = {
      entity_id: binding.item.value.replace("http://www.wikidata.org/entity/", ""),
      label: binding.itemLabel?.value,
      description: binding.itemDescription?.value,
    };

    this.cache.set(cacheKey, entity);
    return entity;
  }

  async findWorkByTitle(title: string): Promise<WikidataEntity | null> {
    const cacheKey = RC.buildKey("wikidata:work:title", { title });
    const cached = this.cache.get<WikidataEntity | null>(cacheKey);
    if (cached !== null && cached !== undefined) return cached;

    // Escape title for SPARQL string literal
    const escaped = title.replace(/"/g, '\\"').slice(0, 200);
    const query = `
      SELECT ?item ?itemLabel ?itemDescription WHERE {
        ?item wdt:P31 wd:Q13442814 .
        ?item rdfs:label "${escaped}"@en .
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      } LIMIT 1
    `;

    const result = await this.runSparql(query);
    const binding = result?.results?.bindings?.[0];

    if (!binding) {
      this.cache.set(cacheKey, null);
      return null;
    }

    const entity: WikidataEntity = {
      entity_id: binding.item.value.replace("http://www.wikidata.org/entity/", ""),
      label: binding.itemLabel?.value,
      description: binding.itemDescription?.value,
    };

    this.cache.set(cacheKey, entity);
    return entity;
  }

  private async runSparql(
    query: string
  ): Promise<{ results: { bindings: Record<string, { value: string }>[] } } | null> {
    const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;
    this.logger.debug({ query: query.slice(0, 80) }, "running SPARQL query");

    try {
      const res = await fetch(url, {
        headers: {
          Accept: "application/sparql-results+json",
          "User-Agent": "CItemesh-MCP/0.1",
        },
      });

      if (!res.ok) {
        this.logger.warn({ status: res.status }, "Wikidata SPARQL failed");
        return null;
      }

      return (await res.json()) as {
        results: { bindings: Record<string, { value: string }>[] };
      };
    } catch (err) {
      this.logger.warn({ err }, "Wikidata request threw");
      return null;
    }
  }
}
