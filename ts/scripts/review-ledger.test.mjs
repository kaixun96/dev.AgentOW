import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";

const ledgerTool = fileURLToPath(new URL("../../tools/review-ledger.mjs", import.meta.url));
const validator = fileURLToPath(new URL("../../tools/validate-review-report.mjs", import.meta.url));

function run(args, cwd) {
  return spawnSync(process.execPath, args, { encoding: "utf8", cwd });
}

function repo() {
  const root = fs.mkdtempSync(`${os.tmpdir()}/agentow-ledger-`);
  const git = (args) => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${result.stderr}`);
    return result.stdout.trim();
  };
  git(["init", "-q"]);
  git(["config", "user.email", "t@example.com"]);
  git(["config", "user.name", "t"]);
  return { root, git };
}

// --- fingerprint identity ---------------------------------------------------
// The same defect drifts in line number, category, and wording between reviews.
// Only the source text it complains about stays put, so that is the identity.
{
  const { root } = repo();
  fs.writeFileSync(
    `${root}/a.scss`,
    ".btn {\n  align-self: flex-start;\n  margin-top: 37px;\n}\n",
  );
  const shifted = `// header\n// header\n.btn {\n  align-self: flex-start;\n  margin-top: 37px;\n}\n`;

  const reportA = { findings: [{ id: "MINOR-1", severity: "Minor", path: "a.scss", line: 3, description: "Nit: magic constant" }] };
  fs.writeFileSync(`${root}/a.json`, JSON.stringify(reportA));
  const first = JSON.parse(run([ledgerTool, "fingerprint", "--report", `${root}/a.json`, "--repo", root], root).stdout);

  fs.writeFileSync(`${root}/a.scss`, shifted);
  const reportB = { findings: [{ id: "MINOR-4", severity: "Minor", path: "a.scss", line: 5, description: "Nit: hardcoded spacing, different wording entirely" }] };
  fs.writeFileSync(`${root}/b.json`, JSON.stringify(reportB));
  const second = JSON.parse(run([ledgerTool, "fingerprint", "--report", `${root}/b.json`, "--repo", root], root).stdout);

  assert.equal(
    first.findings[0].fingerprint,
    second.findings[0].fingerprint,
    "the same source line keeps its identity when the line number and wording change",
  );

  // Editing the code retires the finding, so it must not match any more.
  fs.writeFileSync(`${root}/a.scss`, ".btn {\n  align-self: flex-start;\n  margin-top: $spacing-l;\n}\n");
  const reportC = { findings: [{ id: "MINOR-1", severity: "Minor", path: "a.scss", line: 3, description: "Nit: magic constant" }] };
  fs.writeFileSync(`${root}/c.json`, JSON.stringify(reportC));
  const third = JSON.parse(run([ledgerTool, "fingerprint", "--report", `${root}/c.json`, "--repo", root], root).stdout);
  assert.notEqual(first.findings[0].fingerprint, third.findings[0].fingerprint, "fixing the code changes the fingerprint");

  fs.rmSync(root, { recursive: true, force: true });
}

// --- a trivial line is not a usable anchor ----------------------------------
// `}` appears everywhere; the anchor must reach up until it means something.
{
  const { root } = repo();
  fs.writeFileSync(`${root}/a.ts`, "function first() {\n  doSomethingSpecific();\n}\n\nfunction second() {\n  doSomethingElse();\n}\n");
  const report = {
    findings: [
      { id: "A", severity: "Minor", path: "a.ts", line: 3, description: "Nit: x" },
      { id: "B", severity: "Minor", path: "a.ts", line: 7, description: "Nit: y" },
    ],
  };
  fs.writeFileSync(`${root}/r.json`, JSON.stringify(report));
  const out = JSON.parse(run([ledgerTool, "fingerprint", "--report", `${root}/r.json`, "--repo", root], root).stdout);
  assert.notEqual(
    out.findings[0].fingerprint,
    out.findings[1].fingerprint,
    "two closing braces in one file are not the same finding",
  );
  fs.rmSync(root, { recursive: true, force: true });
}

