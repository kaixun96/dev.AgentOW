import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildInventory, extractRules } from "../../tools/build-review-rule-inventory.mjs";

const builder = fileURLToPath(new URL("../../tools/build-review-rule-inventory.mjs", import.meta.url));

const head = "a".repeat(40);
const mergeBase = "b".repeat(40);
const diffDigest = "c".repeat(64);
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

const generalRegistry = JSON.parse(fs.readFileSync(path.join(repoRoot, "review-rule-registry.json"), "utf8"));
const graduationRegistry = JSON.parse(fs.readFileSync(path.join(repoRoot, "graduation-review-rule-registry.json"), "utf8"));
const referencePaths = fs.readdirSync(path.join(repoRoot, "skills/ow-review/references"))
  .filter((name) => name.endsWith(".md"))
  .map((name) => `skills/ow-review/references/${name}`);
const requiredGeneralDocuments = [
  "docs/review-contract.md",
  "docs/review-misses.md",
  "docs/sp-client-review-profile.md",
];
assert.deepEqual(
  [...new Set([...generalRegistry.references, ...graduationRegistry.references])].sort(),
  [...referencePaths, ...requiredGeneralDocuments].sort(),
  "the policy registries must cover every review reference and general contract/profile",
);
assert.deepEqual(
  graduationRegistry.references,
  ["skills/ow-review/references/graduation.md"],
  "graduation-only remains isolated in its own exhaustive registry",
);
assert.ok(
  !generalRegistry.references.includes("skills/ow-review/references/graduation.md"),
  "the general registry must not mix in graduation-only policy",
);

const source = `
# Accessibility

Review every state consumer before approving the interaction.

Historical background about the component architecture.

- Verify keyboard and focus behavior for every reachable operation.

\`\`\`ts
// Must not become a rule because this is example code.
focus();
\`\`\`

<!-- review-rule: stable.custom-rule -->
Do not approve an unverified external contract.
`;
const rules = extractRules(source, "accessibility", "accessibility.md");
assert.equal(rules.length, 4, "every prose block is inventoried while examples are excluded");
assert.ok(
  rules.some((rule) => rule.line === 6),
  "a rule cannot be omitted merely because its wording lacks a normative keyword",
);
assert.ok(rules.some((rule) => rule.id === "stable.custom-rule"), "explicit stable rule ids are supported");

const repeatedRules = extractRules("Check focus.\n\nCheck focus.\n", "accessibility", "accessibility.md");
assert.equal(new Set(repeatedRules.map((rule) => rule.id)).size, 2, "repeated prose receives distinct occurrence ids");
assert.ok(repeatedRules[1].id.endsWith(".2"), "repeated generated ids use a deterministic occurrence suffix");

const moved = extractRules(`\n\n${source}`, "accessibility", "accessibility.md");
assert.deepEqual(
  moved.map((rule) => rule.id).sort(),
  rules.map((rule) => rule.id).sort(),
  "moving a rule without changing its meaning preserves its id",
);

const changed = extractRules(
  source.replace("every state consumer", "every producer and consumer"),
  "accessibility",
  "accessibility.md",
);
assert.notDeepEqual(
  changed.map((rule) => rule.id).sort(),
  rules.map((rule) => rule.id).sort(),
  "changing normative prose changes the generated inventory",
);
assert.ok(changed.some((rule) => rule.id === "stable.custom-rule"), "explicit ids survive intentional wording changes");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentow-rule-inventory-"));
fs.writeFileSync(path.join(root, "a11y.md"), source);
fs.writeFileSync(path.join(root, "loc.md"), "Visible strings must use localized resources.\n");
const inventory = buildInventory({
  repoRoot: root,
  references: ["a11y.md", "loc.md"],
  reviewedHead: head,
  mergeBase,
  diffDigest,
});
assert.equal(inventory.references.length, 2, "all routed references are frozen");
assert.equal(inventory.rules.length, 5, "rules from unrelated metrics share the same inventory mechanism");
assert.equal(inventory.reviewedHead, head);
assert.equal(inventory.mergeBase, mergeBase);
assert.equal(inventory.diffDigest, diffDigest);
const registryPath = path.join(root, "review-rule-registry.json");
const outputPath = path.join(root, "review-rule-inventory.json");
fs.writeFileSync(registryPath, JSON.stringify({ schemaVersion: 1, references: ["a11y.md", "loc.md"] }));
execFileSync(process.execPath, [
  builder,
  "--repo", root,
  "--registry", registryPath,
  "--expected-head", head,
  "--expected-merge-base", mergeBase,
  "--expected-diff-digest", diffDigest,
  "--out", outputPath,
]);
assert.match(JSON.parse(fs.readFileSync(outputPath, "utf8")).registryDigest, /^[0-9a-f]{64}$/);
assert.equal(
  spawnSync(process.execPath, [
    builder,
    "--repo", root,
    "--reference", "a11y.md",
    "--expected-head", head,
    "--expected-merge-base", mergeBase,
    "--expected-diff-digest", diffDigest,
    "--out", outputPath,
  ]).status,
  1,
  "callers cannot replace the canonical registry with a selected reference subset",
);
fs.rmSync(root, { recursive: true, force: true });

console.log("review rule inventory fixtures passed");