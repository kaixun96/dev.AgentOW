import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";

const validator = fileURLToPath(new URL("../../tools/validate-review-report.mjs", import.meta.url));

function workspace() {
  return fs.mkdtempSync(`${os.tmpdir()}/agentow-priorart-`);
}

function validate(root, report, changed) {
  const reportPath = `${root}/review.json`;
  fs.writeFileSync(reportPath, JSON.stringify({ schemaVersion: 1, ...report }));
  fs.writeFileSync(`${root}/changed.txt`, `${changed.join("\n")}\n`);
  return spawnSync(
    process.execPath,
    [validator, reportPath, "--repo", root, "--changed-files", `${root}/changed.txt`],
    { encoding: "utf8", cwd: root },
  ).stdout;
}

function withPriorArt(priorArt) {
  return { preReview: { priorArt } };
}

// --- the miss this gate exists to prevent ----------------------------------
// A review produced 26 findings on a change that hand-rolled a screen-reader
// announcement helper. The platform already ships useScreenReaderAlert, in two
// places. Nothing in the review asked whether the capability already existed.
{
  const root = workspace();
  fs.mkdirSync(`${root}/src/common`, { recursive: true });
  fs.writeFileSync(
    `${root}/src/common/styles.ts`,
    "export const announcerStyle = { position: 'absolute' };\nexport function useAnnouncer(text) { return text; }\n",
  );
  const changed = ["src/common/styles.ts"];

  const silent = validate(root, withPriorArt([]), changed);
  assert.match(
    silent,
    /preReview\.priorArt omits shared-code exports .*useAnnouncer \(src\/common\/styles\.ts\)/,
    `the unanswered shared export is named: ${silent}`,
  );
  assert.match(silent, /announcerStyle/, "every shared export is named, not just the first");

  // Answering it is what the gate asks for. Finding that the platform already
  // ships it is the outcome the human reviewer reached.
  const answered = withPriorArt([
    {
      symbol: "announcerStyle",
      path: "src/common/styles.ts",
      searched: "git grep -nE 'visuallyHidden|srOnly'",
      result: "none",
    },
    {
      symbol: "useAnnouncer",
      path: "src/common/styles.ts",
      searched: "git grep -nE 'export function (useScreenReader|useAnnounce)'",
      result: "reused",
      existing: "sp-client/libraries/sp-component-utilities/src/hooks/useScreenReaderAlert.ts:8",
    },
  ]);
  assert.doesNotMatch(validate(root, answered, changed), /priorArt omits/, "answered exports clear the gate");

  fs.rmSync(root, { recursive: true, force: true });
}

// --- the answer has to be a real answer ------------------------------------
{
  const root = workspace();
  fs.mkdirSync(`${root}/src/hooks`, { recursive: true });
  fs.writeFileSync(`${root}/src/hooks/useThing.ts`, "export function useThing() { return 1; }\n");
  const changed = ["src/hooks/useThing.ts"];

  const base = { symbol: "useThing", path: "src/hooks/useThing.ts", searched: "git grep useThing" };

  assert.match(
    validate(root, withPriorArt([{ ...base, result: "maybe" }]), changed),
    /requires result of none, reused, or justified/,
    "an invented result value is rejected",
  );

  // Saying something already exists without naming it is not a search result.
  assert.match(
    validate(root, withPriorArt([{ ...base, result: "reused" }]), changed),
    /must cite the existing implementation/,
    "a claimed existing implementation must be cited",
  );

  // Keeping your own copy anyway is allowed, but it has to be argued.
  assert.match(
    validate(root, withPriorArt([{ ...base, result: "justified", existing: "lib/other.ts:1" }]), changed),
    /requires justification/,
    "keeping a new implementation requires a reason",
  );

  assert.doesNotMatch(
    validate(
      root,
      withPriorArt([{ ...base, result: "justified", existing: "lib/other.ts:1", justification: "the shared hook is bound to a v8 theme provider this page does not mount" }]),
      changed,
    ),
    /priorArt/,
    "a cited and justified divergence passes",
  );

  fs.rmSync(root, { recursive: true, force: true });
}

// --- feature code is not shared code ---------------------------------------
// Pages and layouts are inherently novel; demanding a prior-art search for
// every one of them would be noise the reviewer learns to ignore.
{
  const root = workspace();
  fs.mkdirSync(`${root}/src/layouts/addRole`, { recursive: true });
  fs.writeFileSync(`${root}/src/layouts/addRole/AddRolePage.tsx`, "export class AddRolePage {}\n");

  assert.doesNotMatch(
    validate(root, withPriorArt([]), ["src/layouts/addRole/AddRolePage.tsx"]),
    /priorArt omits/,
    "a feature page does not require a prior-art search",
  );

  fs.rmSync(root, { recursive: true, force: true });
}

console.log("prior art fixtures passed");
