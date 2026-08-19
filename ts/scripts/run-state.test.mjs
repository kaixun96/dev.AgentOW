import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const repoRoot = path.resolve(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
const tool = path.join(repoRoot, 'tools', 'run-state.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentow-run-state-'));
const session = path.join(root, '.aero', 'test-run');
const request = path.join(root, 'request.txt');
fs.writeFileSync(request, 'Fix the dialog spacing.\n');

function run(...args) {
  const result = spawnSync(process.execPath, [tool, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function runAsync(...args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tool, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `child exited ${code}`));
    });
  });
}

run('init', session, '--request-file', request, '--run-id', 'test-run');
const initialState = JSON.parse(fs.readFileSync(path.join(session, 'run-state.json')));
assert.equal(initialState.revision, 1);
assert.equal(initialState.schemaVersion, 2);
assert.equal(initialState.timing.summary.currentPhase, 'orient');

initialState.timing.activeSince = new Date(Date.now() - 1_000).toISOString();
fs.writeFileSync(path.join(session, 'run-state.json'), JSON.stringify(initialState));
run('event', session, '--type', 'phase', '--phase', 'planning', '--event-id', 'timing-phase');
const phaseTiming = run('timing', session);
assert.ok(phaseTiming.activeDurationMs >= 900);
assert.ok(phaseTiming.phaseDurationsMs.orient >= 900);
assert.equal(phaseTiming.currentPhase, 'planning');

run('event', session, '--type', 'interruption', '--reason', 'timing check');
const interruptedTimingState = JSON.parse(fs.readFileSync(path.join(session, 'run-state.json')));
interruptedTimingState.interruptionStartedAt = new Date(Date.now() - 2_000).toISOString();
fs.writeFileSync(path.join(session, 'run-state.json'), JSON.stringify(interruptedTimingState));
run('event', session, '--type', 'resume');
const resumedTiming = run('timing', session);
assert.ok(resumedTiming.interruptedDurationMs >= 1_900);
assert.equal(resumedTiming.currentPhase, 'planning');

const screenshot = path.join(session, 'evaluation', 'iter1', 'after.png');
fs.mkdirSync(path.dirname(screenshot), { recursive: true });
fs.writeFileSync(screenshot, Buffer.from('fake-png'));
fs.appendFileSync(path.join(session, 'report.json'), '{"interrupted":');
run('reconcile', session);
run('reconcile', session);

const recovery = fs
  .readFileSync(path.join(session, 'report-recovery.ndjson'), 'utf8')
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line));
assert.equal(
  recovery.filter(
    (record) => record.sender === 'artifact-reconciler' && record.path === 'evaluation/iter1/after.png'
  ).length,
  1
);
assert.equal(fs.readFileSync(path.join(session, 'report.json'), 'utf8').endsWith('{"interrupted":'), true);

const change = path.join(root, 'change.txt');
fs.writeFileSync(change, 'Also keep the footer link aligned.\n');
const revised = run(
  'event',
  session,
  '--type',
  'requirement-change',
  '--message-file',
  change,
  '--event-id',
  'change-1'
);
assert.equal(revised.revision, 2);
assert.equal(
  run(
    'event',
    session,
    '--type',
    'requirement-change',
    '--message-file',
    change,
    '--event-id',
    'change-1'
  ).revision,
  2
);
assert.equal(revised.phase, 'understand');
assert.ok(fs.readdirSync(path.join(session, 'checkpoints')).length > 0);

run('event', session, '--type', 'interruption', '--reason', 'side question');
assert.equal(JSON.parse(fs.readFileSync(path.join(session, 'run-state.json'))).status, 'interrupted');
run('event', session, '--type', 'phase', '--phase', 'evaluation', '--event-id', 'deferred-phase');
assert.equal(JSON.parse(fs.readFileSync(path.join(session, 'run-state.json'))).status, 'interrupted');
run('event', session, '--type', 'resume');
const resumedAfterDeferredPhase = JSON.parse(fs.readFileSync(path.join(session, 'run-state.json')));
assert.equal(resumedAfterDeferredPhase.status, 'active');
assert.equal(resumedAfterDeferredPhase.phase, 'evaluation');
run('complete', session);
assert.equal(JSON.parse(fs.readFileSync(path.join(session, 'run-state.json'))).status, 'completed');
run(
  'event',
  session,
  '--type',
  'interruption',
  '--reason',
  'post-completion question',
  '--event-id',
  'post-interrupt'
);
run('event', session, '--type', 'resume', '--event-id', 'post-resume');
run('event', session, '--type', 'resume', '--event-id', 'post-resume');
assert.equal(JSON.parse(fs.readFileSync(path.join(session, 'run-state.json'))).status, 'completed');
const lateDuplicate = run(
  'event',
  session,
  '--type',
  'requirement-change',
  '--message-file',
  change,
  '--event-id',
  'change-1'
);
assert.equal(lateDuplicate.status, 'completed');
assert.equal(lateDuplicate.revision, 2);
const reopened = run(
  'event',
  session,
  '--type',
  'requirement-change',
  '--message-file',
  change,
  '--event-id',
  '../../change-2'
);
assert.equal(reopened.status, 'active');
assert.equal(reopened.revision, 3);
assert.equal(fs.existsSync(path.join(root, 'change-2')), false);
const retriedReopen = run(
  'event',
  session,
  '--type',
  'requirement-change',
  '--message-file',
  change,
  '--event-id',
  '../../change-2'
);
assert.equal(retriedReopen.revision, 3);

