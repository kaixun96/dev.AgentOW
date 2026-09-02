#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index]?.startsWith("--") || argv[index + 1] === undefined) {
      throw new Error(`Invalid argument: ${argv[index] ?? ""}`);
    }
    args[argv[index].slice(2)] = argv[index + 1];
  }
  return args;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function relativeEvidence(runDir, uri) {
  if (/^https?:\/\//i.test(uri)) return uri;
  return path.relative(runDir, uri).split(path.sep).join("/");
}

function isPathInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function safeWriteFile(runDir, output, content) {
  const realRun = fs.realpathSync(runDir);
  const resolvedOutput = path.resolve(output);
  if (!isPathInside(path.resolve(runDir), resolvedOutput)) {
    throw new Error("Report output must remain inside --run-dir");
  }
  const parent = path.dirname(resolvedOutput);
  fs.mkdirSync(parent, { recursive: true });
  const realParent = fs.realpathSync(parent);
  if (!isPathInside(realRun, realParent)) {
    throw new Error("Report output parent resolves outside --run-dir");
  }
  if (fs.existsSync(resolvedOutput) && fs.lstatSync(resolvedOutput).isSymbolicLink()) {
    throw new Error("Report output must not be a symbolic link");
  }
  const temporary = path.join(realParent, `.${path.basename(resolvedOutput)}.${process.pid}.tmp`);
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, resolvedOutput);
}

