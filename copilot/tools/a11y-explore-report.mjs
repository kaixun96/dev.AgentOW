#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { aggregateResults } from "./a11y-explore-results.mjs";

const CATEGORY_LABELS = {
  "keyboard-focus": "Keyboard & Focus",
  "screen-reader": "Screen Reader",
  "structure-semantics": "Structure & Semantics",
  "orientation-input-purpose": "Orientation & Input Purpose",
  "visual-color": "Visual & Color",
  "timing-motion": "Timing & Motion",
  "dynamic-content": "Dynamic Content",
  "touch-pointer": "Touch & Pointer",
  "authentication-forms": "Authentication & Forms",
};

const WCAG_NAMES = {
  "1.1.1": "Non-text Content",
  "1.2.1": "Audio-only and Video-only (Prerecorded)",
  "1.2.2": "Captions (Prerecorded)",
  "1.2.3": "Audio Description or Media Alternative",
  "1.2.4": "Captions (Live)",
  "1.2.5": "Audio Description (Prerecorded)",
  "1.3.1": "Info and Relationships",
  "1.3.2": "Meaningful Sequence",
  "1.3.3": "Sensory Characteristics",
  "1.3.4": "Orientation",
  "1.3.5": "Identify Input Purpose",
  "1.4.1": "Use of Color",
  "1.4.2": "Audio Control",
  "1.4.3": "Contrast (Minimum)",
  "1.4.4": "Resize Text",
  "1.4.5": "Images of Text",
  "1.4.10": "Reflow",
  "1.4.11": "Non-text Contrast",
  "1.4.12": "Text Spacing",
  "1.4.13": "Content on Hover or Focus",
  "2.1.1": "Keyboard",
  "2.1.2": "No Keyboard Trap",
  "2.1.4": "Character Key Shortcuts",
  "2.2.1": "Timing Adjustable",
  "2.2.2": "Pause, Stop, Hide",
  "2.3.1": "Three Flashes or Below Threshold",
  "2.4.1": "Bypass Blocks",
  "2.4.2": "Page Titled",
  "2.4.3": "Focus Order",
  "2.4.4": "Link Purpose (In Context)",
  "2.4.5": "Multiple Ways",
  "2.4.6": "Headings and Labels",
  "2.4.7": "Focus Visible",
  "2.4.11": "Focus Not Obscured (Minimum)",
  "2.5.1": "Pointer Gestures",
  "2.5.2": "Pointer Cancellation",
  "2.5.3": "Label in Name",
  "2.5.4": "Motion Actuation",
  "2.5.7": "Dragging Movements",
  "2.5.8": "Target Size (Minimum)",
  "3.1.1": "Language of Page",
  "3.1.2": "Language of Parts",
  "3.2.1": "On Focus",
  "3.2.2": "On Input",
  "3.2.3": "Consistent Navigation",
  "3.2.4": "Consistent Identification",
  "3.2.6": "Consistent Help",
  "3.3.1": "Error Identification",
  "3.3.2": "Labels or Instructions",
  "3.3.3": "Error Suggestion",
  "3.3.4": "Error Prevention",
  "3.3.7": "Redundant Entry",
  "3.3.8": "Accessible Authentication (Minimum)",
  "4.1.2": "Name, Role, Value",
  "4.1.3": "Status Messages",
};

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

function redactEvidenceText(value) {
  return String(value ?? "")
    .replace(
      /Account manager for\s+[^'",\]\r\n<]+/gi,
      "Account manager for [redacted]",
    )
    .replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      "[redacted-email]",
    );
}

