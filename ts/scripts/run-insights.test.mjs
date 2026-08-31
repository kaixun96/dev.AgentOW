import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { sendEmail } from '../../tools/run-insights.mjs';

const repoRoot = path.resolve(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
const runStateTool = path.join(repoRoot, 'tools', 'run-state.mjs');
const insightsTool = path.join(repoRoot, 'tools', 'run-insights.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentow-run-insights-'));
const session = path.join(root, '.aero', 'mock-run');
const requestFile = path.join(root, 'request.txt');
fs.writeFileSync(requestFile, 'Private request text that must never appear in insights.\n');

function run(tool, ...args) {
  const result = spawnSync(process.execPath, [tool, ...args], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `command failed: ${args.join(' ')}`);
  }
  return result.stdout.trim();
}

function runFailure(tool, ...args) {
  const result = spawnSync(process.execPath, [tool, ...args], { encoding: 'utf8' });
  assert.notEqual(result.status, 0, `command unexpectedly succeeded: ${args.join(' ')}`);
  return `${result.stdout}\n${result.stderr}`;
}

run(runStateTool, 'init', session, '--request-file', requestFile, '--run-id', 'private-session');
assert.match(
  runFailure(
    runStateTool,
    'event',
    session,
    '--type',
    'blocker-resolved',
    '--blocker-id',
    'auth-1',
    '--resolution',
    'renewed',
    '--resolution-kind',
    'credential-refresh'
  ),
  /has not been opened/
);
assert.match(
  runFailure(
    runStateTool,
    'event',
    session,
    '--type',
    'blocker-opened',
    '--blocker-id',
    'bad-category',
    '--category',
    'mystery',
    '--summary',
    'bad'
  ),
  /unsupported blocker category/
);
assert.match(
  runFailure(
    runStateTool,
    'event',
    session,
    '--type',
    'blocker-opened',
    '--blocker-id',
    'missing-human-flag',
    '--category',
    'auth',
    '--summary',
    'missing flag'
  ),
  /--human-intervention is required/
);

run(
  runStateTool,
  'event',
  session,
  '--type',
  'phase',
  '--phase',
  'evaluation',
  '--event-id',
  'phase-evaluation-1'
);
run(
  runStateTool,
  'event',
  session,
  '--type',
  'blocker-opened',
  '--blocker-id',
  'auth-1',
  '--category',
  'auth',
  '--summary',
  'FIC token=top-secret failed for kai@example.com at https://tenant.example/path from C:\\private\\file.txt',
  '--human-intervention',
  'false',
  '--event-id',
  'blocker-auth-open'
);
assert.match(
  runFailure(
    runStateTool,
    'event',
    session,
    '--type',
    'blocker-opened',
    '--blocker-id',
    'auth-1',
    '--category',
    'auth',
    '--summary',
    'duplicate',
    '--event-id',
    'blocker-auth-open-again'
  ),
  /already recorded/
);
assert.match(
  runFailure(
    runStateTool,
    'event',
    session,
    '--type',
    'blocker-attempted',
    '--blocker-id',
    'auth-1',
    '--strategy',
    'retry cached credential',
    '--strategy-kind',
    'cached-credential-retry',
    '--outcome',
    'failed'
  ),
  /--automated is required/
);
for (const [eventId, strategy, strategyKind, outcome] of [
  ['blocker-auth-attempt-1', 'retry cached credential', 'cached-credential-retry', 'failed'],
  ['blocker-auth-attempt-2', 'refresh delegated credential', 'credential-refresh', 'succeeded']
]) {
  run(
    runStateTool,
    'event',
    session,
    '--type',
    'blocker-attempted',
    '--blocker-id',
    'auth-1',
    '--strategy',
    strategy,
    '--strategy-kind',
    strategyKind,
    '--outcome',
    outcome,
    '--automated',
    'true',
    '--event-id',
    eventId
  );
}
assert.match(
  runFailure(
    runStateTool,
    'event',
    session,
    '--type',
    'blocker-resolved',
    '--blocker-id',
    'auth-1',
    '--resolution',
    'missing automation classification',
    '--resolution-kind',
    'credential-refresh'
  ),
  /--automated is required/
);
run(
  runStateTool,
  'event',
  session,
  '--type',
  'blocker-resolved',
  '--blocker-id',
  'auth-1',
  '--resolution',
  'Refreshed token=another-secret through /home/user/private-script',
  '--resolution-kind',
  'credential-refresh',
  '--automated',
  'true',
  '--event-id',
  'blocker-auth-resolved'
);
assert.match(
  runFailure(
    runStateTool,
    'event',
    session,
    '--type',
    'blocker-resolved',
    '--blocker-id',
    'auth-1',
    '--resolution',
    'duplicate terminal',
    '--resolution-kind',
    'credential-refresh'
  ),
  /already blocker-resolved/
);

