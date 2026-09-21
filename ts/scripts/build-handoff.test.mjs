import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { validateBuildHandoff } from "../../tools/validate-build-handoff.mjs";

const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "build-handoff-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repoRoot = path.join(root, "repo"), artifactRoot = path.join(root, "artifacts");
  fs.mkdirSync(repoRoot); fs.mkdirSync(artifactRoot);
  const git = (...args) => execFileSync("git", ["-C", repoRoot, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init"); fs.writeFileSync(path.join(repoRoot, "source.txt"), "fixture");
  git("add", "source.txt"); git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture");
  const resources = ["script", "localization", "font"].map((kind, index) => {
    const name = `${kind}.bin`, body = Buffer.from(`fixture-${kind}`);
    fs.writeFileSync(path.join(artifactRoot, name), body);
    return { id: kind, kind, path: name, url: `https://example.invalid/${name}`, sha256: hash(body),
      dependencies: index === 0 ? ["localization", "font"] : [] };
  });
  const manifest = { schemaVersion: 1, head: git("rev-parse", "HEAD"), dependencyBasis: "fixture build graph",
    entrypoints: ["script"], resources, coverage: Object.fromEntries(
      ["script", "style", "localization", "font", "data"].map(kind => [kind, {
        status: resources.some(resource => resource.kind === kind) ? "included" : "not-applicable",
        reason: `fixture ${kind} disposition`,
      }])) };
  return { manifest, options: { repoRoot, artifactRoot } };
}

test("build handoff binds actual HEAD and every declared resource without claiming browser readiness", t => {
  const f = fixture(t), result = validateBuildHandoff(f.manifest, f.options);
  assert.equal(result.resourceCount, 3);
  assert.equal(result.loadedInBrowser, false);
  for (const alter of [
    value => { value.head = "a".repeat(40); },
    value => { value.resources.pop(); },
    value => { value.resources[0].sha256 = "a".repeat(64); },
    value => { value.resources[0].dependencies.push("missing"); },
    value => { value.resources[0].path = "../source.txt"; },
    value => { value.resources[0].url = "https://user:secret@example.invalid/script"; },
    value => { value.coverage.font = { status: "unknown", reason: "not investigated" }; },
    value => { value.resources[0].dependencies = []; },
  ]) {
    const changed = structuredClone(f.manifest); alter(changed);
    assert.throws(() => validateBuildHandoff(changed, f.options));
  }
});

test("unresolved LFS pointers and dirty tracked source cannot reach AFTER", t => {
  const f = fixture(t);
  const pointer = "version https://git-lfs.github.com/spec/v1\noid sha256:" + "a".repeat(64) + "\nsize 12\n";
  fs.writeFileSync(path.join(f.options.artifactRoot, "font.bin"), pointer);
  f.manifest.resources[2].sha256 = hash(pointer);
  assert.throws(() => validateBuildHandoff(f.manifest, f.options), /LFS pointer/);
  fs.writeFileSync(path.join(f.options.repoRoot, "source.txt"), "changed");
  assert.throws(() => validateBuildHandoff(f.manifest, f.options), /Tracked source/);
});
