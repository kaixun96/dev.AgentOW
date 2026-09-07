#!/usr/bin/env node

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_TTL_SECONDS = 60;
const DEFAULT_MAX_ATTEMPTS = 4;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runGit(repo, args) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["-C", repo, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

export function isRetryableFetchFailure(text) {
  return /(?:http\s*429|too many requests|rate limit|throttl|retry-after|http\s*5(?:00|02|03|04)|connection (?:reset|timed out)|operation timed out|remote end hung up)/i.test(text);
}

export function retryDelayMs(text, attempt, random = Math.random) {
  const retryAfter = /retry-after\s*[:=]\s*(\d+)/i.exec(text)?.[1];
  if (retryAfter) return Math.min(Number.parseInt(retryAfter, 10) * 1000, 120_000);
  const base = Math.min(2_000 * (2 ** (attempt - 1)), 30_000);
  return base + Math.floor(random() * Math.min(1_000, base / 2));
}

function readState(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) return {};
    throw error;
  }
}

function writeState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(temporary, file);
}

async function refExists(repo, remote, ref) {
  return (await runGit(repo, ["show-ref", "--verify", "--quiet", `refs/remotes/${remote}/${ref}`])).code === 0;
}

async function commitExists(repo, commit) {
  if (!commit) return true;
  return (await runGit(repo, ["cat-file", "-e", `${commit}^{commit}`])).code === 0;
}

export async function cachedFetch({ repo, refs, remote = "origin", ensureCommit, ttlSeconds = DEFAULT_TTL_SECONDS, maxAttempts = DEFAULT_MAX_ATTEMPTS, cacheRoot = path.join(os.homedir(), ".cache", "agentow", "fetch") }) {
  if (!repo || !refs?.length) throw new Error("--repo and at least one --ref are required");
  const normalizedRefs = [...new Set(refs.map((ref) => ref.replace(/^refs\/heads\//, "")))].sort();
  if (normalizedRefs.some((ref) => !ref || ref.startsWith("-") || ref.includes("..") || /[~^:?*\[\\\s]/.test(ref))) throw new Error("Unsupported ref name");
  if (ensureCommit && !/^[0-9a-f]{40}$/i.test(ensureCommit)) throw new Error("--ensure-commit must be a 40-character SHA");

  const [remoteUrl, commonDir] = await Promise.all([
    runGit(repo, ["remote", "get-url", remote]),
    runGit(repo, ["rev-parse", "--path-format=absolute", "--git-common-dir"]),
  ]);
  if (remoteUrl.code !== 0) throw new Error(remoteUrl.stderr.trim());
  if (commonDir.code !== 0) throw new Error(commonDir.stderr.trim());
  const key = crypto.createHash("sha256").update(`${remoteUrl.stdout.trim().toLowerCase()}\n${commonDir.stdout.trim().toLowerCase()}\n${normalizedRefs.join("\n")}`).digest("hex");
  const stateFile = path.join(cacheRoot, `${key}.json`);
  const state = readState(stateFile);
  const fresh = state.fetchedAt && Date.now() - Date.parse(state.fetchedAt) <= ttlSeconds * 1000;
  const refsPresent = (await Promise.all(normalizedRefs.map((ref) => refExists(repo, remote, ref)))).every(Boolean);
  if (fresh && refsPresent && await commitExists(repo, ensureCommit)) {
    console.log(`AgentOW fetch cache hit (${normalizedRefs.join(", ")}); skipped.`);
    return { fetched: false };
  }

  const refspecs = normalizedRefs.map((ref) => `+refs/heads/${ref}:refs/remotes/${remote}/${ref}`);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await runGit(repo, ["fetch", "--no-tags", remote, ...refspecs]);
    if (result.code === 0) break;
    if (attempt === maxAttempts || !isRetryableFetchFailure(result.stderr)) throw new Error(`git fetch failed after ${attempt} attempt(s):\n${result.stderr.trim()}`);
    const delay = retryDelayMs(result.stderr, attempt);
    console.error(`Fetch throttled; retrying in ${delay}ms (${attempt + 1}/${maxAttempts}).`);
    await sleep(delay);
  }
  if (!await commitExists(repo, ensureCommit)) throw new Error(`Required commit ${ensureCommit} is unavailable after fetch`);
  writeState(stateFile, { fetchedAt: new Date().toISOString(), remote: remoteUrl.stdout.trim(), refs: normalizedRefs });
  console.log(`AgentOW fetch complete (${normalizedRefs.join(", ")}).`);
  return { fetched: true };
}

function parseArgs(args) {
  const options = { refs: [] };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
    if (!value) throw new Error(`Missing value for ${arg}`);
    index += 1;
    if (arg === "--repo") options.repo = value;
    else if (arg === "--ref") options.refs.push(value);
    else if (arg === "--remote") options.remote = value;
    else if (arg === "--ensure-commit") options.ensureCommit = value;
    else if (arg === "--ttl-seconds") options.ttlSeconds = Number.parseInt(value, 10);
    else if (arg === "--max-attempts") options.maxAttempts = Number.parseInt(value, 10);
    else if (arg === "--cache-root") options.cacheRoot = value;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

if (process.argv[1]?.endsWith("cached-fetch.mjs")) {
  try {
    await cachedFetch(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
