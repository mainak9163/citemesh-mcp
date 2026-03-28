#!/usr/bin/env node
import "dotenv/config";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import pino from "pino";
import { createServiceClient } from "./service-client.js";
import { toolDefinitions, createToolHandlers } from "./tools.js";
import { ErrorType, makeError } from "@citemesh/contracts";
import { zodToJsonSchema } from "zod-to-json-schema";

// ─── MCP Gateway ─────────────────────────────────────────────────────────────
// Thin orchestration layer. Receives MCP tool calls over stdio, validates input
// with Zod, delegates to downstream Fastify services, and returns results.
// Business logic lives in metadata-federator and export-worker — not here.

const FEDERATOR_URL = process.env.METADATA_FEDERATOR_URL ?? "http://localhost:3001";
const EXPORT_URL = process.env.EXPORT_WORKER_URL ?? "http://localhost:3002";
const LOG_LEVEL = process.env.LOG_LEVEL ?? "info";

// MCP servers communicate over stdio, so we log to stderr to avoid polluting
// the stdio transport channel.
const logger = pino(
  { level: LOG_LEVEL, name: "mcp-gateway" },
  pino.destination({ dest: 2 }) // stderr
);

const client = createServiceClient(FEDERATOR_URL, EXPORT_URL, logger);
const handlers = createToolHandlers(client, logger);

const server = new Server(
  {
    name: "citemesh-mcp",
    version: "0.1.0",
  },
  {
    capabilities: { tools: {} },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: toolDefinitions.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: zodToJsonSchema(tool.inputSchema) as Record<string, unknown>,
  })),
}));

// Dispatch tool calls
server.setRequestHandler(CallToolRequestSchema, async (request): Promise<{
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}> => {
  const { name, arguments: args } = request.params;

  logger.info({ tool: name }, "tool call received");

  // Find and validate the tool
  const toolDef = toolDefinitions.find((t) => t.name === name);
  if (!toolDef) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            makeError(ErrorType.VALIDATION_ERROR, `Unknown tool: ${name}`)
          ),
        },
      ],
      isError: true,
    };
  }

  // Validate input with Zod
  const parsed = toolDef.inputSchema.safeParse(args ?? {});
  if (!parsed.success) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            makeError(
              ErrorType.VALIDATION_ERROR,
              "Invalid tool input",
              parsed.error.flatten()
            )
          ),
        },
      ],
      isError: true,
    };
  }

  try {
    const handler = handlers[name as keyof typeof handlers];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (handler as (input: any) => Promise<{
      content: Array<{ type: "text"; text: string }>;
      isError?: boolean;
    }>)(parsed.data);
    return result;
  } catch (err: unknown) {
    const e = err as { type?: string; message?: string };
    logger.error({ err, tool: name }, "tool call failed");
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            makeError(
              (e?.type as (typeof ErrorType)[keyof typeof ErrorType]) ??
                ErrorType.INTERNAL_ERROR,
              e?.message ?? "Unexpected error",
              e
            )
          ),
        },
      ],
      isError: true,
    };
  }
});

// Connect to stdio transport (standard for local MCP servers)
const transport = new StdioServerTransport();
await server.connect(transport);
logger.info("CItemesh MCP gateway started (stdio transport)");