const lifecyclePath = path.join(session, 'lifecycle.ndjson');
const fixedTimes = {
  'blocker-auth-open': '2026-08-31T01:30:00.000Z',
  'blocker-auth-attempt-1': '2026-08-31T01:35:00.000Z',
  'blocker-auth-attempt-2': '2026-08-31T01:42:00.000Z',
  'blocker-auth-resolved': '2026-08-31T01:45:00.000Z'
};
const lifecycle = fs
  .readFileSync(lifecyclePath, 'utf8')
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line))
  .map((record) => ({ ...record, timestamp: fixedTimes[record.eventId] ?? record.timestamp }));
fs.writeFileSync(lifecyclePath, `${lifecycle.map((record) => JSON.stringify(record)).join('\n')}\n`);

const statePath = path.join(session, 'run-state.json');
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
state.status = 'completed';
state.phase = 'complete';
state.revision = 2;
state.timing = {
  startedAt: '2026-08-31T01:00:00.000Z',
  completedAt: '2026-08-31T03:20:00.000Z',
  settledActiveDurationMs: 7_200_000,
  settledInterruptedDurationMs: 1_200_000,
  phaseDurationsMs: {
    planning: 900_000,
    implementation: 2_700_000,
    evaluation: 2_400_000,
    review: 1_200_000
  },
  summary: {
    generatedAt: '2026-08-31T03:20:00.000Z',
    wallDurationMs: 8_400_000,
    activeDurationMs: 7_200_000,
    interruptedDurationMs: 1_200_000,
    currentPhase: 'complete',
    currentPhaseDurationMs: 0,
    phaseDurationsMs: {
      planning: 900_000,
      implementation: 2_700_000,
      evaluation: 2_400_000,
      review: 1_200_000
    }
  }
};
fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
fs.writeFileSync(
  path.join(session, 'final.md'),
  'Final status: success\nDraft PR: https://dev.azure.com/example/pullrequest/123456\n'
);

run(insightsTool, 'build', session);
const reportPath = path.join(session, 'insights', 'run-insights.v1.json');
const markdownPath = path.join(session, 'insights', 'run-insights.md');
const htmlPath = path.join(session, 'insights', 'run-insights.html');
const reportText = fs.readFileSync(reportPath, 'utf8');
const report = JSON.parse(reportText);
const initialGeneratedAt = report.generatedAt;
assert.equal(report.run.outcome, 'completed');
assert.equal(report.run.draftPrCreated, true);
assert.equal(report.blockers.length, 1);
assert.equal(report.blockers[0].durationMs, 900_000);
assert.equal(report.blockers[0].attemptCount, 2);
assert.equal(report.blockers[0].attempts[1].outcome, 'succeeded');
assert.equal(report.blockers[0].automatedResolution, true);
assert.equal(report.run.agentowVersion, '0.1.41');
assert.equal(report.metrics.evaluationCycles, 1);
assert.equal(report.privacy.containsPromptText, false);
for (const forbidden of [
  'Private request text',
  'top-secret',
  'another-secret',
  'kai@example.com',
  'tenant.example',
  'C:\\private',
  '/home/user'
]) {
  assert.equal(reportText.includes(forbidden), false, `report leaked ${forbidden}`);
}
assert.equal(report.privacy.containsFreeText, false);
assert.equal(report.blockers[0].summary, 'auth blocker in evaluation');
assert.equal(report.blockers[0].resolution, 'Resolved through credential-refresh');
assert.match(fs.readFileSync(markdownPath, 'utf8'), /AgentOW Run Insights/);
assert.match(fs.readFileSync(markdownPath, 'utf8'), /credential-refresh/);
const htmlText = fs.readFileSync(htmlPath, 'utf8');
assert.match(htmlText, /<!doctype html>/);
assert.match(htmlText, /Phase timing/);
assert.match(htmlText, /Blocker journey/);
assert.match(htmlText, /width:37\.5%/);
assert.match(htmlText, /width:33\.3%/);
assert.match(htmlText, /credential-refresh/);
assert.equal(htmlText.includes('top-secret'), false);
run(insightsTool, 'build', session);
assert.equal(JSON.parse(fs.readFileSync(reportPath)).generatedAt, initialGeneratedAt);

assert.match(runFailure(insightsTool, 'prepare-email', session), /share-once consent is required/);
const responseFile = path.join(root, 'response.txt');
fs.writeFileSync(responseFile, 'No');
assert.match(
  runFailure(
    insightsTool,
    'authorize',
    session,
    '--decision',
    'share-once',
    '--response-file',
    responseFile,
    '--recipient',
    'maintainer@example.invalid'
  ),
  /exact direct user response/
);
fs.writeFileSync(responseFile, 'SHARE RUN INSIGHTS ONCE');
run(
  insightsTool,
  'authorize',
  session,
  '--decision',
  'share-once',
  '--response-file',
  responseFile,
  '--recipient',
  'maintainer@example.invalid'
);
run(insightsTool, 'prepare-email', session);
const emlText = fs.readFileSync(path.join(session, 'insights', 'run-insights.eml'), 'utf8');
assert.match(emlText, /To: maintainer@example\.invalid/);
assert.match(emlText, /run-insights\.v1\.json/);
assert.match(emlText, /run-insights\.html/);
assert.match(emlText, /Content-Type: text\/html/);
assert.match(emlText, /Blockers/);
assert.equal(emlText.includes('top-secret'), false);
const consentPath = path.join(session, 'insights', 'consent.json');
const consentBeforeTemplateCheck = JSON.parse(fs.readFileSync(consentPath));
fs.writeFileSync(
  consentPath,
  JSON.stringify({ ...consentBeforeTemplateCheck, reportHtmlSha256: 'stale-template-digest' })
);
assert.match(
  runFailure(insightsTool, 'prepare-email', session),
  /report changed after consent/
);
fs.writeFileSync(consentPath, JSON.stringify(consentBeforeTemplateCheck));
state.timing.summary.phaseDurationsMs.evaluation += 1_000;
fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
assert.match(
  runFailure(insightsTool, 'prepare-email', session),
  /report changed after consent/
);
assert.notEqual(JSON.parse(fs.readFileSync(reportPath)).generatedAt, initialGeneratedAt);