// --- accept requires a reason, not a restatement ----------------------------
{
  const { root } = repo();
  fs.writeFileSync(`${root}/a.ts`, "const timeoutMilliseconds = 250;\n");
  const report = { reviewedHead: "0".repeat(40), findings: [{ id: "MINOR-1", severity: "Minor", path: "a.ts", line: 1, description: "Nit: unexplained constant" }] };
  fs.writeFileSync(`${root}/r.json`, JSON.stringify(report));

  const tooShort = run([ledgerTool, "accept", "--report", `${root}/r.json`, "--ledger", `${root}/l.json`, "--accept", "MINOR-1=too short", "--repo", root], root);
  assert.equal(tooShort.status, 1, "a one-word reason is rejected");

  const restated = run([ledgerTool, "accept", "--report", `${root}/r.json`, "--ledger", `${root}/l.json`, "--accept", "MINOR-1=Nit: unexplained constant", "--repo", root], root);
  assert.equal(restated.status, 1, "restating the finding is not a reason");

  const unknown = run([ledgerTool, "accept", "--report", `${root}/r.json`, "--ledger", `${root}/l.json`, "--accept", "MINOR-9=A perfectly adequate justification for accepting this.", "--repo", root], root);
  assert.equal(unknown.status, 1, "an unknown finding id is rejected");

  const ok = run([ledgerTool, "accept", "--report", `${root}/r.json`, "--ledger", `${root}/l.json`, "--accept", "MINOR-1=The constant is documented in the adjacent design note and changing it is out of scope here.", "--repo", root], root);
  assert.equal(ok.status, 0, `a real reason is accepted: ${ok.stdout}${ok.stderr}`);
  const ledger = JSON.parse(fs.readFileSync(`${root}/l.json`, "utf8"));
  assert.equal(ledger.entries.length, 1);
  assert.equal(ledger.entries[0].disposition, "accepted");
  fs.rmSync(root, { recursive: true, force: true });
}

// --- the PR description carries the ledger to other machines ----------------
{
  const { root } = repo();
  const ledger = {
    schemaVersion: 1,
    entries: [
      { fingerprint: "abc123", path: "a.ts", anchor: "const x = 1;", description: "Nit: unexplained constant", disposition: "accepted", reason: "Documented in the adjacent design note; changing it is out of scope." },
    ],
  };
  fs.writeFileSync(`${root}/l.json`, JSON.stringify(ledger));
  const rendered = run([ledgerTool, "render", "--ledger", `${root}/l.json`], root).stdout;
  assert.match(rendered, /Accepted review nits/, "humans see the accepted nits");
  assert.match(rendered, /out of scope/, "humans see the reason");

  fs.writeFileSync(`${root}/desc.md`, `Some PR description.\n\n${rendered}`);
  const parsed = JSON.parse(run([ledgerTool, "parse", "--description", `${root}/desc.md`], root).stdout);
  assert.equal(parsed.entries.length, 1, "the block round-trips out of a PR description");
  assert.equal(parsed.entries[0].fingerprint, "abc123");
  fs.rmSync(root, { recursive: true, force: true });
}

