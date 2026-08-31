#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BLOCKER_TERMINAL = new Set(['blocker-resolved', 'blocker-abandoned']);
const MAX_SUMMARY_LENGTH = 240;
const SHARE_CONFIRMATION = 'SHARE RUN INSIGHTS ONCE';
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

function now() {
  return new Date().toISOString();
}

function parseArgs(argv) {
  const [command, sessionDirArg, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const value = rest[index + 1];
    if (value && !value.startsWith('--')) {
      options[key] = value;
      index += 1;
    } else {
      options[key] = true;
    }
  }
  return { command, sessionDir: sessionDirArg ? path.resolve(sessionDirArg) : undefined, options };
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function atomicWriteJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tempPath, filePath);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function readNdjson(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const records = [];
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      // A malformed or partial record is excluded without discarding later complete records.
    }
  }
  return records;
}

function redactText(value) {
  if (typeof value !== 'string') return undefined;
  return value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\b(bearer|token|secret|password|cookie)\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .replace(/\b[A-Z]:\\[^\s]+/gi, '[path]')
    .replace(/(?:^|\s)(?:\/workspaces|\/home|\/Users|~\/)[^\s]*/g, ' [path]')
    .replace(/\bhttps?:\/\/[^\s]+/gi, '[url]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '[id]')
    .replace(/\b[0-9a-f]{24,}\b/gi, '[digest]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_SUMMARY_LENGTH);
}

function elapsedMs(start, end) {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;
  return Math.max(0, endMs - startMs);
}

function formatDuration(durationMs) {
  const totalSeconds = Math.round(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function markdownText(value) {
  return String(value).replace(/[\\`*_{}[\]<>|]/g, '\\$&');
}

function htmlText(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizedLabel(value, fallback = 'other') {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value)
    ? value
    : fallback;
}

function agentowVersion() {
  for (const manifestPath of [
    path.resolve(scriptDirectory, '..', '.claude-plugin', 'plugin.json'),
    path.resolve(scriptDirectory, '..', 'copilot', '.claude-plugin', 'plugin.json')
  ]) {
    const manifest = readJson(manifestPath, undefined);
    if (manifest?.version) return manifest.version;
  }
  return 'unknown';
}

function getReportMeta(insightsDir) {
  const metaPath = path.join(insightsDir, 'meta.json');
  let meta = readJson(metaPath, undefined);
  if (!meta) {
    meta = { schemaVersion: 1, reportId: crypto.randomUUID(), createdAt: now() };
    atomicWriteJson(metaPath, meta);
  }
  return meta;
}

function reportComparable(report) {
  const comparable = structuredClone(report);
  delete comparable.generatedAt;
  return comparable;
}

function summarizeBlockers(lifecycle, completedAt) {
  const grouped = new Map();
  for (const event of lifecycle) {
    if (!event.blockerId || !event.status?.startsWith('blocker-')) continue;
    const events = grouped.get(event.blockerId) ?? [];
    events.push(event);
    grouped.set(event.blockerId, events);
  }

  return [...grouped.values()]
    .map((events, index) => {
      events.sort((left, right) => String(left.timestamp).localeCompare(String(right.timestamp)));
      const opened = events.find((event) => event.status === 'blocker-opened');
      if (!opened) return undefined;
      const terminal = events.find((event) => BLOCKER_TERMINAL.has(event.status));
      const attempts = events.filter((event) => event.status === 'blocker-attempted');
      const humanIntervention =
        opened.humanIntervention === true ||
        attempts.some((event) => event.automated === false) ||
        terminal?.automated === false;
      return {
        blocker: `B${index + 1}`,
        category: normalizedLabel(opened.category),
        phase: normalizedLabel(opened.phase, 'unknown'),
        status:
          terminal?.status === 'blocker-resolved'
            ? 'resolved'
            : terminal?.status === 'blocker-abandoned'
              ? 'abandoned'
              : 'open',
        durationMs: elapsedMs(opened.timestamp, terminal?.timestamp ?? completedAt ?? now()),
        attemptCount: attempts.length,
        attempts: attempts.map((attempt, attemptIndex) => ({
          attempt: attemptIndex + 1,
          strategy: normalizedLabel(attempt.strategyKind),
          outcome: normalizedLabel(attempt.outcome),
          automated: attempt.automated === true
        })),
        humanIntervention,
        automatedResolution: terminal?.status === 'blocker-resolved' && terminal.automated === true,
        summary: `${normalizedLabel(opened.category)} blocker in ${normalizedLabel(
          opened.phase,
          'unknown'
        )}`,
        resolutionKind: normalizedLabel(terminal?.resolutionKind, 'unresolved'),
        resolution:
          terminal?.status === 'blocker-resolved'
            ? `Resolved through ${normalizedLabel(terminal.resolutionKind)}`
            : terminal?.status === 'blocker-abandoned'
              ? `Abandoned as ${normalizedLabel(terminal.resolutionKind)}`
              : 'Not resolved'
      };
    })
    .filter(Boolean);
}

function deriveOutcome(state, blockers) {
  if (state.status !== 'completed') return normalizedLabel(state.status, 'unknown');
  if (blockers.some((blocker) => blocker.status !== 'resolved')) return 'completed-with-blockers';
  return 'completed';
}

function deriveRecommendations(phases, blockers) {
  const recommendations = [];
  const slowest = phases[0];
  if (slowest) {
    recommendations.push({
      signal: 'slowest-phase',
      finding: `${slowest.phase} consumed ${slowest.sharePercent}% of active time`,
      suggestedFocus: `Inspect repeated waits and recovery opportunities in ${slowest.phase}`
    });
  }
  const retryHeavy = blockers.filter((blocker) => blocker.attemptCount > 1);
  if (retryHeavy.length > 0) {
    recommendations.push({
      signal: 'repeated-recovery',
      finding: `${retryHeavy.length} blocker(s) required multiple recovery attempts`,
      suggestedFocus: 'Turn the successful recovery sequence into a preflight or bounded automatic repair'
    });
  }
  const manual = blockers.filter((blocker) => blocker.humanIntervention);
  if (manual.length > 0) {
    recommendations.push({
      signal: 'human-intervention',
      finding: `${manual.length} blocker(s) required human intervention`,
      suggestedFocus: 'Separate unavoidable approval from environment or tooling work that can be automated'
    });
  }
  const unresolved = blockers.filter((blocker) => blocker.status !== 'resolved');
  if (unresolved.length > 0) {
    recommendations.push({
      signal: 'unresolved-blocker',
      finding: `${unresolved.length} blocker(s) remained unresolved`,
      suggestedFocus: 'Add an explicit fallback or earlier fail-fast check for the unresolved category'
    });
  }
  return recommendations;
}

export function buildInsights(sessionDir) {
  const state = readJson(path.join(sessionDir, 'run-state.json'), undefined);
  if (!state) throw new Error(`run-state.json is missing in ${sessionDir}`);
  const insightsDir = path.join(sessionDir, 'insights');
  const meta = getReportMeta(insightsDir);
  const lifecycle = readNdjson(path.join(sessionDir, 'lifecycle.ndjson'));
  const completedAt = state.timing?.completedAt ?? state.updatedAt;
  const blockers = summarizeBlockers(lifecycle, completedAt);
  const activeDurationMs = state.timing?.summary?.activeDurationMs ?? 0;
  const phases = Object.entries(state.timing?.summary?.phaseDurationsMs ?? {})
    .map(([phase, durationMs]) => ({
      phase: normalizedLabel(phase, 'unknown'),
      durationMs,
      sharePercent: activeDurationMs > 0 ? Math.round((durationMs / activeDurationMs) * 1000) / 10 : 0
    }))
    .filter((phase) => phase.durationMs > 0)
    .sort((left, right) => right.durationMs - left.durationMs);
  const phaseEntries = lifecycle.filter((event) => event.status === 'phase');
  const finalText = fs.existsSync(path.join(sessionDir, 'final.md'))
    ? fs.readFileSync(path.join(sessionDir, 'final.md'), 'utf8')
    : '';

  const report = {
    schemaVersion: 1,
    reportId: meta.reportId,
    generatedAt: now(),
    privacy: {
      classification: 'anonymous-operational',
      containsSourceCode: false,
      containsPromptText: false,
      containsRawLogs: false,
      containsUserIdentity: false,
      containsFreeText: false
    },
    run: {
      outcome: deriveOutcome(state, blockers),
      agentowVersion: agentowVersion(),
      executionProfile: state.executionProfile === 'poc' ? 'poc' : 'standard',
      revisionCount: state.revision ?? 1,
      wallDurationMs: state.timing?.summary?.wallDurationMs ?? 0,
      activeDurationMs,
      interruptedDurationMs: state.timing?.summary?.interruptedDurationMs ?? 0,
      draftPrCreated:
        /pullrequest\/\d+/iu.test(finalText) ||
        /draft\s+pr\s*:\s*(?:yes|created|https?)/iu.test(finalText) ||
        /pr\s+url\s*:\s*https?/iu.test(finalText)
    },
    phases,
    blockers,
    metrics: {
      blockerCount: blockers.length,
      resolvedBlockerCount: blockers.filter((blocker) => blocker.status === 'resolved').length,
      automatedResolutionCount: blockers.filter((blocker) => blocker.automatedResolution).length,
      humanInterventionCount: blockers.filter((blocker) => blocker.humanIntervention).length,
      implementationCycles: phaseEntries.filter((event) => event.phase === 'implementation').length,
      evaluationCycles: phaseEntries.filter((event) => event.phase === 'evaluation').length,
      reviewCycles: phaseEntries.filter((event) => event.phase === 'review').length
    }
  };
  report.recommendations = deriveRecommendations(phases, blockers);
  const previousReport = readJson(
    path.join(insightsDir, 'run-insights.v1.json'),
    undefined
  );
  if (
    previousReport &&
    JSON.stringify(reportComparable(previousReport)) === JSON.stringify(reportComparable(report))
  ) {
    report.generatedAt = previousReport.generatedAt;
  }
  validateReport(report);

  const jsonPath = path.join(insightsDir, 'run-insights.v1.json');
  atomicWriteJson(jsonPath, report);
  const markdownPath = path.join(insightsDir, 'run-insights.md');
  fs.writeFileSync(markdownPath, renderMarkdown(report));
  const htmlPath = path.join(insightsDir, 'run-insights.html');
  const reportHtml = renderHtml(report);
  const emailHtml = renderEmailHtml(report);
  fs.writeFileSync(htmlPath, reportHtml);
  return {
    report,
    jsonPath,
    markdownPath,
    htmlPath,
    sha256: sha256(fs.readFileSync(jsonPath)),
    reportHtml,
    reportHtmlSha256: sha256(reportHtml),
    emailHtml,
    emailHtmlSha256: sha256(emailHtml)
  };
}

function validateReport(report) {
  if (report.schemaVersion !== 1 || !report.reportId || !report.generatedAt) {
    throw new Error('run insights identity is incomplete');
  }
  for (const field of [
    'containsSourceCode',
    'containsPromptText',
    'containsRawLogs',
    'containsUserIdentity',
    'containsFreeText'
  ]) {
    if (report.privacy[field] !== false) throw new Error(`privacy invariant failed: ${field}`);
  }
  if (!Array.isArray(report.phases) || !Array.isArray(report.blockers)) {
    throw new Error('run insights phases and blockers must be arrays');
  }
  for (const blocker of report.blockers) {
    if (!/^B[1-9][0-9]*$/.test(blocker.blocker)) throw new Error('invalid anonymous blocker ID');
    if (blocker.summary.length > MAX_SUMMARY_LENGTH || blocker.resolution.length > MAX_SUMMARY_LENGTH) {
      throw new Error(`blocker ${blocker.blocker} exceeds the redacted text limit`);
    }
    for (const attempt of blocker.attempts) {
      if (attempt.strategy.length > MAX_SUMMARY_LENGTH || attempt.outcome.length > MAX_SUMMARY_LENGTH) {
        throw new Error(`blocker ${blocker.blocker} attempt exceeds the redacted text limit`);
      }
    }
  }
}

export function renderMarkdown(report) {
  const phaseRows =
    report.phases.length > 0
      ? report.phases
          .map(
            (phase) =>
              `| ${phase.phase} | ${formatDuration(phase.durationMs)} | ${phase.sharePercent}% |`
          )
          .join('\n')
      : '| No phase timing recorded | 0s | 0% |';
  const blockerRows =
    report.blockers.length > 0
      ? report.blockers
          .map(
            (blocker) =>
              `| ${blocker.blocker} | ${blocker.phase} | ${blocker.category} | ${formatDuration(
                blocker.durationMs
              )} | ${blocker.attemptCount} | ${blocker.status} | ${blocker.resolutionKind} |`
          )
          .join('\n')
      : '| None | - | - | 0s | 0 | - | - |';
  const blockerDetails = report.blockers
    .map(
      (blocker) => {
        const attempts = blocker.attempts
          .map(
            (attempt) =>
              `${attempt.attempt}. ${markdownText(attempt.strategy)} → ${markdownText(
                attempt.outcome
              )} (${attempt.automated ? 'automated' : 'manual'})`
          )
          .join('\n');
        return (
        `### ${blocker.blocker}: ${markdownText(blocker.summary)}\n\n` +
        `${attempts ? `**Attempts:**\n${attempts}\n\n` : ''}` +
        `**Resolution:** ${markdownText(blocker.resolution)}  \n` +
        `**Human intervention:** ${blocker.humanIntervention ? 'Yes' : 'No'}`
        );
      }
    )
    .join('\n\n');
  const recommendations =
    report.recommendations.length > 0
      ? report.recommendations
          .map(
            (item) =>
              `- **${markdownText(item.finding)}.** ${markdownText(item.suggestedFocus)}.`
          )
          .join('\n')
      : '- No optimization signal was derived from this run.';

  return `# AgentOW Run Insights

> Anonymous operational report. Source code, prompt text, raw logs, paths, URLs, and user identity are excluded.

## Summary

| Outcome | AgentOW | Profile | Wall time | Active time | Interrupted | Draft PR | Blockers |
|---|---|---|---:|---:|---:|---|---:|
| ${report.run.outcome} | ${report.run.agentowVersion} | ${report.run.executionProfile} | ${formatDuration(
    report.run.wallDurationMs
  )} | ${formatDuration(report.run.activeDurationMs)} | ${formatDuration(
    report.run.interruptedDurationMs
  )} | ${report.run.draftPrCreated ? 'Yes' : 'No'} | ${report.metrics.blockerCount} |

## Phase timing

| Phase | Duration | Active share |
|---|---:|---:|
${phaseRows}

## Blockers

| ID | Phase | Category | Duration | Attempts | Status | Resolution type |
|---|---|---|---:|---:|---|---|
${blockerRows}

${blockerDetails ? `${blockerDetails}\n\n` : ''}## Improvement signals

${recommendations}

---

Report ID: \`${report.reportId}\` · Schema: v${report.schemaVersion}
`;
}

export function renderHtml(report) {
  const phaseRows =
    report.phases.length > 0
      ? report.phases
          .map((phase) => {
            const width = Math.max(0, Math.min(100, phase.sharePercent));
            return `<div class="phase-row">
              <div class="phase-label"><strong>${htmlText(phase.phase)}</strong><span>${htmlText(
                formatDuration(phase.durationMs)
              )}</span></div>
              <div class="bar-track" role="img" aria-label="${htmlText(
                `${phase.phase}: ${formatDuration(phase.durationMs)}, ${phase.sharePercent}% of active time`
              )}"><span class="bar" style="width:${width}%"></span></div>
              <span class="phase-share">${htmlText(phase.sharePercent)}%</span>
            </div>`;
          })
          .join('')
      : '<p class="empty">No phase timing was recorded.</p>';
  const blockers =
    report.blockers.length > 0
      ? report.blockers
          .map((blocker) => {
            const attempts =
              blocker.attempts.length > 0
                ? `<ol class="attempts">${blocker.attempts
                    .map(
                      (attempt) => `<li>
                        <span class="attempt-index">${attempt.attempt}</span>
                        <div><strong>${htmlText(attempt.strategy)}</strong>
                        <span class="attempt-result ${htmlText(attempt.outcome)}">${htmlText(
                          attempt.outcome
                        )}</span>
                        <small>${attempt.automated ? 'Automated' : 'Manual'}</small></div>
                      </li>`
                    )
                    .join('')}</ol>`
                : '<p class="empty">No recovery attempts recorded.</p>';
            return `<article class="blocker-card">
              <header>
                <div>
                  <span class="eyebrow">${htmlText(blocker.blocker)} · ${htmlText(
                    blocker.phase
                  )}</span>
                  <h3>${htmlText(blocker.category)} blocker</h3>
                </div>
                <span class="status ${htmlText(blocker.status)}">${htmlText(blocker.status)}</span>
              </header>
              <div class="blocker-meta">
                <span><b>${htmlText(formatDuration(blocker.durationMs))}</b> duration</span>
                <span><b>${blocker.attemptCount}</b> attempts</span>
                <span><b>${blocker.humanIntervention ? 'Yes' : 'No'}</b> human intervention</span>
              </div>
              ${attempts}
              <div class="resolution"><span>Resolution</span><strong>${htmlText(
                blocker.resolutionKind
              )}</strong></div>
            </article>`;
          })
          .join('')
      : '<div class="empty-card"><strong>No blockers</strong><span>This run completed without a recorded blocker.</span></div>';
  const recommendations =
    report.recommendations.length > 0
      ? report.recommendations
          .map(
            (item, index) => `<article class="signal">
              <span class="signal-number">${String(index + 1).padStart(2, '0')}</span>
              <div><h3>${htmlText(item.finding)}</h3><p>${htmlText(item.suggestedFocus)}</p></div>
            </article>`
          )
          .join('')
      : '<p class="empty">No improvement signal was derived from this run.</p>';
  const outcomeLabel = report.run.outcome.replaceAll('-', ' ');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AgentOW Run Insights</title>
  <style>
    :root{color-scheme:light;--ink:#172033;--muted:#5d6678;--line:#dfe3eb;--paper:#fff;--canvas:#f4f6fa;--navy:#14213d;--blue:#2563eb;--cyan:#08a6b3;--green:#15803d;--green-bg:#eaf7ee;--amber:#a15c00;--amber-bg:#fff4df;--red:#b42318;--red-bg:#feeceb}
    *{box-sizing:border-box}body{margin:0;background:var(--canvas);color:var(--ink);font-family:"Segoe UI",Inter,Arial,sans-serif;line-height:1.5}
    main{max-width:1080px;margin:0 auto;padding:44px 28px 64px}.hero{position:relative;overflow:hidden;background:var(--navy);color:#fff;border-radius:22px;padding:42px;box-shadow:0 16px 45px #14213d24}
    .hero:after{content:"";position:absolute;width:340px;height:340px;right:-110px;top:-180px;border-radius:50%;background:linear-gradient(135deg,#2f6fed,#12b8c5);opacity:.65}.hero>*{position:relative;z-index:1}
    .brand{display:flex;align-items:center;gap:10px;font-weight:700;letter-spacing:.04em}.mark{display:grid;place-items:center;width:32px;height:32px;border-radius:9px;background:linear-gradient(135deg,#4e7cff,#16c3c9);font-size:13px}
    .hero h1{font-size:42px;line-height:1.1;margin:46px 0 10px;letter-spacing:-.035em}.hero p{max-width:680px;margin:0;color:#ccd5e7;font-size:17px}.hero-meta{display:flex;gap:10px;flex-wrap:wrap;margin-top:28px}.pill{padding:7px 12px;border:1px solid #ffffff30;border-radius:999px;background:#ffffff10;font-size:13px}
    .section{margin-top:34px}.section-head{display:flex;justify-content:space-between;align-items:end;gap:20px;margin-bottom:15px}.section h2{margin:0;font-size:24px;letter-spacing:-.02em}.section-head p{margin:0;color:var(--muted);font-size:14px}
    .metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:-18px;position:relative;z-index:2;padding:0 18px}.metric{background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:19px;box-shadow:0 8px 24px #14213d0b}.metric span{display:block;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.08em}.metric strong{display:block;font-size:25px;margin-top:5px}.metric small{color:var(--muted)}
    .panel{background:var(--paper);border:1px solid var(--line);border-radius:18px;padding:24px}.phase-row{display:grid;grid-template-columns:170px 1fr 54px;align-items:center;gap:16px;padding:12px 0}.phase-row+.phase-row{border-top:1px solid #eef0f5}.phase-label{display:flex;justify-content:space-between;gap:10px}.phase-label span,.phase-share{color:var(--muted);font-variant-numeric:tabular-nums}.bar-track{height:11px;border-radius:999px;background:#e9edf5;overflow:hidden}.bar{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--blue),var(--cyan))}
    .blocker-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.blocker-card{background:var(--paper);border:1px solid var(--line);border-radius:18px;padding:22px}.blocker-card header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.eyebrow{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.08em}.blocker-card h3{margin:4px 0 0;font-size:21px;text-transform:capitalize}.status{padding:5px 10px;border-radius:999px;font-size:12px;font-weight:700;text-transform:capitalize}.status.resolved{color:var(--green);background:var(--green-bg)}.status.open{color:var(--amber);background:var(--amber-bg)}.status.abandoned{color:var(--red);background:var(--red-bg)}
    .blocker-meta{display:flex;gap:14px;flex-wrap:wrap;margin:20px 0;padding:13px 0;border-block:1px solid #eef0f5;color:var(--muted);font-size:12px}.blocker-meta b{color:var(--ink)}.attempts{list-style:none;margin:0;padding:0}.attempts li{display:flex;gap:12px;position:relative;padding:9px 0}.attempts li:not(:last-child):after{content:"";position:absolute;left:14px;top:38px;bottom:-2px;width:1px;background:var(--line)}.attempt-index{display:grid;place-items:center;flex:0 0 29px;height:29px;border-radius:50%;background:#edf3ff;color:var(--blue);font-size:12px;font-weight:700}.attempts strong{font-size:14px}.attempts small{display:block;color:var(--muted)}.attempt-result{display:inline-block;margin-left:8px;padding:2px 7px;border-radius:999px;background:#eef0f5;font-size:11px}.attempt-result.succeeded{color:var(--green);background:var(--green-bg)}.attempt-result.failed{color:var(--red);background:var(--red-bg)}.resolution{display:flex;justify-content:space-between;gap:12px;margin-top:18px;padding:13px 14px;border-radius:12px;background:#f3f7ff}.resolution span{color:var(--muted);font-size:13px}.empty-card{display:flex;flex-direction:column;gap:4px;background:var(--paper);border:1px solid var(--line);border-radius:18px;padding:24px}.empty-card span,.empty{color:var(--muted)}
    .signals{display:grid;gap:12px}.signal{display:flex;gap:18px;background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:19px}.signal-number{color:var(--blue);font-size:13px;font-weight:800}.signal h3{margin:0;font-size:16px}.signal p{margin:4px 0 0;color:var(--muted)}
    .privacy{display:flex;gap:16px;align-items:flex-start;background:#eef8f4;border:1px solid #cde9dc;border-radius:16px;padding:19px}.privacy-icon{display:grid;place-items:center;flex:0 0 36px;height:36px;border-radius:11px;background:#d8f1e5;color:var(--green);font-weight:800}.privacy h2{font-size:17px;margin:0}.privacy p{margin:4px 0 0;color:#476358;font-size:14px}
    footer{display:flex;justify-content:space-between;gap:20px;margin-top:34px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:12px}
    @media(max-width:760px){main{padding:20px 14px 40px}.hero{padding:28px}.hero h1{font-size:33px;margin-top:34px}.metrics{grid-template-columns:repeat(2,1fr);padding:0 10px}.phase-row{grid-template-columns:1fr 48px}.phase-label{grid-column:1/-1}.blocker-grid{grid-template-columns:1fr}footer{flex-direction:column}}
    @media print{body{background:#fff}main{max-width:none;padding:0}.hero,.metric,.panel,.blocker-card,.signal{box-shadow:none;break-inside:avoid}.hero{border-radius:0}.metrics{margin-top:18px}}
  </style>
</head>
<body>
<main>
  <header class="hero">
    <div class="brand"><span class="mark">OW</span> agentOW</div>
    <h1>Run Insights</h1>
    <p>An operational view of where the run spent time, what blocked it, and which recovery patterns are worth automating next.</p>
    <div class="hero-meta">
      <span class="pill">${htmlText(outcomeLabel)}</span>
      <span class="pill">v${htmlText(report.run.agentowVersion)}</span>
      <span class="pill">${htmlText(report.run.executionProfile)} profile</span>
      <span class="pill">${report.run.draftPrCreated ? 'Draft PR created' : 'No Draft PR'}</span>
    </div>
  </header>

  <section class="metrics" aria-label="Run summary">
    <article class="metric"><span>Wall time</span><strong>${htmlText(
      formatDuration(report.run.wallDurationMs)
    )}</strong><small>Start to finish</small></article>
    <article class="metric"><span>Active time</span><strong>${htmlText(
      formatDuration(report.run.activeDurationMs)
    )}</strong><small>Excludes interruption</small></article>
    <article class="metric"><span>Interrupted</span><strong>${htmlText(
      formatDuration(report.run.interruptedDurationMs)
    )}</strong><small>User-paused time</small></article>
    <article class="metric"><span>Blockers</span><strong>${report.metrics.blockerCount}</strong><small>${
      report.metrics.resolvedBlockerCount
    } resolved</small></article>
  </section>

  <section class="section" aria-labelledby="phase-title">
    <div class="section-head"><h2 id="phase-title">Phase timing</h2><p>Share of ${htmlText(
      formatDuration(report.run.activeDurationMs)
    )} active time</p></div>
    <div class="panel">${phaseRows}</div>
  </section>

  <section class="section" aria-labelledby="blocker-title">
    <div class="section-head"><h2 id="blocker-title">Blocker journey</h2><p>${report.metrics.automatedResolutionCount} automated resolutions · ${report.metrics.humanInterventionCount} required human help</p></div>
    <div class="blocker-grid">${blockers}</div>
  </section>

  <section class="section" aria-labelledby="signal-title">
    <div class="section-head"><h2 id="signal-title">Improvement signals</h2><p>Derived from structured run events</p></div>
    <div class="signals">${recommendations}</div>
  </section>

  <section class="section privacy" aria-labelledby="privacy-title">
    <span class="privacy-icon" aria-hidden="true">✓</span>
    <div><h2 id="privacy-title">Privacy-safe by construction</h2><p>No source code, prompts, raw logs, paths, URLs, user identity, or user-authored free text is included. Sharing requires explicit consent for this exact report.</p></div>
  </section>

  <footer><span>Report ${htmlText(report.reportId)}</span><span>Generated ${htmlText(
    report.generatedAt
  )} · Schema v${report.schemaVersion}</span></footer>
</main>
</body>
</html>
`;
}

export function renderEmailHtml(report) {
  const phaseRows =
    report.phases.length > 0
      ? report.phases
          .map(
            (phase) => `<tr>
              <td style="padding:10px 12px;border-bottom:1px solid #e4e7ec;font-weight:600">${htmlText(
                phase.phase
              )}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #e4e7ec;text-align:right">${htmlText(
                formatDuration(phase.durationMs)
              )}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #e4e7ec;text-align:right">${htmlText(
                phase.sharePercent
              )}%</td>
            </tr>`
          )
          .join('')
      : '<tr><td colspan="3" style="padding:12px;color:#667085">No phase timing recorded.</td></tr>';
  const blockerRows =
    report.blockers.length > 0
      ? report.blockers
          .map(
            (blocker) => `<tr>
              <td style="padding:10px 12px;border-bottom:1px solid #e4e7ec">${htmlText(
                blocker.blocker
              )}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #e4e7ec">${htmlText(
                blocker.phase
              )}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #e4e7ec">${htmlText(
                blocker.category
              )}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #e4e7ec;text-align:right">${htmlText(
                formatDuration(blocker.durationMs)
              )}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #e4e7ec;text-align:right">${
                blocker.attemptCount
              }</td>
              <td style="padding:10px 12px;border-bottom:1px solid #e4e7ec">${htmlText(
                blocker.resolutionKind
              )}</td>
            </tr>`
          )
          .join('')
      : '<tr><td colspan="6" style="padding:12px;color:#667085">No blockers recorded.</td></tr>';
  const recommendations = report.recommendations
    .map(
      (item) => `<li style="margin:0 0 10px"><strong>${htmlText(
        item.finding
      )}</strong><br><span style="color:#667085">${htmlText(item.suggestedFocus)}</span></li>`
    )
    .join('');
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>AgentOW Run Insights</title></head>
<body style="margin:0;background:#f4f6fa;color:#172033;font-family:Segoe UI,Arial,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6fa">
    <tr><td align="center" style="padding:24px 12px">
      <table role="presentation" width="720" cellspacing="0" cellpadding="0" style="width:100%;max-width:720px;background:#ffffff;border:1px solid #dfe3eb">
        <tr><td style="padding:28px;background:#14213d;color:#ffffff">
          <div style="font-size:13px;font-weight:700;letter-spacing:.08em">agentOW</div>
          <h1 style="margin:18px 0 6px;font-size:32px;line-height:1.2">Run Insights</h1>
          <p style="margin:0;color:#ccd5e7">Operational timing, blockers, recovery, and improvement signals.</p>
        </td></tr>
        <tr><td style="padding:24px">
          <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">
            <tr>
              <td style="padding:12px;border:1px solid #e4e7ec"><small style="color:#667085">WALL TIME</small><br><strong style="font-size:22px">${htmlText(
                formatDuration(report.run.wallDurationMs)
              )}</strong></td>
              <td style="padding:12px;border:1px solid #e4e7ec"><small style="color:#667085">ACTIVE TIME</small><br><strong style="font-size:22px">${htmlText(
                formatDuration(report.run.activeDurationMs)
              )}</strong></td>
              <td style="padding:12px;border:1px solid #e4e7ec"><small style="color:#667085">BLOCKERS</small><br><strong style="font-size:22px">${
                report.metrics.blockerCount
              }</strong></td>
            </tr>
          </table>
          <h2 style="margin:28px 0 10px;font-size:20px">Phase timing</h2>
          <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #e4e7ec">
            <tr style="background:#f8fafc"><th align="left" style="padding:9px 12px">Phase</th><th align="right" style="padding:9px 12px">Duration</th><th align="right" style="padding:9px 12px">Share</th></tr>
            ${phaseRows}
          </table>
          <h2 style="margin:28px 0 10px;font-size:20px">Blockers</h2>
          <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #e4e7ec">
            <tr style="background:#f8fafc"><th align="left" style="padding:9px 12px">ID</th><th align="left" style="padding:9px 12px">Phase</th><th align="left" style="padding:9px 12px">Type</th><th align="right" style="padding:9px 12px">Duration</th><th align="right" style="padding:9px 12px">Attempts</th><th align="left" style="padding:9px 12px">Resolution</th></tr>
            ${blockerRows}
          </table>
          <h2 style="margin:28px 0 10px;font-size:20px">Improvement signals</h2>
          <ol style="padding-left:22px">${recommendations || '<li>No signal derived.</li>'}</ol>
          <p style="margin:24px 0 0;padding:14px;background:#eef8f4;border:1px solid #cde9dc;color:#315c49"><strong>Privacy-safe:</strong> no source, prompts, raw logs, paths, URLs, identity, or user-authored free text.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function authorize(sessionDir, options) {
  if (options.decision !== 'share-once' && options.decision !== 'decline') {
    throw new Error('--decision must be share-once or decline');
  }
  if (!options['response-file']) throw new Error('--response-file is required');
  const response = fs.readFileSync(path.resolve(options['response-file']), 'utf8').trim();
  if (!response) throw new Error('the direct user response must not be empty');
  if (options.decision === 'share-once' && response !== SHARE_CONFIRMATION) {
    throw new Error(`share-once requires the exact direct user response: ${SHARE_CONFIRMATION}`);
  }
  const built = buildInsights(sessionDir);
  const recipient = options.decision === 'share-once' ? options.recipient : undefined;
  if (options.decision === 'share-once' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient ?? '')) {
    throw new Error('--recipient must be a valid email address for share-once');
  }
  const consent = {
    schemaVersion: 1,
    decision: options.decision,
    scope: 'current-report',
    recordedAt: now(),
    source: 'direct-user-response',
    reportId: built.report.reportId,
    reportSha256: built.sha256,
    reportHtmlSha256: built.reportHtmlSha256,
    emailHtmlSha256: built.emailHtmlSha256,
    responseSha256: sha256(response),
    recipient
  };
  atomicWriteJson(path.join(sessionDir, 'insights', 'consent.json'), consent);
  return consent;
}

function requireConsent(sessionDir) {
  const built = buildInsights(sessionDir);
  const consentPath = path.join(sessionDir, 'insights', 'consent.json');
  const consent = readJson(consentPath, undefined);
  if (!consent || consent.decision !== 'share-once') {
    throw new Error('current-report share-once consent is required');
  }
  if (consent.consumedAt) throw new Error('share-once consent has already been consumed');
  if (
    consent.reportId !== built.report.reportId ||
    consent.reportSha256 !== built.sha256 ||
    consent.reportHtmlSha256 !== built.reportHtmlSha256 ||
    consent.emailHtmlSha256 !== built.emailHtmlSha256
  ) {
    throw new Error('the report changed after consent; preview it and request consent again');
  }
  return { built, consent, consentPath };
}

function emailSubject(report) {
  return `[agentOW Run Insights] ${report.run.outcome} · ${formatDuration(
    report.run.wallDurationMs
  )} · ${report.metrics.blockerCount} blocker(s)`;
}

function createEml(report, emailHtml, reportHtml, recipient) {
  const boundary = `agentow-${crypto.randomUUID()}`;
  const jsonAttachment = Buffer.from(`${JSON.stringify(report, null, 2)}\n`).toString('base64');
  const htmlAttachment = Buffer.from(reportHtml).toString('base64');
  return [
    `To: ${recipient}`,
    `Subject: ${emailSubject(report)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    emailHtml,
    `--${boundary}`,
    'Content-Type: application/json; name="run-insights.v1.json"',
    'Content-Disposition: attachment; filename="run-insights.v1.json"',
    'Content-Transfer-Encoding: base64',
    '',
    jsonAttachment.match(/.{1,76}/g)?.join('\r\n') ?? jsonAttachment,
    `--${boundary}`,
    'Content-Type: text/html; name="run-insights.html"',
    'Content-Disposition: attachment; filename="run-insights.html"',
    'Content-Transfer-Encoding: base64',
    '',
    htmlAttachment.match(/.{1,76}/g)?.join('\r\n') ?? htmlAttachment,
    `--${boundary}--`,
    ''
  ].join('\r\n');
}

function prepareEmail(sessionDir) {
  const { built, consent } = requireConsent(sessionDir);
  const emailPath = path.join(sessionDir, 'insights', 'run-insights.eml');
  fs.writeFileSync(
    emailPath,
    createEml(built.report, built.emailHtml, built.reportHtml, consent.recipient)
  );
  return { emailPath, recipient: consent.recipient, subject: emailSubject(built.report) };
}

function acquireSendLock(sessionDir) {
  const lockPath = path.join(sessionDir, 'insights', '.send-email.lock');
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  let descriptor;
  try {
    descriptor = fs.openSync(lockPath, 'wx');
    fs.writeFileSync(descriptor, `${JSON.stringify({ pid: process.pid, acquiredAt: now() })}\n`);
  } catch (error) {
    if (error?.code === 'EEXIST') {
      const owner = readJson(lockPath, undefined);
      if (!Number.isInteger(owner?.pid) || owner.pid <= 0) {
        throw new Error(`run-insights send lock has invalid owner data: ${lockPath}`);
      }
      try {
        process.kill(owner.pid, 0);
        throw new Error(`run-insights email send is already in progress for pid ${owner.pid}`);
      } catch (ownerError) {
        if (ownerError?.code !== 'ESRCH') throw ownerError;
      }
      fs.rmSync(lockPath, { force: true });
      return acquireSendLock(sessionDir);
    }
    throw error;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
  return () => fs.rmSync(lockPath, { force: true });
}

export async function sendEmail(sessionDir, options = {}) {
  const releaseLock = acquireSendLock(sessionDir);
  try {
    const { built, consent, consentPath } = requireConsent(sessionDir);
    const attemptPath = path.join(sessionDir, 'insights', 'delivery-attempt.json');
    const priorAttempt = readJson(attemptPath, undefined);
    if (priorAttempt && ['sending', 'accepted', 'completed'].includes(priorAttempt.status)) {
      throw new Error(
        `a prior delivery attempt is ${priorAttempt.status}; inspect the mailbox and ${attemptPath} before retrying`
      );
    }
    const tokenEnvironment = options['token-env'] ?? 'AGENTOW_GRAPH_ACCESS_TOKEN';
    const token = process.env[tokenEnvironment];
    if (!token) throw new Error(`${tokenEnvironment} is required and must contain a Graph Mail.Send token`);
    const attempt = {
      schemaVersion: 1,
      reportId: built.report.reportId,
      reportSha256: built.sha256,
      reportHtmlSha256: built.reportHtmlSha256,
      emailHtmlSha256: built.emailHtmlSha256,
      recipient: consent.recipient,
      transport: 'microsoft-graph-sendmail',
      status: 'sending',
      startedAt: now()
    };
    atomicWriteJson(attemptPath, attempt);
    const response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: {
          subject: emailSubject(built.report),
          body: { contentType: 'HTML', content: built.emailHtml },
          toRecipients: [{ emailAddress: { address: consent.recipient } }],
          attachments: [
            {
              '@odata.type': '#microsoft.graph.fileAttachment',
              name: 'run-insights.v1.json',
              contentType: 'application/json',
              contentBytes: Buffer.from(`${JSON.stringify(built.report, null, 2)}\n`).toString('base64')
            },
            {
              '@odata.type': '#microsoft.graph.fileAttachment',
              name: 'run-insights.html',
              contentType: 'text/html',
              contentBytes: Buffer.from(built.reportHtml).toString('base64')
            }
          ]
        },
        saveToSentItems: true
      })
    });
    if (!response.ok) {
      const detail = redactText(await response.text());
      atomicWriteJson(attemptPath, {
        ...attempt,
        status: 'failed',
        failedAt: now(),
        httpStatus: response.status
      });
      throw new Error(`Graph sendMail failed (${response.status}): ${detail}`);
    }
    const consumedAt = now();
    atomicWriteJson(attemptPath, { ...attempt, status: 'accepted', acceptedAt: consumedAt });
    const receipt = {
      schemaVersion: 1,
      reportId: built.report.reportId,
      reportSha256: built.sha256,
      reportHtmlSha256: built.reportHtmlSha256,
      emailHtmlSha256: built.emailHtmlSha256,
      recipient: consent.recipient,
      transport: 'microsoft-graph-sendmail',
      sentAt: consumedAt
    };
    atomicWriteJson(path.join(sessionDir, 'insights', 'delivery-receipt.json'), receipt);
    atomicWriteJson(consentPath, { ...consent, consumedAt });
    atomicWriteJson(attemptPath, { ...attempt, status: 'completed', acceptedAt: consumedAt });
    return receipt;
  } finally {
    releaseLock();
  }
}

async function main() {
  const { command, sessionDir, options } = parseArgs(process.argv.slice(2));
  if (!command || !sessionDir) {
    console.error(
      'usage: node run-insights.mjs <build|preview|authorize|prepare-email|send-email> <sessionDir> [options]'
    );
    process.exit(2);
  }
  if (command === 'build') {
    const built = buildInsights(sessionDir);
    console.log(
      JSON.stringify({
        jsonPath: built.jsonPath,
        htmlPath: built.htmlPath,
        markdownPath: built.markdownPath
      })
    );
    return;
  }
  if (command === 'preview') {
    const built = buildInsights(sessionDir);
    process.stdout.write(fs.readFileSync(built.htmlPath, 'utf8'));
    return;
  }
  if (command === 'authorize') {
    console.log(JSON.stringify(authorize(sessionDir, options)));
    return;
  }
  if (command === 'prepare-email') {
    console.log(JSON.stringify(prepareEmail(sessionDir)));
    return;
  }
  if (command === 'send-email') {
    console.log(JSON.stringify(await sendEmail(sessionDir, options)));
    return;
  }
  throw new Error(`unsupported command: ${command}`);
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
