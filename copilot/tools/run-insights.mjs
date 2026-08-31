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
  return { report, jsonPath, markdownPath, sha256: sha256(fs.readFileSync(jsonPath)) };
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
  if (consent.reportId !== built.report.reportId || consent.reportSha256 !== built.sha256) {
    throw new Error('the report changed after consent; preview it and request consent again');
  }
  return { built, consent, consentPath };
}

function emailSubject(report) {
  return `[agentOW Run Insights] ${report.run.outcome} · ${formatDuration(
    report.run.wallDurationMs
  )} · ${report.metrics.blockerCount} blocker(s)`;
}

function createEml(report, markdown, recipient) {
  const boundary = `agentow-${crypto.randomUUID()}`;
  const attachment = Buffer.from(`${JSON.stringify(report, null, 2)}\n`).toString('base64');
  return [
    `To: ${recipient}`,
    `Subject: ${emailSubject(report)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    markdown,
    `--${boundary}`,
    'Content-Type: application/json; name="run-insights.v1.json"',
    'Content-Disposition: attachment; filename="run-insights.v1.json"',
    'Content-Transfer-Encoding: base64',
    '',
    attachment.match(/.{1,76}/g)?.join('\r\n') ?? attachment,
    `--${boundary}--`,
    ''
  ].join('\r\n');
}

function prepareEmail(sessionDir) {
  const { built, consent } = requireConsent(sessionDir);
  const markdown = renderMarkdown(built.report);
  const emailPath = path.join(sessionDir, 'insights', 'run-insights.eml');
  fs.writeFileSync(emailPath, createEml(built.report, markdown, consent.recipient));
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
    const markdown = renderMarkdown(built.report);
    const attempt = {
      schemaVersion: 1,
      reportId: built.report.reportId,
      reportSha256: built.sha256,
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
          body: { contentType: 'Text', content: markdown },
          toRecipients: [{ emailAddress: { address: consent.recipient } }],
          attachments: [
            {
              '@odata.type': '#microsoft.graph.fileAttachment',
              name: 'run-insights.v1.json',
              contentType: 'application/json',
              contentBytes: Buffer.from(`${JSON.stringify(built.report, null, 2)}\n`).toString('base64')
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
    console.log(JSON.stringify({ jsonPath: built.jsonPath, markdownPath: built.markdownPath }));
    return;
  }
  if (command === 'preview') {
    const built = buildInsights(sessionDir);
    process.stdout.write(fs.readFileSync(built.markdownPath, 'utf8'));
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
