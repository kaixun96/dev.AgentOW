import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildRouting } from "../../tools/build-review-skill-routing.mjs";

const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentow-review-skills-"));
const identity = { reviewedHead: "a".repeat(40), mergeBase: "b".repeat(40), diffDigest: "c".repeat(64) };
const unconfigured = buildRouting({ repoRoot, manifestPath: ".agentow/review-skills.json", ...identity, changedFiles: ["src/auth/a.ts"], diff: "+ policy" });
assert.equal(unconfigured.discovery.status, "unconfigured");
assert.deepEqual(unconfigured.skills, []);

fs.mkdirSync(path.join(repoRoot, ".agentow"), { recursive: true });
fs.mkdirSync(path.join(repoRoot, ".ai", "auth"), { recursive: true });
fs.writeFileSync(path.join(repoRoot, ".ai", "auth", "SKILL.md"), "# Auth review\n");
fs.writeFileSync(path.join(repoRoot, ".ai", "auth", "guest.md"), "# Guest policy\n");
fs.writeFileSync(path.join(repoRoot, ".agentow", "review-skills.json"), JSON.stringify({
  schemaVersion: 1,
  skills: [{
    id: "auth",
    path: ".ai/auth/SKILL.md",
    triggers: { paths: ["src/auth/**"], terms: ["authorization"] },
    packs: [{ id: "guest", path: ".ai/auth/guest.md", triggers: { terms: ["guest"] } }],
  }],
}));
const configured = buildRouting({ repoRoot, manifestPath: ".agentow/review-skills.json", ...identity, changedFiles: ["src/auth/check.ts"], diff: "+ deny guest" });
assert.equal(configured.discovery.status, "configured");
assert.equal(configured.skills[0].disposition, "selected");
assert.equal(configured.skills[0].packs[0].disposition, "selected");
assert.match(configured.skills[0].sourceDigest, /^[0-9a-f]{64}$/);

console.log("review skill routing tests passed");
