#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const kinds = ["script", "style", "localization", "font", "data"];
const demand = (condition, message) => { if (!condition) throw new Error(message); };

function git(repoRoot, args) {
  const result = spawnSync("git", ["-C", repoRoot, ...args], {
    encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true,
  });
  if (result.error) throw result.error;
  demand(result.status === 0, "Cannot verify the original source repository");
  return result.stdout.trim();
}

export function validateBuildHandoff(manifest, { repoRoot, artifactRoot }) {
  demand(manifest?.schemaVersion === 1 && /^[a-f0-9]{40}$/.test(manifest.head ?? ""),
    "Build handoff requires schemaVersion 1 and the exact source HEAD");
  demand(git(repoRoot, ["rev-parse", "HEAD"]) === manifest.head, "Build handoff HEAD differs from actual repository HEAD");
  demand(git(repoRoot, ["status", "--porcelain", "--untracked-files=no"]) === "",
    "Tracked source changes invalidate the committed build handoff");
  demand(typeof manifest.dependencyBasis === "string" && manifest.dependencyBasis.trim(),
    "Identify the build dependency manifest or analysis used to enumerate resources");
  demand(Array.isArray(manifest.resources) && manifest.resources.length > 0 && manifest.resources.length <= 10000 &&
    Array.isArray(manifest.entrypoints) && manifest.entrypoints.length > 0,
  "Build handoff requires resources and entrypoints");
  const root = fs.realpathSync(artifactRoot);
  const byId = new Map(), routes = new Set(), files = new Set();
  for (const resource of manifest.resources) {
    demand(resource && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/.test(resource.id ?? "") &&
      !byId.has(resource.id) && kinds.includes(resource.kind) &&
      /^[a-f0-9]{64}$/.test(resource.sha256 ?? "") &&
      Array.isArray(resource.dependencies) && new Set(resource.dependencies).size === resource.dependencies.length,
    "Invalid or duplicate build resource");
    demand(typeof resource.path === "string" && resource.path && !path.isAbsolute(resource.path) &&
      !resource.path.includes("\\") && !resource.path.includes(":") &&
      resource.path.split("/").every(part => part && part !== "." && part !== ".."),
    "Build resource path must be relative and confined");
    const target = fs.realpathSync(path.resolve(root, resource.path));
    const relative = path.relative(root, target);
    demand(relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative) &&
      fs.statSync(target).isFile() && !files.has(target), "Resource escapes artifact root or duplicates another file");
    const url = new URL(resource.url);
    demand(url.protocol === "https:" && !url.username && !url.password && !url.hash && !routes.has(url.href),
      "Resource URL must be unique HTTPS without credentials or fragments");
    const descriptor = fs.openSync(target, "r");
    try {
      const before = fs.fstatSync(descriptor);
      demand(before.isFile() && before.size <= 1024 * 1024 * 1024, "Build resource exceeds the 1 GiB file budget");
      const digest = crypto.createHash("sha256"), buffer = Buffer.alloc(65536);
      let length = 0, count;
      while ((count = fs.readSync(descriptor, buffer)) > 0) {
        if (length === 0) demand(!buffer.subarray(0, Math.min(count, 200)).toString("utf8")
          .startsWith("version https://git-lfs.github.com/spec/v1"), "Build resource is an unresolved Git LFS pointer");
        length += count;
        demand(length <= before.size, "Build resource grew during validation");
        digest.update(buffer.subarray(0, count));
      }
      const after = fs.fstatSync(descriptor);
      demand(length === before.size && after.size === before.size && after.mtimeMs === before.mtimeMs &&
        digest.digest("hex") === resource.sha256, `Build resource bytes changed: ${resource.id}`);
    } finally {
      fs.closeSync(descriptor);
    }
    byId.set(resource.id, resource);
    routes.add(url.href);
    files.add(target);
  }
  demand(new Set(manifest.entrypoints).size === manifest.entrypoints.length &&
    manifest.entrypoints.every(id => byId.has(id)), "Missing or duplicate build entrypoint");
  for (const resource of byId.values()) demand(resource.dependencies.every(id => typeof id === "string" && byId.has(id)),
    `Unresolved build dependency: ${resource.id}`);
  const reached = new Set();
  const pending = [...manifest.entrypoints];
  while (pending.length) {
    const id = pending.pop();
    if (reached.has(id)) continue;
    reached.add(id);
    for (const dependency of byId.get(id).dependencies) pending.push(dependency);
  }
  demand(reached.size === byId.size, "Unreachable resources must be linked to their actual entrypoint dependency");
  demand(manifest.coverage && Object.keys(manifest.coverage).sort().join(",") === [...kinds].sort().join(","),
    "Declare dependency coverage for script, style, localization, font and data");
  for (const kind of kinds) {
    const item = manifest.coverage[kind], included = manifest.resources.some(resource => resource.kind === kind);
    demand(item && typeof item.reason === "string" && item.reason.trim() &&
      item.status === (included ? "included" : "not-applicable"), `Unresolved dependency coverage: ${kind}`);
  }
  return { schemaVersion: 1, head: manifest.head, resourceCount: byId.size,
    validated: "declared-local-dependency-closure", loadedInBrowser: false,
    limits: "Hashes and declared dependency closure are verified. Completeness of the build inventory and actual browser loading require separate evidence." };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2), options = {};
    demand(args.length === 6, "Usage: validate-build-handoff.mjs --manifest <json> --repo-root <repo> --artifact-root <artifacts>");
    for (let index = 0; index < args.length; index += 2) {
      demand(["--manifest", "--repo-root", "--artifact-root"].includes(args[index]) && !options[args[index]],
        "Unknown or repeated build handoff argument");
      options[args[index]] = args[index + 1];
    }
    const manifestPath = options["--manifest"];
    demand(fs.statSync(manifestPath).size <= 4 * 1024 * 1024, "Build handoff manifest exceeds 4 MiB");
    console.log(JSON.stringify(validateBuildHandoff(JSON.parse(fs.readFileSync(manifestPath, "utf8")), {
      repoRoot: options["--repo-root"], artifactRoot: options["--artifact-root"],
    }), null, 2));
  } catch (error) {
    console.error(JSON.stringify({ error: error.message }));
    process.exitCode = 1;
  }
}