function renderFinding(runDir, finding, bugs) {
  const bug = bugs.get(finding.id);
  const evidence = finding.evidenceUris
    .map((uri) => {
      const href = relativeEvidence(runDir, uri);
      return `<li><a href="${escapeHtml(href)}">${escapeHtml(path.basename(uri))}</a></li>`;
    })
    .join("");
  const steps = finding.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("");
  return `<article class="finding ${escapeHtml(finding.classification.toLowerCase())}">
<h3>${escapeHtml(finding.id)} — ${escapeHtml(finding.title)}</h3>
<dl>
<dt>Classification</dt><dd>${escapeHtml(finding.classification)}</dd>
${finding.severity ? `<dt>Severity</dt><dd>${escapeHtml(finding.severity)}</dd>` : ""}
<dt>WCAG</dt><dd>${escapeHtml(finding.wcagSc || "N/A")}</dd>
<dt>Category</dt><dd>${escapeHtml(finding.category)}</dd>
<dt>Selector</dt><dd><code>${escapeHtml(finding.selector || "page-level")}</code></dd>
<dt>Steps</dt><dd><ol>${steps}</ol></dd>
<dt>Expected</dt><dd>${escapeHtml(finding.expected)}</dd>
<dt>Actual</dt><dd>${escapeHtml(finding.actual)}</dd>
${bug ? `<dt>ADO bug</dt><dd><a href="${escapeHtml(bug.bugUrl)}">#${escapeHtml(bug.bugId)}</a></dd>` : ""}
<dt>Evidence</dt><dd><ul>${evidence}</ul></dd>
</dl>
</article>`;
}

function renderReport(runDir, aggregate, metadata, bugEntries) {
  const bugs = new Map(bugEntries.map((entry) => [entry.findingId, entry]));
  const categoryRows = aggregate.categories
    .map(
      (entry) =>
        `<tr><td>${escapeHtml(entry.category)}</td><td>${escapeHtml(entry.status)}</td><td>${escapeHtml(
          entry.producer,
        )}</td><td>${escapeHtml(entry.durationSeconds ?? "N/A")}</td><td>${escapeHtml(
          entry.claims.join(", ") || "none",
        )}</td></tr>`,
    )
    .join("");
  const findingCards = aggregate.findings
    .map((finding) => renderFinding(runDir, finding, bugs))
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Accessibility exploratory test report</title>
<style>
body{font-family:Segoe UI,Arial,sans-serif;max-width:1200px;margin:32px auto;padding:0 20px;color:#242424}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:8px;text-align:left;vertical-align:top}
.finding{border:1px solid #bbb;border-left-width:6px;border-radius:4px;padding:16px;margin:18px 0}
.violation{border-left-color:#c50f1f}.pass{border-left-color:#107c10}.needs-review{border-left-color:#ca5010}
dt{font-weight:600;margin-top:8px}dd{margin-left:0}code{white-space:pre-wrap}
</style>
</head>
<body>
<h1>Accessibility exploratory test report</h1>
<dl>
<dt>Target</dt><dd>${escapeHtml(metadata.target ?? "Unspecified")}</dd>
<dt>URL</dt><dd>${escapeHtml(metadata.url ?? "Unspecified")}</dd>
<dt>Environment</dt><dd>${escapeHtml(metadata.executionEnvironment ?? "Unknown")}</dd>
<dt>Generated</dt><dd>${escapeHtml(aggregate.generatedAt)}</dd>
</dl>
<h2>Summary</h2>
<p>Total findings: ${aggregate.counts.total}. Violations: ${
    aggregate.counts.byClassification.VIOLATION ?? 0
  }. Best practices: ${aggregate.counts.byClassification["BEST-PRACTICE"] ?? 0}. Needs review: ${
    aggregate.counts.byClassification["NEEDS-REVIEW"] ?? 0
  }. Passes: ${aggregate.counts.byClassification.PASS ?? 0}.</p>
<p>This exploratory report does not claim full WCAG conformance.</p>
<h2>Category execution</h2>
<table><thead><tr><th>Category</th><th>Status</th><th>Producer</th><th>Seconds</th><th>Claims</th></tr></thead>
<tbody>${categoryRows}</tbody></table>
<h2>Findings</h2>
${findingCards || "<p>No findings were recorded.</p>"}
</body>
</html>
`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  for (const required of ["run-dir", "findings", "out-json", "out-html"]) {
    if (!args[required]) throw new Error(`--${required} is required`);
  }
  const runDir = path.resolve(args["run-dir"]);
  const findingsPath = path.resolve(args.findings);
  const outputJson = path.resolve(args["out-json"]);
  const outputHtml = path.resolve(args["out-html"]);
  for (const candidate of [findingsPath, outputJson, outputHtml]) {
    if (!isPathInside(runDir, candidate)) {
      throw new Error("findings and report outputs must remain inside --run-dir");
    }
  }
  const realRunDir = fs.realpathSync(runDir);
  const realFindingsPath = fs.realpathSync(findingsPath);
  if (!isPathInside(realRunDir, realFindingsPath)) {
    throw new Error("Findings path resolves outside --run-dir");
  }
  const aggregate = JSON.parse(fs.readFileSync(realFindingsPath, "utf8"));
  const metadataPath = path.join(runDir, "run.json");
  if (
    fs.existsSync(metadataPath) &&
    !isPathInside(realRunDir, fs.realpathSync(metadataPath))
  ) {
    throw new Error("run.json resolves outside --run-dir");
  }
  const metadata = fs.existsSync(metadataPath) ? JSON.parse(fs.readFileSync(metadataPath, "utf8")) : {};
  const bugsPath = path.join(runDir, "ado-bugs.json");
  if (fs.existsSync(bugsPath) && !isPathInside(realRunDir, fs.realpathSync(bugsPath))) {
    throw new Error("ado-bugs.json resolves outside --run-dir");
  }
  const bugs = fs.existsSync(bugsPath) ? JSON.parse(fs.readFileSync(bugsPath, "utf8")) : [];
  if (!Array.isArray(bugs)) throw new Error("ado-bugs.json must contain an array");
  const report = { ...aggregate, metadata, adoBugs: bugs };
  safeWriteFile(runDir, outputJson, `${JSON.stringify(report, null, 2)}\n`);
  safeWriteFile(runDir, outputHtml, renderReport(runDir, aggregate, metadata, bugs));
  process.stdout.write(`${outputHtml}\n`);
}

try {
  main();
} catch (error) {
  console.error(`[a11y-explore-report] ${error.message}`);
  process.exitCode = 1;
}