// --- end to end: a re-review cannot raise an accepted finding again ---------
// This is the behaviour the whole ledger exists for. A reviewer that re-reports
// an accepted nit is rejected by the validator, which recomputes the match
// itself rather than trusting the report.
{
  const { root, git } = repo();
  fs.writeFileSync(`${root}/a.scss`, ".btn {\n  align-self: flex-start;\n  margin-top: 37px;\n}\n");
  git(["add", "-A"]);
  git(["commit", "-qm", "base"]);

  const finding = {
    id: "MINOR-1",
    severity: "Minor",
    category: "designMaintainability",
    path: "a.scss",
    line: 3,
    description: "Nit: the 37px margin is a measured magic constant with no in-file explanation.",
    impact: "A later reader cannot tell whether the value is load-bearing.",
    suggestedFix: "Name the constant or record how it was measured.",
    evidence: ["a.scss:3"],
  };

  const base = {
    schemaVersion: 1,
    reviewedHead: "0".repeat(40),
    mergeBase: "1".repeat(40),
    diffDigest: "2".repeat(64),
    verdict: "COMMENT",
    summary: "x",
    preReview: {
      reviewLedger: { status: "applied", ledgerPath: `${root}/l.json`, entryCount: 1, carriedCount: 0 },
    },
    findings: [finding],
    previouslyAccepted: [],
    counts: { critical: 0, important: 0, minor: 1 },
  };
  fs.writeFileSync(`${root}/first.json`, JSON.stringify(base));

  const accepted = run(
    [ledgerTool, "accept", "--report", `${root}/first.json`, "--ledger", `${root}/l.json`, "--accept", "MINOR-1=Cosmetic only; the value was measured against the live surface and is recorded in the PR body.", "--repo", root],
    root,
  );
  assert.equal(accepted.status, 0, `ledger accept failed: ${accepted.stdout}${accepted.stderr}`);

  // The re-review reports it again, with drifted wording and a fresh id.
  const reReview = JSON.parse(JSON.stringify(base));
  reReview.findings[0].id = "MINOR-3";
  reReview.findings[0].category = "maintainability";
  reReview.findings[0].description = "Nit: hardcoded 37px spacing without a token or a note explaining it.";
  fs.writeFileSync(`${root}/second.json`, JSON.stringify(reReview));

  const withoutLedger = run([validator, `${root}/second.json`], root);
  assert.equal(withoutLedger.status, 1, "the report is incomplete on its own terms");
  assert.doesNotMatch(
    withoutLedger.stdout,
    /already accepted in the ledger/,
    "without the ledger the validator cannot know the finding was accepted",
  );

  const withLedger = run([validator, `${root}/second.json`, "--ledger", `${root}/l.json`, "--repo", root], root);
  assert.equal(withLedger.status, 1, "re-reporting an accepted finding fails validation");
  assert.match(
    withLedger.stdout,
    /MINOR-3 at a\.scss:3 was already accepted in the ledger/,
    "the validator names the offending finding",
  );

  // Carrying it forward instead is what the contract asks for, and passes.
  const honest = JSON.parse(JSON.stringify(base));
  const fingerprint = JSON.parse(fs.readFileSync(`${root}/l.json`, "utf8")).entries[0].fingerprint;
  honest.findings = [];
  honest.verdict = "APPROVE";
  honest.counts = { critical: 0, important: 0, minor: 0 };
  honest.previouslyAccepted = [{ fingerprint, path: "a.scss", reason: "Accepted at ship time." }];
  honest.preReview.reviewLedger.carriedCount = 1;
  fs.writeFileSync(`${root}/third.json`, JSON.stringify(honest));

  const carried = run([validator, `${root}/third.json`, "--ledger", `${root}/l.json`, "--repo", root], root);
  const carriedErrors = JSON.parse(carried.stdout).errors;
  assert.ok(
    !carriedErrors.some((error) => /ledger/i.test(error)),
    `carrying the finding forward raises no ledger error: ${JSON.stringify(carriedErrors)}`,
  );

  // A fabricated carry is rejected too.
  const fabricated = JSON.parse(JSON.stringify(honest));
  fabricated.previouslyAccepted = [{ fingerprint: "deadbeef", path: "a.scss", reason: "Invented." }];
  fs.writeFileSync(`${root}/fourth.json`, JSON.stringify(fabricated));
  const fake = run([validator, `${root}/fourth.json`, "--ledger", `${root}/l.json`, "--repo", root], root);
  assert.match(fake.stdout, /which is not accepted in the ledger/, "a fabricated carry is caught");

  fs.rmSync(root, { recursive: true, force: true });
}

// --- output paths without a directory component -----------------------------
// A bare filename has no slash, so a naive dirname leaves the filename itself
// and mkdir turns the intended file into a directory.
{
  const { root } = repo();
  fs.writeFileSync(`${root}/a.scss`, ".btn {\n  align-self: flex-start;\n  margin-top: 37px;\n}\n");
  const report = {
    findings: [
      { id: "MINOR-1", severity: "Minor", path: "a.scss", line: 3, description: "Nit: magic constant" },
    ],
  };
  fs.writeFileSync(`${root}/r.json`, JSON.stringify(report));

  const accepted = run(
    [
      ledgerTool, "accept",
      "--report", "r.json",
      "--ledger", "bare.json",
      "--repo", root,
      "--accept", "MINOR-1=Derived from a spec constant that is tracked separately and is out of scope here.",
    ],
    root,
  );
  assert.equal(accepted.status, 0, `accept to a bare filename succeeds: ${accepted.stdout}${accepted.stderr}`);
  assert.ok(fs.statSync(`${root}/bare.json`).isFile(), "the bare ledger path is a file, not a directory");

  fs.writeFileSync(`${root}/pr.md`, "## Summary\n\n" + run([ledgerTool, "render", "--ledger", "bare.json"], root).stdout);
  const parsed = run([ledgerTool, "parse", "--description", "pr.md", "--out", "back.json"], root);
  assert.equal(parsed.status, 0, `parse to a bare filename succeeds: ${parsed.stderr}`);
  assert.ok(fs.statSync(`${root}/back.json`).isFile(), "the bare parse output is a file, not a directory");
  assert.deepEqual(
    JSON.parse(fs.readFileSync(`${root}/back.json`, "utf8")).entries.map((e) => e.fingerprint),
    JSON.parse(fs.readFileSync(`${root}/bare.json`, "utf8")).entries.map((e) => e.fingerprint),
    "a PR description round-trips the ledger without loss",
  );

  fs.rmSync(root, { recursive: true, force: true });
}

process.stdout.write("review ledger fixtures passed\n");