await Promise.all([
  ...Array.from({ length: 6 }, () => runAsync('reconcile', session)),
  runAsync('event', session, '--type', 'phase', '--phase', 'evaluation')
]);
const concurrentState = JSON.parse(fs.readFileSync(path.join(session, 'run-state.json')));
assert.equal(concurrentState.revision, 3);
assert.equal(concurrentState.phase, 'evaluation');
assert.equal(concurrentState.status, 'active');
assert.equal(fs.existsSync(path.join(session, '.run-state.lock')), false);

const deadLock = path.join(session, '.run-state.lock');
fs.mkdirSync(deadLock);
fs.writeFileSync(
  path.join(deadLock, 'owner.json'),
  JSON.stringify({ pid: 2147483647, token: 'dead-owner' })
);
assert.equal(run('unlock', session).unlocked, true);
assert.equal(fs.existsSync(deadLock), false);

const externalRecord = path.join(root, 'evaluator-record.json');
fs.writeFileSync(
  externalRecord,
  JSON.stringify({ sender: 'evaluator', timestamp: '2026-01-01T00:00:00Z', verdict: 'PASS' })
);
run('report', session, '--record-file', externalRecord);
run('report', session, '--record-file', externalRecord);
const recoveryRecords = fs
  .readFileSync(path.join(session, 'report-recovery.ndjson'), 'utf8')
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line));
assert.equal(recoveryRecords.filter((record) => record.sender === 'evaluator').length, 1);

const reorderedSession = path.join(root, '.aero', 'reordered-run');
run('init', reorderedSession, '--request-file', request, '--run-id', 'reordered-run');
const staleChange = path.join(root, 'stale-change.txt');
fs.writeFileSync(staleChange, 'First interrupted change.\n');
fs.appendFileSync(
  path.join(reorderedSession, 'request-history.ndjson'),
  `${JSON.stringify({
    timestamp: '2026-01-01T00:00:00Z',
    revision: 2,
    baseRevision: 1,
    kind: 'requirement-change-intent',
    eventId: 'stale-change',
    sha256: 'stale',
    content: 'First interrupted change.\n'
  })}\n`
);
run(
  'event',
  reorderedSession,
  '--type',
  'requirement-change',
  '--message-file',
  change,
  '--event-id',
  'newer-change'
);
const rebased = run(
  'event',
  reorderedSession,
  '--type',
  'requirement-change',
  '--message-file',
  staleChange,
  '--event-id',
  'stale-change'
);
assert.equal(rebased.revision, 3);
assert.equal(rebased.appliedEventRevisions['newer-change'], 2);
assert.equal(rebased.appliedEventRevisions['stale-change'], 3);
assert.ok(
  fs
    .readdirSync(path.join(reorderedSession, 'checkpoints'))
    .some((name) => name.startsWith('revision-002-'))
);

const repairSession = path.join(root, '.aero', 'repair-init');
fs.mkdirSync(repairSession, { recursive: true });
fs.writeFileSync(
  path.join(repairSession, 'run-state.json'),
  JSON.stringify({
    schemaVersion: 1,
    sessionId: 'repair-init',
    status: 'active',
    phase: 'orient',
    revision: 1,
    createdAt: '2026-01-01T00:00:00Z'
  })
);
run('init', repairSession, '--request-file', request, '--run-id', 'repair-init');
assert.match(fs.readFileSync(path.join(repairSession, 'request-history.ndjson'), 'utf8'), /"initial"/);
assert.match(fs.readFileSync(path.join(repairSession, 'lifecycle.ndjson'), 'utf8'), /"initialized"/);
assert.match(fs.readFileSync(path.join(repairSession, 'progress.log'), 'utf8'), /Durable run initialized/);

run('event', repairSession, '--type', 'phase', '--phase', 'evaluation', '--event-id', 'phase-1');
const filteredReport = fs
  .readFileSync(path.join(repairSession, 'report.json'), 'utf8')
  .split('\n')
  .filter((line) => !line.includes('"eventId":"phase-1"'))
  .join('\n');
fs.writeFileSync(path.join(repairSession, 'report.json'), filteredReport);
fs.writeFileSync(
  path.join(repairSession, 'progress.log'),
  fs
    .readFileSync(path.join(repairSession, 'progress.log'), 'utf8')
    .split('\n')
    .filter((line) => !line.includes('[event:phase-1]'))
    .join('\n')
);
run('event', repairSession, '--type', 'phase', '--phase', 'evaluation', '--event-id', 'phase-1');
assert.match(fs.readFileSync(path.join(repairSession, 'report.json'), 'utf8'), /"eventId":"phase-1"/);
assert.match(fs.readFileSync(path.join(repairSession, 'progress.log'), 'utf8'), /\[event:phase-1\]/);

run('complete', repairSession);
const completedBeforeLatePhase = JSON.parse(
  fs.readFileSync(path.join(repairSession, 'run-state.json'))
);
run('event', repairSession, '--type', 'phase', '--phase', 'review', '--event-id', 'late-phase');
const completedAfterLatePhase = JSON.parse(
  fs.readFileSync(path.join(repairSession, 'run-state.json'))
);
assert.equal(completedAfterLatePhase.status, 'completed');
assert.equal(completedAfterLatePhase.phase, 'complete');
assert.equal(completedAfterLatePhase.revision, completedBeforeLatePhase.revision);

for (const fileName of ['run-state.mjs', 'progress-watcher.mjs']) {
  assert.equal(
    fs.readFileSync(path.join(repoRoot, 'tools', fileName), 'utf8'),
    fs.readFileSync(path.join(repoRoot, 'copilot', 'tools', fileName), 'utf8'),
    `${fileName} Copilot mirror is stale`
  );
}

fs.rmSync(root, { recursive: true, force: true });
console.log('run state fixtures passed');
