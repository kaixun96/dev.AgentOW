#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
export function isRetryableAdoFailure(text) { return /(?:http\s*429|too many requests|rate limit|throttl|retry-after|http\s*5(?:00|02|03|04)|connection (?:reset|timed out)|operation timed out)/i.test(text); }
function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("az", args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}
function value(args, name, fallback) { const index = args.indexOf(name); return index < 0 ? fallback : args[index + 1]; }
const args = process.argv.slice(2);
try {
  const id = value(args, "--id"); const out = value(args, "--out");
  if (!/^\d+$/.test(id ?? "") || !out) throw new Error("Usage: ado-pr-show.mjs --id <number> --out <file>");
  const azArgs = ["repos", "pr", "show", "--id", id, "--org", value(args, "--org", "https://dev.azure.com/onedrive"), "--project", value(args, "--project", "ODSP-Web"), "--output", "json"];
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const result = await run(azArgs);
    if (result.code === 0) { JSON.parse(result.stdout); fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true }); fs.writeFileSync(out, result.stdout); break; }
    if (attempt === 4 || !isRetryableAdoFailure(`${result.stdout}\n${result.stderr}`)) throw new Error(`az repos pr show failed after ${attempt} attempt(s):\n${result.stderr.trim()}`);
    await sleep(Math.min(1000 * (2 ** (attempt - 1)), 30_000));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
