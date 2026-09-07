import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isRetryableFetchFailure, retryDelayMs } from "../../tools/cached-fetch.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const tool = path.join(root, "tools", "cached-fetch.mjs");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "agentow-fetch-cache-"));
const remote = path.join(temporary, "remote.git");
const seed = path.join(temporary, "seed");
const checkout = path.join(temporary, "checkout");
const cache = path.join(temporary, "cache");

function run(command, args, cwd = temporary) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, `${command} failed:\n${result.stderr}`);
  return result;
}

try {
  run("git", ["init", "--bare", remote]);
  run("git", ["init", "-b", "main", seed]);
  run("git", ["config", "user.email", "test@example.invalid"], seed);
  run("git", ["config", "user.name", "AgentOW Test"], seed);
  fs.writeFileSync(path.join(seed, "README.md"), "test\n");
  run("git", ["add", "README.md"], seed);
  run("git", ["commit", "-m", "seed"], seed);
  run("git", ["remote", "add", "origin", remote], seed);
  run("git", ["push", "origin", "main"], seed);
  run("git", ["clone", remote, checkout]);
  const args = [tool, "--repo", checkout, "--ref", "main", "--cache-root", cache];
  assert.match(run(process.execPath, args).stdout, /fetch complete/);
  assert.match(run(process.execPath, args).stdout, /cache hit/);
  assert.equal(isRetryableFetchFailure("HTTP 429 Too Many Requests"), true);
  assert.equal(isRetryableFetchFailure("repository not found"), false);
  assert.equal(retryDelayMs("Retry-After: 7", 1, () => 0), 7000);
  console.log("remote cache tests passed");
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
