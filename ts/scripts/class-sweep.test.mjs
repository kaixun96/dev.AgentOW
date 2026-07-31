import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";

const validator = new URL("../../tools/validate-review-report.mjs", import.meta.url).pathname;

function run(args, cwd) {
  return spawnSync(process.execPath, args, { encoding: "utf8", cwd });
}

function workspace() {
  return fs.mkdtempSync(`${os.tmpdir()}/agentow-sweep-`);
}

function validate(root, report, extraArgs = []) {
  const reportPath = `${root}/review.json`;
  fs.writeFileSync(reportPath, JSON.stringify({ schemaVersion: 1, ...report }));
  return run([validator, reportPath, "--repo", root, ...extraArgs], root).stdout;
}

function finding(overrides) {
  return {
    id: "R1",
    severity: "Important",
    category: "securityPrivacy",
    path: "GroupsPage.tsx",
    line: 1,
    description: "An unvalidated URL is rendered as a link target",
    impact: "A stored javascript: URL executes when the user clicks the link",
    suggestedFix: "Allowlist http and https before rendering a link",
    evidence: ["GroupsPage.tsx:1"],
    ...overrides,
  };
}

// --- the miss this gate exists to prevent ----------------------------------
// A review reported one unvalidated href and stopped. A second render site in
// the same change had the identical defect, and the fix for the first never
// reached it.
{
  const root = workspace();
  fs.writeFileSync(`${root}/GroupsPage.tsx`, "<Link href={user.notes}>about</Link>\n");
  fs.writeFileSync(`${root}/UserDispPage.tsx`, "const x = 1;\n<Link href={user.pictureUrl}>pic</Link>\n");
  fs.writeFileSync(`${root}/changed.txt`, "GroupsPage.tsx\nUserDispPage.tsx\n");

  const sweep = {
    query: "<Link href=\\{",
    scope: ["GroupsPage.tsx", "UserDispPage.tsx"],
    accountedFor: [],
  };

  const missed = { findings: [finding({ classSweep: sweep })] };
  const out = validate(root, missed, ["--changed-files", `${root}/changed.txt`]);
  assert.match(
    out,
    /R1 classSweep leaves 1 instance\(s\) of its own class unaccounted for: UserDispPage\.tsx:2/,
    `the second instance is named: ${out}`,
  );

  // Reporting it as its own finding satisfies the sweep.
  const bothReported = {
    findings: [
      finding({ classSweep: sweep }),
      finding({ id: "R2", path: "UserDispPage.tsx", line: 2, evidence: ["UserDispPage.tsx:2"], classSweep: sweep }),
    ],
  };
  assert.doesNotMatch(
    validate(root, bothReported, ["--changed-files", `${root}/changed.txt`]),
    /classSweep leaves/,
    "reporting every instance clears the sweep",
  );

  // So does accounting for it explicitly, for the case where it is genuinely safe.
  const explained = {
    findings: [finding({ classSweep: { ...sweep, accountedFor: ["UserDispPage.tsx:2"] } })],
  };
  assert.doesNotMatch(
    validate(root, explained, ["--changed-files", `${root}/changed.txt`]),
    /classSweep leaves/,
    "an explicitly accounted instance clears the sweep",
  );

  fs.rmSync(root, { recursive: true, force: true });
}

// --- the sweep cannot be faked ---------------------------------------------
{
  const root = workspace();
  fs.writeFileSync(`${root}/GroupsPage.tsx`, "<Link href={user.notes}>about</Link>\n");
  fs.writeFileSync(`${root}/UserDispPage.tsx`, "<Link href={user.pictureUrl}>pic</Link>\n");
  fs.writeFileSync(`${root}/changed.txt`, "GroupsPage.tsx\nUserDispPage.tsx\n");

  const missing = { findings: [finding({})] };
  assert.match(
    validate(root, missing, ["--changed-files", `${root}/changed.txt`]),
    /R1 requires classSweep with a query and a non-empty scope/,
    "a blocking finding must carry a sweep",
  );

  // A query that does not match the line it reports is describing something else.
  const wrongQuery = {
    findings: [finding({ classSweep: { query: "somethingElse", scope: ["GroupsPage.tsx"], accountedFor: [] } })],
  };
  assert.match(
    validate(root, wrongQuery, ["--changed-files", `${root}/changed.txt`]),
    /does not match its own cited line/,
    "the query must describe the reported defect",
  );

  // Sweeping only the file the defect was spotted in is exactly the miss.
  const narrowScope = {
    findings: [finding({ classSweep: { query: "<Link href=\\{", scope: ["GroupsPage.tsx"], accountedFor: [] } })],
  };
  assert.match(
    validate(root, narrowScope, ["--changed-files", `${root}/changed.txt`]),
    /classSweep\.scope omits changed \.tsx files it must sweep: UserDispPage\.tsx/,
    "the scope must cover every changed sibling of the same type",
  );

  const badRegex = {
    findings: [finding({ classSweep: { query: "([", scope: ["GroupsPage.tsx"], accountedFor: [] } })],
  };
  assert.match(
    validate(root, badRegex, ["--changed-files", `${root}/changed.txt`]),
    /is not a valid regular expression/,
    "an unusable query is rejected rather than silently passing",
  );

  fs.rmSync(root, { recursive: true, force: true });
}

// --- a Minor nit is not forced through the sweep ---------------------------
{
  const root = workspace();
  fs.writeFileSync(`${root}/GroupsPage.tsx`, "<Link href={user.notes}>about</Link>\n");
  fs.writeFileSync(`${root}/changed.txt`, "GroupsPage.tsx\n");

  const nit = {
    findings: [finding({ severity: "Minor", description: "Nit: the header comment is stale" })],
  };
  assert.doesNotMatch(
    validate(root, nit, ["--changed-files", `${root}/changed.txt`]),
    /classSweep/,
    "sweeping is required for blocking findings, not for every nit",
  );

  fs.rmSync(root, { recursive: true, force: true });
}

// --- external contracts must be evidenced from outside the change ----------
{
  const root = workspace();
  fs.writeFileSync(`${root}/changed.txt`, "sp-client/src/Page.tsx\n");
  const base = {
    preReview: { externalContracts: [] },
    findings: [],
  };

  assert.match(
    validate(root, base, ["--changed-files", `${root}/changed.txt`]),
    /externalContractsNotApplicableReason/,
    "claiming no external contract requires saying why",
  );

  const selfCited = structuredClone(base);
  selfCited.preReview.externalContracts = [
    {
      symbol: "Switch",
      module: "react-router",
      verifiedBehavior: "reads path off its direct children",
      evidence: "sp-client/src/Page.tsx:4",
    },
  ];
  assert.match(
    validate(root, selfCited, ["--changed-files", `${root}/changed.txt`]),
    /which this PR changed; the contract must be evidenced from the dependency's own source/,
    "a contract cannot be evidenced from the file under review",
  );

  const proper = structuredClone(selfCited);
  proper.preReview.externalContracts[0].evidence = "node_modules/react-router/Switch.js:12";
  assert.doesNotMatch(
    validate(root, proper, ["--changed-files", `${root}/changed.txt`]),
    /externalContracts entry/,
    "a contract evidenced from the dependency passes",
  );

  fs.rmSync(root, { recursive: true, force: true });
}

process.stdout.write("class sweep fixtures passed\n");
