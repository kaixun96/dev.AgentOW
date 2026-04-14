#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { FileLogger, purgeLogs } from "../shared/logger.js";
import { registerOwTools } from "./mcp/owTools.js";
import { OW_MCP_INSTRUCTIONS } from "./mcp/instructions.js";

const args = process.argv.slice(2);
const command = args[0] ?? "";

if (command !== "mcp") {
  process.stdout.write("Usage: agentow mcp\n  Start as an MCP server (stdio transport).\n");
  process.exit(1);
}

const distDir = path.dirname(url.fileURLToPath(import.meta.url));
const logsDir = path.join(distDir, "logs");
const toolLogDir = path.join(logsDir, "tools");
fs.mkdirSync(toolLogDir, { recursive: true });
purgeLogs(logsDir, 7);
const logger = new FileLogger(logsDir, "ow-mcp");

const server = new McpServer(
  { name: "ow", version: "1.0.0" },
  { instructions: OW_MCP_INSTRUCTIONS },
);
registerOwTools(server, logger, toolLogDir);

const transport = new StdioServerTransport();
await server.connect(transport);

process.on("uncaughtException", (err) => {
  logger.error("uncaughtException", `${err.message}\n${err.stack ?? ""}`);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  logger.error("unhandledRejection", String(reason));
});
process.on("SIGINT", () => { logger.close(); process.exit(0); });
process.on("SIGTERM", () => { logger.close(); process.exit(0); });
process.stdin.on("close", () => { logger.close(); process.exit(0); });
