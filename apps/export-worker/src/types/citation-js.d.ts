declare module "citation-js" {
  export class Cite {
    constructor(data: unknown);
    format(type: string, opts?: Record<string, unknown>): string;
  }
}