function safeHttpUrl(value) {
  try {
    const parsed = new URL(String(value));
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
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
  let existingAncestor = parent;
  while (!fs.existsSync(existingAncestor)) {
    existingAncestor = path.dirname(existingAncestor);
  }
  if (!isPathInside(realRun, fs.realpathSync(existingAncestor))) {
    throw new Error("Report output ancestor resolves outside --run-dir");
  }
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

function relativeEvidence(runDir, uri) {
  return path.relative(runDir, uri).split(path.sep).join("/");
}

function faviconData(seed) {
  const digest = crypto.createHash("sha256").update(seed).digest();
  const first = digest[0] % 360;
  const second = (first + 120 + (digest[1] % 80)) % 360;
  const third = (second + 120 + (digest[2] % 80)) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><radialGradient id="g"><stop stop-color="hsl(${first} 100% 70%)"/><stop offset=".48" stop-color="hsl(${second} 100% 52%)"/><stop offset="1" stop-color="hsl(${third} 100% 42%)"/></radialGradient></defs><rect width="64" height="64" rx="15" fill="url(#g)"/><path d="M36 3 12 37h17l-3 24 26-37H35z" fill="#fff" stroke="#111" stroke-width="4" stroke-linejoin="round"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function classificationCounts(findings) {
  const counts = { VIOLATION: 0, "BEST-PRACTICE": 0, PASS: 0, "NEEDS-REVIEW": 0 };
  for (const finding of findings) counts[finding.classification] += 1;
  return counts;
}

function formatDuration(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(value / 60);
  const remainder = value % 60;
  return minutes ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

function readEvidenceJson(runDir, aggregate, type, category) {
  const entry = aggregate.evidence.find(
    (candidate) => candidate.type === type && candidate.category === category,
  );
  if (!entry) return null;
  const realRun = fs.realpathSync(runDir);
  const realPath = fs.realpathSync(entry.uri);
  if (!isPathInside(realRun, realPath)) throw new Error(`${type} evidence escapes --run-dir`);
  return JSON.parse(fs.readFileSync(realPath, "utf8"));
}

function renderScreenshots(runDir, finding, aggregate) {
  const evidence = new Map(aggregate.evidence.map((entry) => [entry.uri, entry]));
  return finding.evidenceUris
    .filter((uri) => evidence.get(uri)?.type === "screenshot")
    .map((uri, index) => {
      const source = relativeEvidence(runDir, uri);
      return `<a href="${escapeHtml(source)}"><img src="${escapeHtml(source)}" alt="${escapeHtml(
        `${finding.title} evidence ${index + 1}`,
      )}"></a>`;
    })
    .join("");
}

function renderEvidenceLinks(runDir, finding) {
  return finding.evidenceUris
    .map((uri) => {
      const source = relativeEvidence(runDir, uri);
      return `<li><a href="${escapeHtml(source)}">${escapeHtml(path.basename(uri))}</a></li>`;
    })
    .join("");
}

function renderFinding(runDir, finding, aggregate, bugs) {
  const bug = bugs.get(finding.id);
  const classification = finding.classification.toLowerCase();
  const severity = finding.severity?.toLowerCase();
  const cardClass =
    finding.classification === "VIOLATION"
      ? `finding-violation-${severity}`
      : `finding-${classification}`;
  const typeLabel =
    finding.classification === "BEST-PRACTICE" ? "BEST PRACTICE" : finding.classification.replace("-", " ");
  const severityBadge = finding.severity
    ? `<span class="badge badge-${severity}">${escapeHtml(finding.severity)}</span>`
    : "";
  const steps = finding.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("");
  const screenshots = renderScreenshots(runDir, finding, aggregate);
  const screenshotRow = screenshots ? `<dt>Screenshot</dt><dd>${screenshots}</dd>` : "";
  return `<article class="finding ${cardClass}">
<h3><span class="badge badge-${classification}">${escapeHtml(typeLabel)}</span> ${severityBadge} ${escapeHtml(
    finding.id,
  )}: ${escapeHtml(finding.title)}</h3>
<dl>
<dt>MAS rule</dt><dd>${escapeHtml(finding.wcagSc ? `MAS ${finding.wcagSc}` : "N/A")} (public WCAG mapping: ${escapeHtml(
    finding.wcagSc || "N/A",
  )} ${escapeHtml(
    WCAG_NAMES[finding.wcagSc] || "",
  )})</dd>
<dt>Category</dt><dd>${escapeHtml(CATEGORY_LABELS[finding.category] || finding.category)}</dd>
<dt>Element</dt><dd><code>${escapeHtml(finding.selector || "page-level")}</code></dd>
<dt>Steps to reproduce</dt><dd><ol>${steps}</ol></dd>
<dt>Expected</dt><dd>${escapeHtml(finding.expected)}</dd>
<dt>Actual</dt><dd>${escapeHtml(finding.actual)}</dd>
<dt>User impact</dt><dd>${escapeHtml(finding.userImpact)}</dd>
<dt>Reproducibility</dt><dd>${escapeHtml(finding.reproducibility)}</dd>
<dt>Tested scope</dt><dd>${escapeHtml(finding.testedScope)}</dd>
<dt>Evidence limitations</dt><dd>${escapeHtml(
    finding.evidenceLimitations.length > 0 ? finding.evidenceLimitations.join("; ") : "None recorded",
  )}</dd>
${bug ? `<dt>ADO Bug</dt><dd><a href="${escapeHtml(bug.bugUrl)}">#${escapeHtml(bug.bugId)}</a></dd>` : ""}
${screenshotRow}
<dt>Evidence</dt><dd><ul>${renderEvidenceLinks(runDir, finding)}</ul></dd>
</dl>
</article>`;
}

function renderCategorySummary(aggregate, findings) {
  const rows = aggregate.categories.map((category) => {
    const categoryFindings = findings.filter((finding) => finding.category === category.category);
    const counts = classificationCounts(categoryFindings);
    return `<tr><td>${escapeHtml(CATEGORY_LABELS[category.category] || category.category)}</td>
<td>${counts.VIOLATION}</td><td>${counts["BEST-PRACTICE"]}</td><td>${counts.PASS}</td>
<td>${counts["NEEDS-REVIEW"]}</td></tr>`;
  });
  const totals = classificationCounts(findings);
  rows.push(`<tr class="total"><td>Total</td><td>${totals.VIOLATION}</td><td>${
    totals["BEST-PRACTICE"]
  }</td><td>${totals.PASS}</td><td>${totals["NEEDS-REVIEW"]}</td></tr>`);
  return rows.join("");
}

export function summarizeScResults(results) {
  const priority = ["FAIL", "NEEDS_REVIEW", "NOT_TESTED", "PASS", "NOT_APPLICABLE"];
  let scResult = [...results].sort(
    (left, right) => priority.indexOf(left.status) - priority.indexOf(right.status),
  )[0];
  if (
    !results.some((entry) => entry.status === "FAIL") &&
    results.some((entry) => entry.status === "NOT_TESTED") &&
    results.some((entry) => !["NOT_TESTED", "NOT_APPLICABLE"].includes(entry.status))
  ) {
    scResult = {
      status: "NEEDS_REVIEW",
      details: `Partially tested across categories: ${results
        .map((entry) => `${entry.category}: ${entry.status} (${entry.details})`)
        .join("; ")}`,
    };
  }
  return scResult;
}

function renderWcagTable(plan, aggregate) {
  const planned = new Set(plan.scCoverage);
  return Object.keys(WCAG_NAMES)
    .filter((criterion) => planned.has(criterion))
    .map((criterion) => {
      const results = planned.has(criterion)
        ? aggregate.scResults.filter((entry) => entry.wcagSc === criterion)
        : [];
      const scResult = summarizeScResults(results);
      const status = scResult?.status?.replace("_", " ") || "NOT TESTED";
      const rowClass =
        scResult?.status === "FAIL"
          ? "sc-fail"
          : scResult?.status === "NEEDS_REVIEW"
            ? "sc-review"
            : scResult?.status === "PASS"
              ? "sc-pass"
              : "sc-na";
      const details = scResult?.details || (planned.has(criterion) ? "No SC result." : "Not planned.");
      return `<tr class="${rowClass}"><td>${escapeHtml(criterion)} ${escapeHtml(
        WCAG_NAMES[criterion] || "",
      )}</td><td>${status}</td><td>${escapeHtml(details)}</td></tr>`;
    })
    .join("");
}

function renderTabOrder(runDir, aggregate) {
  const sequence = readEvidenceJson(runDir, aggregate, "focus-sequence", "keyboard-focus");
  if (!Array.isArray(sequence)) return "<p>Tab order was not captured.</p>";
  const comparison = readEvidenceJson(
    runDir,
    aggregate,
    "focus-visual-comparison",
    "keyboard-focus",
  );
  const comparisonsByIndex = new Map(
    Array.isArray(comparison?.items)
      ? comparison.items.map((entry) => [entry.index, entry])
      : [],
  );
  const rows = sequence
    .map((entry, index) => {
      const value =
        typeof entry === "string"
          ? { tag: "", text: entry, id: "", outlineStyle: "", outlineWidth: "", boxShadow: "" }
          : entry;
      const obscured = value.obscured === true || value.focusObscured === true;
      const visualComparison = comparisonsByIndex.get(value.index ?? index + 1);
      const indicator = comparison?.items
        ? visualComparison?.indicatorObserved
          ? "Observed (pixels/styles)"
          : "Missing"
        : obscured
          ? "Obscured"
          : value.outlineStyle && value.outlineStyle !== "none"
            ? `${value.outlineStyle} ${value.outlineWidth || ""}`.trim()
            : value.boxShadow && value.boxShadow !== "none"
              ? "box-shadow"
              : "Needs review";
      const rowClass = ["Missing", "Needs review", "Obscured"].includes(indicator)
        ? ' class="sc-fail"'
        : "";
      return `<tr${rowClass}><td>${index + 1}</td><td>${escapeHtml(value.tag)}</td><td>${escapeHtml(
        value.tag?.toLowerCase() || "",
      )}</td><td>${escapeHtml(redactEvidenceText(value.text || value.href || ""))}</td><td>${escapeHtml(
        indicator,
      )}</td><td>${escapeHtml(value.id || "")}</td></tr>`;
    })
    .join("");
  return `<table><thead><tr><th>#</th><th>Element</th><th>Role</th><th>Name</th><th>Focus Indicator</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderKeyboardNavigation(runDir, aggregate) {
  const navigation = readEvidenceJson(
    runDir,
    aggregate,
    "keyboard-navigation",
    "keyboard-focus",
  );
  if (!navigation) return "<p>Keyboard navigation evidence was not captured.</p>";
  const summary = [
    ["Tabbable inventory", navigation.inventory?.length ?? 0],
    ["Unique forward targets", navigation.forward?.length ?? 0],
    ["Reverse order matched", navigation.reverseMatches ? "Yes" : "No"],
    ["DOM order monotonic", navigation.domOrderMonotonic ? "Yes" : "No"],
    ["Tab-skipped composite items", navigation.tabSkippedPaths?.length ?? 0],
    ["Composite items reached by arrows", navigation.compositeResolvedPaths?.length ?? 0],
    ["Unresolved targets", navigation.missingPaths?.length ?? 0],
    ["Failures", navigation.failures?.length ?? 0],
  ]
    .map(
      ([label, value]) =>
        `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`,
    )
    .join("");
  const interactions = Array.isArray(navigation.interactions)
    ? navigation.interactions
        .map((entry) => {
          const outcome = entry.failures?.length
            ? entry.failures.join("; ")
            : entry.focusRestored === false
              ? "Focus not restored"
              : entry.urlStable === false
                ? "Unexpected navigation"
                : "No recorded failure";
          return `<tr><td>${escapeHtml(redactEvidenceText(entry.name || "Interaction"))}</td><td>${escapeHtml(
            entry.applicable === false ? "Not applicable" : "Executed",
          )}</td><td>${escapeHtml(redactEvidenceText(outcome))}</td></tr>`;
        })
        .join("")
    : "";
  return `<table><thead><tr><th>Keyboard check</th><th>Result</th></tr></thead><tbody>${summary}</tbody></table>${
    interactions
      ? `<table><thead><tr><th>Interaction</th><th>Status</th><th>Outcome</th></tr></thead><tbody>${interactions}</tbody></table>`
      : ""
  }`;
}

function renderHeadingHierarchy(runDir, aggregate) {
  const structure = readEvidenceJson(runDir, aggregate, "accessibility-tree", "structure-semantics");
  const headings = structure?.inventory?.headings;
  if (!Array.isArray(headings)) return "<p>Heading hierarchy was not captured.</p>";
  let previous = 0;
  return `<div class="heading-tree">${headings
    .map((heading) => {
      const issue = previous && heading.level > previous + 1;
      previous = heading.level;
      const value = `${"  ".repeat(Math.max(0, heading.level - 1))}h${heading.level}: ${redactEvidenceText(
        heading.text,
      )}`;
      return issue ? `<span class="issue">${escapeHtml(value)}</span>` : escapeHtml(value);
    })
    .join("\n")}</div>`;
}

function renderLandmarks(runDir, aggregate) {
  const structure = readEvidenceJson(runDir, aggregate, "accessibility-tree", "structure-semantics");
  const landmarks = structure?.inventory?.landmarks;
  if (!Array.isArray(landmarks)) return "<p>Landmarks were not captured.</p>";
  const rows = landmarks
    .map(
      (entry) =>
        `<tr class="sc-pass"><td>${escapeHtml(entry.role || entry.tag?.toLowerCase())}</td><td>${escapeHtml(
          redactEvidenceText(entry.name || "(none)"),
        )}</td><td>Yes</td></tr>`,
    )
    .join("");
  return `<table><thead><tr><th>Landmark</th><th>Label</th><th>Present</th></tr></thead><tbody>${
    rows || '<tr class="sc-review"><td colspan="3">No landmark elements were captured.</td></tr>'
  }</tbody></table>`;
}

function renderRuntime(aggregate) {
  const rows = aggregate.categories.map(
    (entry) =>
      `<tr><td>${escapeHtml(CATEGORY_LABELS[entry.category] || entry.category)}</td><td>${formatDuration(
        entry.durationSeconds,
      )}</td></tr>`,
  );
  const total = aggregate.categories.reduce(
    (sum, entry) => sum + (Number(entry.durationSeconds) || 0),
    0,
  );
  rows.push(`<tr class="total"><td>Total</td><td>${formatDuration(total)}</td></tr>`);
  return rows.join("");
}

function renderNvdaExcerpt(runDir, aggregate) {
  const entry = aggregate.evidence.find(
    (candidate) =>
      candidate.category === "screen-reader" &&
      ["nvda-transcript", "nvda-debug-log"].includes(candidate.type),
  );
  if (!entry) return "NVDA was not used or no transcript was captured.";
  const realRun = fs.realpathSync(runDir);
  const realPath = fs.realpathSync(entry.uri);
  if (!isPathInside(realRun, realPath)) throw new Error("NVDA evidence escapes --run-dir");
  const lines = fs
    .readFileSync(realPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => /Speaking \[|Input:|Lock Screen|pane/.test(line))
    .slice(-60);
  return lines.length
    ? redactEvidenceText(lines.join("\n"))
    : "NVDA evidence exists, but no speech excerpt was available.";
}

function screenReaderLabel(aggregate) {
  const category = aggregate.categories.find((entry) => entry.category === "screen-reader");
  if (!category) return "Not planned";
  const evidenceTypes = new Set(
    aggregate.evidence
      .filter((entry) => entry.category === "screen-reader")
      .map((entry) => entry.type),
  );
  const technology = category.claims.includes("narrator-tested") || evidenceTypes.has("narrator-etl")
    ? "Narrator"
    : category.claims.includes("nvda-tested") ||
        evidenceTypes.has("nvda-transcript") ||
        evidenceTypes.has("nvda-debug-log")
      ? "NVDA"
      : "Screen reader";
  return `${technology} (${category.status})`;
}

function renderCoverageNotes(aggregate, plan, omittedFindings, scoped = false) {
  const lines = aggregate.categories.map((entry) => {
    const blockers = entry.blockers?.length ? ` — ${entry.blockers.join("; ")}` : "";
    return `<li><strong>${escapeHtml(CATEGORY_LABELS[entry.category] || entry.category)}:</strong> ${escapeHtml(
      entry.status,
    )}${escapeHtml(blockers)}</li>`;
  });
  const planned = new Set(plan.categories.map((entry) => entry.category));
  if (!scoped) {
    for (const category of Object.keys(CATEGORY_LABELS)) {
      if (!planned.has(category)) {
        lines.push(`<li><strong>${escapeHtml(CATEGORY_LABELS[category])}:</strong> not planned</li>`);
      }
    }
  }
  for (const finding of omittedFindings) {
    lines.push(
      `<li><strong>Omitted incomplete finding:</strong> ${escapeHtml(finding.id)} — no screenshot artifact.</li>`,
    );
  }
  return `<ul>${lines.join("")}</ul><p>This exploratory run does not claim full MAS conformance.</p>`;
}

function renderReport(runDir, aggregate, metadata, plan, bugEntries) {
  const bugs = new Map(bugEntries.map((entry) => [entry.findingId, entry]));
  const categoryStatus = new Map(
    aggregate.categories.map((entry) => [entry.category, entry.status]),
  );
  const screenshotUris = new Set(
    aggregate.evidence.filter((entry) => entry.type === "screenshot").map((entry) => entry.uri),
  );
  const reportableFindings = aggregate.findings.filter((finding) => {
    const hasScreenshot = finding.evidenceUris.some((uri) => screenshotUris.has(uri));
    const infrastructureException =
      finding.classification === "NEEDS-REVIEW" &&
      categoryStatus.get(finding.category) !== "completed";
    return hasScreenshot || infrastructureException;
  });
  const omittedFindings = aggregate.findings.filter(
    (finding) => !reportableFindings.includes(finding),
  );
  const counts = classificationCounts(reportableFindings);
  const cards = reportableFindings
    .map((finding) => renderFinding(runDir, finding, aggregate, bugs))
    .join("\n");
  const favicon = faviconData(`${metadata.target || ""}|${aggregate.generatedAt}`);
  const reportUrl = safeHttpUrl(metadata.url);
  const renderedUrl = reportUrl
    ? `<a href="${escapeHtml(reportUrl)}">${escapeHtml(metadata.url)}</a>`
    : escapeHtml(metadata.url || "");
  const includedCategories = new Set(aggregate.categories.map((entry) => entry.category));
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" href="${escapeHtml(favicon)}">
<title>MAS Web Report: ${escapeHtml(metadata.target || "Accessibility exploration")}</title>
<style>
:root{--critical:#d32f2f;--high:#e53935;--medium:#f57c00;--low:#ffa726;--best:#7b1fa2;--pass:#2e7d32;--review:#1565c0}
*{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#212121;max-width:1200px;margin:0 auto;padding:24px;background:#fafafa}
h1{font-size:1.8rem;margin-bottom:8px}h2{font-size:1.4rem;margin:32px 0 16px;padding-bottom:8px;border-bottom:2px solid #e0e0e0}h3{font-size:1.1rem}
table{width:100%;border-collapse:collapse;margin:16px 0}th,td{padding:10px 14px;text-align:left;border:1px solid #e0e0e0}th{background:#f5f5f5}.total{font-weight:700}
a{color:#1565c0}code{background:#f5f5f5;padding:2px 6px;border-radius:3px}pre{background:#263238;color:#eeffff;padding:16px;border-radius:6px;overflow:auto}
img{max-width:100%;border:1px solid #e0e0e0;border-radius:4px;margin:8px 0;cursor:zoom-in}.meta{color:#616161;margin-bottom:24px}
.finding:not(.finding-pass) img{border:4px solid #d32f2f;box-shadow:0 0 0 3px #fff,0 0 0 6px #d32f2f}
.summary-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;margin:20px 0}.summary-card{padding:20px;border-radius:8px;text-align:center}.count{font-size:2.2rem;font-weight:700}.label{font-size:.85rem;text-transform:uppercase}
.card-violations{background:#ffebee;color:var(--critical);border-left:4px solid var(--critical)}.card-best-practice{background:#f3e5f5;color:var(--best);border-left:4px solid var(--best)}.card-pass{background:#e8f5e9;color:var(--pass);border-left:4px solid var(--pass)}.card-needs-review{background:#e3f2fd;color:var(--review);border-left:4px solid var(--review)}
.sc-fail{background:#ffebee}.sc-pass{background:#e8f5e9}.sc-review{background:#e3f2fd}.sc-na{background:#f5f5f5;color:#757575}.sc-fail td:nth-child(2),.sc-pass td:nth-child(2),.sc-review td:nth-child(2){font-weight:700}
.finding{border-radius:8px;padding:20px;margin:20px 0;border-left:5px solid}.finding-violation-critical,.finding-violation-high{background:#ffebee;border-color:var(--critical)}.finding-violation-medium{background:#fff3e0;border-color:var(--medium)}.finding-violation-low{background:#fff8e1;border-color:var(--low)}.finding-best-practice{background:#f3e5f5;border-color:var(--best)}.finding-pass{background:#e8f5e9;border-color:var(--pass)}.finding-needs-review{background:#e3f2fd;border-color:var(--review)}
.finding dt{font-weight:600;margin-top:8px}.finding dd{margin-left:0}.badge{display:inline-block;padding:2px 10px;border-radius:12px;font-size:.8rem;font-weight:600;color:#fff}.badge-violation,.badge-critical,.badge-high{background:var(--critical)}.badge-medium{background:var(--medium)}.badge-low{background:var(--low)}.badge-best-practice{background:var(--best)}.badge-pass{background:var(--pass)}.badge-needs-review{background:var(--review)}
.structure-section{background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:20px;margin:16px 0}.heading-tree{font-family:monospace;white-space:pre-wrap;line-height:1.8}.heading-tree .issue{display:block;background:#ffebee;padding:2px 6px;border-radius:3px}
details{margin:12px 0}summary{cursor:pointer;font-weight:600;padding:8px 0}
</style>
</head>
<body>
<h1>MAS Web Accessibility Test Report: ${escapeHtml(metadata.target || "Accessibility exploration")}</h1>
<div class="meta">
<p><strong>Run date:</strong> ${escapeHtml(aggregate.generatedAt)} | <strong>Standard:</strong> MAS Web | <strong>Public mapping:</strong> WCAG 2.2 A/AA</p>
<p><strong>Mode:</strong> ${escapeHtml(metadata.executionEnvironment || "unknown")} | <strong>Browser:</strong> Chromium${
    includedCategories.has("screen-reader")
      ? ` | <strong>Screen reader:</strong> ${escapeHtml(screenReaderLabel(aggregate))}`
      : ""
  }</p>
${metadata.reportScope ? `<p><strong>Report scope:</strong> ${escapeHtml(metadata.reportScope)}</p>` : ""}
<p><strong>URL:</strong> ${renderedUrl}</p>
<p><strong>Evidence:</strong> Report-local artifacts with validated hashes</p>
</div>
<h2>Summary</h2>
<div class="summary-grid">
<div class="summary-card card-violations"><div class="count">${counts.VIOLATION}</div><div class="label">Violations</div></div>
<div class="summary-card card-best-practice"><div class="count">${counts["BEST-PRACTICE"]}</div><div class="label">Best Practices</div></div>
<div class="summary-card card-pass"><div class="count">${counts.PASS}</div><div class="label">Passed</div></div>
<div class="summary-card card-needs-review"><div class="count">${counts["NEEDS-REVIEW"]}</div><div class="label">Needs Review</div></div>
</div>
<table><thead><tr><th>Category</th><th>Violations</th><th>Best Practices</th><th>Pass</th><th>Needs Review</th></tr></thead><tbody>${renderCategorySummary(
    aggregate,
    reportableFindings,
  )}</tbody></table>
<h2>MAS Web Evaluation</h2>
<table><thead><tr><th>MAS rule / public mapping</th><th>Status</th><th>Details</th></tr></thead><tbody>${renderWcagTable(
    plan,
    aggregate,
  )}</tbody></table>
<h2>Findings</h2>
${cards || "<p>No findings were recorded.</p>"}
${includedCategories.has("keyboard-focus") ? `<h2>Tab Order Map</h2><div class="structure-section">${renderTabOrder(runDir, aggregate)}</div>` : ""}
${includedCategories.has("keyboard-focus") ? `<h2>Keyboard Navigation</h2><div class="structure-section">${renderKeyboardNavigation(runDir, aggregate)}</div>` : ""}
${includedCategories.has("structure-semantics") ? `<h2>Heading Hierarchy</h2><div class="structure-section">${renderHeadingHierarchy(runDir, aggregate)}</div>
<h2>Landmark Regions</h2><div class="structure-section">${renderLandmarks(runDir, aggregate)}</div>` : ""}
<h2>Task Runtime</h2>
<table><thead><tr><th>Task</th><th>Duration</th></tr></thead><tbody>${renderRuntime(aggregate)}</tbody></table>
${includedCategories.has("screen-reader") ? `<details><summary>NVDA Transcript (excerpts)</summary><pre>${escapeHtml(
    renderNvdaExcerpt(runDir, aggregate),
  )}</pre></details>` : ""}
<details><summary>Test Coverage Notes</summary>${renderCoverageNotes(
    aggregate,
    plan,
    omittedFindings,
    Boolean(metadata.reportScope),
  )}</details>
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
      throw new Error("Findings and report outputs must remain inside --run-dir");
    }
  }
  const realRun = fs.realpathSync(runDir);
  const realFindings = fs.realpathSync(findingsPath);
  if (!isPathInside(realRun, realFindings)) throw new Error("Findings path resolves outside --run-dir");
  JSON.parse(fs.readFileSync(realFindings, "utf8"));
  let aggregate = aggregateResults(runDir);
  const metadataPath = path.join(runDir, "run.json");
  const planPath = path.join(runDir, "plan.json");
  const bugsPath = path.join(runDir, "ado-bugs.json");
  for (const candidate of [metadataPath, planPath, bugsPath]) {
    if (fs.existsSync(candidate) && !isPathInside(realRun, fs.realpathSync(candidate))) {
      throw new Error(`${path.basename(candidate)} resolves outside --run-dir`);
    }
  }
  let metadata = fs.existsSync(metadataPath) ? JSON.parse(fs.readFileSync(metadataPath, "utf8")) : {};
  if (!fs.existsSync(planPath)) throw new Error("plan.json is required for report rendering");
  let plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
  if (args.category) {
    if (!CATEGORY_LABELS[args.category]) {
      throw new Error(`Unknown --category: ${args.category}`);
    }
    const categories = aggregate.categories.filter((entry) => entry.category === args.category);
    const evidence = aggregate.evidence.filter((entry) => entry.category === args.category);
    const selectedResultPath = categories[0]?.resultPath;
    const selectedResult = JSON.parse(fs.readFileSync(selectedResultPath, "utf8"));
    const findings = selectedResult.findings.map((entry) => ({
        ...entry,
        id: `${args.category}:${entry.id}`,
        category: args.category,
        sourceResult: selectedResultPath,
        sourceResults: [selectedResultPath],
      }));
    aggregate = {
      ...aggregate,
      categories,
      scResults: aggregate.scResults.filter((entry) => entry.category === args.category),
      findings,
      evidence,
    };
    const byClassification = {};
    const bySeverity = {};
    for (const finding of aggregate.findings) {
      byClassification[finding.classification] =
        (byClassification[finding.classification] ?? 0) + 1;
      if (finding.severity) {
        bySeverity[finding.severity] = (bySeverity[finding.severity] ?? 0) + 1;
      }
    }
    aggregate.counts = {
      total: aggregate.findings.length,
      byClassification,
      bySeverity,
    };
    const planCategories = plan.categories.filter((entry) => entry.category === args.category);
    plan = {
      ...plan,
      requestedCategories: [args.category],
      categories: planCategories,
      scCoverage: [...new Set(planCategories.flatMap((entry) => entry.wcagSc))],
    };
    metadata = {
      ...metadata,
      target: `${metadata.target || "Accessibility exploration"} — ${CATEGORY_LABELS[args.category]}`,
      reportScope: CATEGORY_LABELS[args.category],
    };
  }
  let bugs = fs.existsSync(bugsPath) ? JSON.parse(fs.readFileSync(bugsPath, "utf8")) : [];
  if (!Array.isArray(bugs)) throw new Error("ado-bugs.json must contain an array");
  if (args.category) {
    const findingIds = new Set(aggregate.findings.map((entry) => entry.id));
    bugs = bugs.filter((entry) => findingIds.has(entry.findingId));
  }
  const report = { ...aggregate, metadata, adoBugs: bugs };
  safeWriteFile(runDir, outputJson, `${JSON.stringify(report, null, 2)}\n`);
  safeWriteFile(runDir, outputHtml, renderReport(runDir, aggregate, metadata, plan, bugs));
  process.stdout.write(`${outputHtml}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(`[a11y-explore-report] ${error.message}`);
    process.exitCode = 1;
  }
}
