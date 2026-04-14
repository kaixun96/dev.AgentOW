import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, type ZodRawShape } from "zod";
import type { FileLogger, RawOutputLog } from "./logger.js";

export type McpToolResult = { content: Array<{ type: "text"; text: string }> };

type ToolExtras = { signal?: AbortSignal; sendNotification?: (n: unknown) => Promise<void> };

export function registerMcpTool(
  server: McpServer,
  name: string,
  config: { description: string },
  handler: (extras: ToolExtras) => Promise<McpToolResult>
): void;

export function registerMcpTool<TSchema extends ZodRawShape>(
  server: McpServer,
  name: string,
  config: { description: string; inputSchema: TSchema },
  handler: (args: z.infer<z.ZodObject<TSchema>>, extras: ToolExtras) => Promise<McpToolResult>
): void;

export function registerMcpTool(
  server: McpServer,
  name: string,
  config: object,
  handler: (...args: any[]) => Promise<McpToolResult>,
): void {
  (server as any).registerTool(name, config, handler);
}

export function textResult(text: string): McpToolResult {
  return { content: [{ type: "text", text }] };
}

type NotMessageOnly<T extends object> = keyof T extends "message" ? never : T;

export function successResult<T extends object>(data: T & NotMessageOnly<T>): McpToolResult {
  return jsonResult(data);
}

export function jsonResult<T extends object>(data: T): McpToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export function textResultFromLines(lines: string[]): McpToolResult {
  return textResult(lines.join("\n"));
}

export function sendLineNotification(
  extras: { sendNotification?: (n: any) => Promise<void> },
  toolName: string,
  line: string,
): void {
  extras.sendNotification?.({
    method: "notifications/message",
    params: { level: "info", logger: toolName, data: line },
  }).catch(() => {});
}

export function largeOutputResult<T extends object>(
  log: RawOutputLog,
  logger: FileLogger,
  toolName: string,
  data: T & NotMessageOnly<T>,
): McpToolResult {
  log.end();
  logger.debug(toolName, `output:\n${JSON.stringify(data, null, 2)}`);
  return jsonResult(data);
}

export function successResultWithDebug<T extends object>(
  logger: FileLogger,
  toolName: string,
  data: T & NotMessageOnly<T>,
): McpToolResult {
  logger.debug(toolName, `output:\n${JSON.stringify(data, null, 2)}`);
  return jsonResult(data);
}

export function throwToolError(data: Record<string, unknown>): never {
  throw new Error(JSON.stringify(data));
}

export function tryParseJson(s: string): Record<string, unknown> | null {
  try { return JSON.parse(s) as Record<string, unknown>; } catch { return null; }
}

export function truncateLines(lines: string[], max = 20): { output: string[]; truncated: boolean } {
  if (lines.length <= max) return { output: lines, truncated: false };
  return {
    output: [
      `... ${lines.length - max} lines omitted ...`,
      ...lines.slice(lines.length - max),
    ],
    truncated: true,
  };
}