run(
  insightsTool,
  'authorize',
  session,
  '--decision',
  'share-once',
  '--response-file',
  responseFile,
  '--recipient',
  'maintainer@example.invalid'
);
const originalFetch = globalThis.fetch;
process.env.AGENTOW_GRAPH_ACCESS_TOKEN = 'test-token';
try {
  globalThis.fetch = async () => new Response('temporary transport failure', { status: 503 });
  await assert.rejects(() => sendEmail(session), /Graph sendMail failed \(503\)/);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(session, 'insights', 'delivery-attempt.json'))).status,
    'failed'
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(session, 'insights', 'consent.json'))).consumedAt,
    undefined
  );
  const attemptPath = path.join(session, 'insights', 'delivery-attempt.json');
  const failedAttempt = JSON.parse(fs.readFileSync(attemptPath));
  fs.writeFileSync(attemptPath, JSON.stringify({ ...failedAttempt, status: 'accepted' }));
  await assert.rejects(() => sendEmail(session), /prior delivery attempt is accepted/);
  fs.writeFileSync(attemptPath, JSON.stringify({ ...failedAttempt, status: 'failed' }));

  let releaseSend;
  globalThis.fetch = async (_url, request) => {
    const payload = JSON.parse(request.body);
    assert.equal(payload.message.toRecipients[0].emailAddress.address, 'maintainer@example.invalid');
    assert.equal(payload.message.body.content.includes('top-secret'), false);
    assert.equal(payload.message.body.content.includes('MUTATED BODY'), false);
    assert.equal(payload.message.body.contentType, 'HTML');
    assert.match(payload.message.body.content, /Blockers/);
    assert.equal(payload.message.body.content.includes('display:grid'), false);
    assert.equal(payload.message.attachments.length, 2);
    assert.equal(payload.message.attachments[1].name, 'run-insights.html');
    return new Promise((resolve) => {
      releaseSend = () => resolve(new Response(null, { status: 202 }));
    });
  };
  fs.writeFileSync(htmlPath, 'MUTATED BODY\n');
  const firstSend = sendEmail(session);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await assert.rejects(() => sendEmail(session), /already in progress/);
  releaseSend();
  const receipt = await firstSend;
  assert.equal(receipt.transport, 'microsoft-graph-sendmail');
  assert.ok(
    JSON.parse(fs.readFileSync(path.join(session, 'insights', 'consent.json'))).consumedAt
  );
  await assert.rejects(() => sendEmail(session), /already been consumed/);
} finally {
  globalThis.fetch = originalFetch;
  delete process.env.AGENTOW_GRAPH_ACCESS_TOKEN;
}

const staleLockSession = path.join(root, '.aero', 'stale-lock-run');
fs.cpSync(session, staleLockSession, { recursive: true });
const staleConsentPath = path.join(staleLockSession, 'insights', 'consent.json');
const staleConsent = JSON.parse(fs.readFileSync(staleConsentPath));
delete staleConsent.consumedAt;
fs.writeFileSync(staleConsentPath, JSON.stringify(staleConsent));
const staleAttemptPath = path.join(staleLockSession, 'insights', 'delivery-attempt.json');
fs.writeFileSync(staleAttemptPath, JSON.stringify({ status: 'failed' }));
const staleLockPath = path.join(staleLockSession, 'insights', '.send-email.lock');
fs.writeFileSync(staleLockPath, JSON.stringify({ pid: 2147483647, acquiredAt: new Date().toISOString() }));
process.env.AGENTOW_GRAPH_ACCESS_TOKEN = 'test-token';
globalThis.fetch = async () => new Response(null, { status: 202 });
try {
  const staleReceipt = await sendEmail(staleLockSession);
  assert.equal(staleReceipt.transport, 'microsoft-graph-sendmail');
  assert.equal(fs.existsSync(staleLockPath), false);
} finally {
  globalThis.fetch = originalFetch;
  delete process.env.AGENTOW_GRAPH_ACCESS_TOKEN;
}

console.log(`run insights fixtures passed; mock report: ${htmlPath}`);
