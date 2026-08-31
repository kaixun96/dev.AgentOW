#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BOOKKEEPING_FILES = new Set([
  '.progress-watcher.out',
  '.progress-watcher.state.json',
  'artifact-index.json',
  'lifecycle.ndjson',
  'progress.log',
  'report.json',
  'report-recovery.ndjson',
  'request-history.ndjson',
  'run-state.json'
]);
const LOCK_TIMEOUT_MS = 60_000;
const BLOCKER_EVENT_TYPES = new Set([
  'blocker-opened',
  'blocker-attempted',
  'blocker-resolved',
  'blocker-abandoned'
]);
const BLOCKER_CATEGORIES = new Set([
  'auth',
  'build',
  'dependency',
  'environment',
  'evaluation',
  'network',
  'requirements',
  'review',
  'source',
  'test',
  'tooling',
  'other'
]);
const BLOCKER_ATTEMPT_OUTCOMES = new Set(['failed', 'succeeded', 'partial', 'blocked', 'no-change']);

function now() {
  return new Date().toISOString();
}

function clock() {
  return new Date().toTimeString().slice(0, 8);
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

function validateExecutionProfile(profile) {
  if (profile && !['standard', 'poc'].includes(profile)) {
    throw new Error(`unsupported execution profile: ${profile}`);
  }
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

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function withSessionLock(sessionDir, operation) {
  fs.mkdirSync(sessionDir, { recursive: true });
  const lockDir = path.join(sessionDir, '.run-state.lock');
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  const lockToken = crypto.randomUUID();
  let acquired = false;
  while (true) {
    try {
      fs.mkdirSync(lockDir);
      acquired = true;
      fs.writeFileSync(
        path.join(lockDir, 'owner.json'),
        `${JSON.stringify({ pid: process.pid, token: lockToken, acquiredAt: now() })}\n`
      );
      break;
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        if (acquired) fs.rmSync(lockDir, { recursive: true, force: true });
        throw error;
      }
      if (Date.now() >= deadline) {
        const owner = readJson(path.join(lockDir, 'owner.json'), undefined);
        throw new Error(
          `timed out waiting for durable run lock: ${lockDir}; ` +
            `owner=${owner ? JSON.stringify(owner) : 'unknown'}. ` +
            `Do not delete a live lock; inspect the owner process first.`
        );
      }
      sleep(50);
    }
  }
  try {
    return operation();
  } finally {
    if (acquired) {
      const owner = readJson(path.join(lockDir, 'owner.json'), undefined);
      if (owner?.token === lockToken) fs.rmSync(lockDir, { recursive: true, force: true });
    }
  }
}

function unlockDeadSession(sessionDir) {
  const lockDir = path.join(sessionDir, '.run-state.lock');
  const unlockDir = path.join(sessionDir, '.run-state.unlock');
  fs.mkdirSync(unlockDir);
  try {
    if (!fs.existsSync(lockDir)) return { unlocked: false, reason: 'no-lock' };
    const owner = readJson(path.join(lockDir, 'owner.json'), undefined);
    if (owner?.pid) {
      try {
        process.kill(owner.pid, 0);
        throw new Error(`refusing to unlock live owner pid ${owner.pid}`);
      } catch (error) {
        if (error?.code !== 'ESRCH') throw error;
      }
    } else {
      const age = Date.now() - fs.statSync(lockDir).mtimeMs;
      if (age < LOCK_TIMEOUT_MS) {
        throw new Error(`refusing to unlock an ownerless lock younger than ${LOCK_TIMEOUT_MS}ms`);
      }
    }
    fs.rmSync(lockDir, { recursive: true, force: true });
    return { unlocked: true, owner };
  } finally {
    fs.rmSync(unlockDir, { recursive: true, force: true });
  }
}

function appendJsonLine(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  let prefix = '';
  if (fs.existsSync(filePath)) {
    const stat = fs.statSync(filePath);
    if (stat.size > 0) {
      const descriptor = fs.openSync(filePath, 'r');
      const lastByte = Buffer.alloc(1);
      fs.readSync(descriptor, lastByte, 0, 1, stat.size - 1);
      fs.closeSync(descriptor);
      if (lastByte[0] !== 10) prefix = '\n';
    }
  }
  fs.appendFileSync(filePath, `${prefix}${JSON.stringify(value)}\n`);
}

function appendProgress(sessionDir, message, marker) {
  const suffix = marker ? ` [${marker}]` : '';
  fs.appendFileSync(path.join(sessionDir, 'progress.log'), `[${clock()}] ${message}${suffix}\n`);
}

function elapsedMs(start, end) {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;
  return Math.max(0, endMs - startMs);
}

function ensureTimingState(state, timestamp = now()) {
  const startedAt = state.timing?.startedAt ?? state.createdAt ?? timestamp;
  state.timing = {
    startedAt,
    settledActiveDurationMs: state.timing?.settledActiveDurationMs ?? 0,
    settledInterruptedDurationMs: state.timing?.settledInterruptedDurationMs ?? 0,
    phaseDurationsMs: state.timing?.phaseDurationsMs ?? {},
    activeSince:
      state.timing?.activeSince ??
      (state.status === 'active' ? state.updatedAt ?? startedAt : undefined),
    activePhase: state.timing?.activePhase ?? (state.status === 'active' ? state.phase : undefined),
    completedAt: state.timing?.completedAt,
    summary: state.timing?.summary
  };
  return state.timing;
}

function settleActiveTiming(state, timestamp) {
  const timing = ensureTimingState(state, timestamp);
  if (!timing.activeSince) return;
  const duration = elapsedMs(timing.activeSince, timestamp);
  const phase = timing.activePhase ?? state.phase ?? 'unknown';
  timing.settledActiveDurationMs += duration;
  timing.phaseDurationsMs[phase] = (timing.phaseDurationsMs[phase] ?? 0) + duration;
  delete timing.activeSince;
  delete timing.activePhase;
}

function startActiveTiming(state, timestamp) {
  const timing = ensureTimingState(state, timestamp);
  timing.activeSince = timestamp;
  timing.activePhase = state.phase;
}

function settleInterruptionTiming(state, interruptionStartedAt, timestamp) {
  if (!interruptionStartedAt) return;
  const timing = ensureTimingState(state, timestamp);
  timing.settledInterruptedDurationMs += elapsedMs(interruptionStartedAt, timestamp);
}

function refreshTimingSummary(state, timestamp = now()) {
  const timing = ensureTimingState(state, timestamp);
  const referenceTime = timing.completedAt ?? timestamp;
  const liveActiveDurationMs = timing.activeSince
    ? elapsedMs(timing.activeSince, referenceTime)
    : 0;
  const phaseDurationsMs = { ...timing.phaseDurationsMs };
  if (timing.activeSince) {
    const phase = timing.activePhase ?? state.phase ?? 'unknown';
    phaseDurationsMs[phase] = (phaseDurationsMs[phase] ?? 0) + liveActiveDurationMs;
  }
  const liveInterruptedDurationMs =
    state.status === 'interrupted' && state.interruptionStartedAt
      ? elapsedMs(state.interruptionStartedAt, referenceTime)
      : 0;
  timing.summary = {
    generatedAt: timestamp,
    wallDurationMs: elapsedMs(timing.startedAt, referenceTime),
    activeDurationMs: timing.settledActiveDurationMs + liveActiveDurationMs,
    interruptedDurationMs: timing.settledInterruptedDurationMs + liveInterruptedDurationMs,
    currentPhase: state.phase,
    currentPhaseDurationMs: phaseDurationsMs[state.phase] ?? 0,
    phaseDurationsMs
  };
  return timing.summary;
}

function formatDuration(durationMs) {
  const totalSeconds = Math.round(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatTimingSummary(summary) {
  const phases = Object.entries(summary.phaseDurationsMs)
    .filter(([, duration]) => duration > 0)
    .map(([phase, duration]) => `${phase}=${formatDuration(duration)}`)
    .join(', ');
  return (
    `wall ${formatDuration(summary.wallDurationMs)}, ` +
    `active ${formatDuration(summary.activeDurationMs)}, ` +
    `interrupted ${formatDuration(summary.interruptedDurationMs)}` +
    (phases ? `; phases: ${phases}` : '')
  );
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const descriptor = fs.openSync(filePath, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest('hex');
}

function classifyArtifact(relativePath) {
  const normalized = relativePath.replaceAll('\\', '/');
  if (/^evaluation\/.*\.png$/i.test(normalized)) return 'screenshot';
  if (/^evaluation\//.test(normalized)) return 'evaluation';
  if (/^implementation\//.test(normalized)) return 'implementation';
  if (/^planning\//.test(normalized) || normalized === 'plan.md') return 'planning';
  if (/^context\//.test(normalized)) return 'context';
  if (/^review\.(md|json)$/.test(normalized)) return 'review';
  if (normalized === 'final.md') return 'final';
  if (normalized === 'capabilities.json') return 'capability';
  if (/\.log$/i.test(normalized)) return 'log';
  return 'artifact';
}

function shouldIndex(relativePath) {
  const normalized = relativePath.replaceAll('\\', '/');
  const baseName = path.basename(normalized);
  if (BOOKKEEPING_FILES.has(baseName)) return false;
  if (normalized.startsWith('checkpoints/')) return false;
  if (/\.log$/i.test(normalized)) return false;
  return (
    normalized === 'plan.md' ||
    normalized === 'final.md' ||
    normalized === 'review.md' ||
    normalized === 'review.json' ||
    normalized === 'report-fragments.ndjson' ||
    normalized === 'capabilities.json' ||
    /^(planning|implementation|evaluation|context)\//.test(normalized)
  );
}

function walkFiles(rootDir, currentDir = rootDir, result = []) {
  if (!fs.existsSync(currentDir)) return result;
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (entry.name === '.run-state.lock') continue;
      walkFiles(rootDir, fullPath, result);
      continue;
    }
    if (!entry.isFile()) continue;
    const relativePath = path.relative(rootDir, fullPath).replaceAll('\\', '/');
    if (shouldIndex(relativePath)) result.push({ fullPath, relativePath });
  }
  return result;
}

function inspectReport(reportPath) {
  const ids = new Set();
  const recordIds = new Set();
  if (!fs.existsSync(reportPath)) return { ids, recordIds, canAppend: true };
  const text = fs.readFileSync(reportPath, 'utf8');
  const lines = text.split('\n');
  const trailingFragment = lines.pop() ?? '';
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line);
      if (record.sender === 'artifact-reconciler' && record.artifactId) ids.add(record.artifactId);
      if (record.recordId) recordIds.add(record.recordId);
    } catch {
      // A partial final NDJSON line is left for the writer to finish.
    }
  }
  if (!trailingFragment.trim()) return { ids, recordIds, canAppend: true };
  try {
    const record = JSON.parse(trailingFragment);
    if (record.sender === 'artifact-reconciler' && record.artifactId) ids.add(record.artifactId);
    if (record.recordId) recordIds.add(record.recordId);
    return { ids, recordIds, canAppend: true };
  } catch {
    return { ids, recordIds, canAppend: false };
  }
}

function inspectRecovery(recoveryPath) {
  const ids = new Set();
  const recordIds = new Set();
  if (!fs.existsSync(recoveryPath)) return { ids, recordIds };
  for (const line of fs.readFileSync(recoveryPath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line);
      if (record.sender === 'artifact-reconciler' && record.artifactId) ids.add(record.artifactId);
      if (record.recordId) recordIds.add(record.recordId);
    } catch {
      // Recovery journal is written only by this locked tool; preserve malformed evidence.
    }
  }
  return { ids, recordIds };
}

function appendReportRecord(sessionDir, record) {
  const reportPath = path.join(sessionDir, 'report.json');
  const recoveryPath = path.join(sessionDir, 'report-recovery.ndjson');
  const normalized = {
    ...record,
    recordId: record.recordId ?? sha256Text(JSON.stringify(record))
  };
  const report = inspectReport(reportPath);
  const recovery = inspectRecovery(recoveryPath);
  if (report.recordIds.has(normalized.recordId) || recovery.recordIds.has(normalized.recordId)) {
    return normalized;
  }
  if (report.canAppend) {
    appendJsonLine(reportPath, normalized);
  } else {
    appendJsonLine(recoveryPath, normalized);
  }
  return normalized;
}

function progressMarkers(progressPath) {
  if (!fs.existsSync(progressPath)) return new Set();
  const markers = new Set();
  const expression = /\[artifact:([a-f0-9]{64})\]/g;
  const text = fs.readFileSync(progressPath, 'utf8');
  for (const match of text.matchAll(expression)) markers.add(match[1]);
  return markers;
}

function reconcileSessionUnlocked(sessionDir) {
  const statePath = path.join(sessionDir, 'run-state.json');
  const reportPath = path.join(sessionDir, 'report.json');
  const recoveryPath = path.join(sessionDir, 'report-recovery.ndjson');
  const progressPath = path.join(sessionDir, 'progress.log');
  const state = readJson(statePath, {
    schemaVersion: 1,
    sessionId: path.basename(sessionDir),
    status: 'active',
    phase: 'unknown',
    revision: 1,
    createdAt: now()
  });
  const reportInspection = inspectReport(reportPath);
  const reported = reportInspection.ids;
  const recovered = inspectRecovery(recoveryPath).ids;
  const logged = progressMarkers(progressPath);
  const artifacts = [];
  let newReportRecords = 0;
  let newProgressRecords = 0;

  for (const { fullPath, relativePath } of walkFiles(sessionDir)) {
    let stat;
    let sha256;
    try {
      const before = fs.statSync(fullPath);
      sha256 = sha256File(fullPath);
      stat = fs.statSync(fullPath);
      if (before.size !== stat.size || before.mtimeMs !== stat.mtimeMs) continue;
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    const artifactId = sha256Text(`${relativePath}\0${sha256}`);
    const artifact = {
      artifactId,
      path: relativePath,
      kind: classifyArtifact(relativePath),
      size: stat.size,
      mtime: stat.mtime.toISOString(),
      sha256
    };
    artifacts.push(artifact);

    const artifactRecord = {
      sender: 'artifact-reconciler',
      timestamp: now(),
      status: 'discovered',
      revision: state.revision,
      recordId: `artifact:${artifactId}`,
      ...artifact
    };
    if (!reportInspection.canAppend && artifact.kind !== 'log' && !recovered.has(artifactId)) {
      appendJsonLine(recoveryPath, artifactRecord);
      newReportRecords += 1;
    }
    if (reportInspection.canAppend && artifact.kind !== 'log' && !reported.has(artifactId)) {
      appendJsonLine(reportPath, artifactRecord);
      newReportRecords += 1;
    }
    if (artifact.kind !== 'log' && !logged.has(artifactId)) {
      const icon = artifact.kind === 'screenshot' ? '📸' : '📦';
      appendProgress(sessionDir, `${icon} Artifact reconciled — ${relativePath}`, `artifact:${artifactId}`);
      newProgressRecords += 1;
    }
  }

  artifacts.sort((left, right) => left.path.localeCompare(right.path));
  const index = { schemaVersion: 1, generatedAt: now(), revision: state.revision, artifacts };
  atomicWriteJson(path.join(sessionDir, 'artifact-index.json'), index);
  state.updatedAt = now();
  state.lastReconciledAt = state.updatedAt;
  state.artifactCounts = Object.fromEntries(
    [...new Set(artifacts.map((artifact) => artifact.kind))].map((kind) => [
      kind,
      artifacts.filter((artifact) => artifact.kind === kind).length
    ])
  );
  refreshTimingSummary(state);
  atomicWriteJson(statePath, state);
  return { state, index, newReportRecords, newProgressRecords };
}

export function reconcileSession(sessionDir) {
  return withSessionLock(sessionDir, () => reconcileSessionUnlocked(sessionDir));
}

function appendLifecycle(sessionDir, state, type, details = {}) {
  const record = {
    sender: 'run-lifecycle',
    timestamp: now(),
    status: type,
    revision: state.revision,
    phase: state.phase,
    ...details
  };
  appendJsonLine(path.join(sessionDir, 'lifecycle.ndjson'), record);
  appendReportRecord(sessionDir, record);
}

function appendExternalReportRecord(sessionDir, recordFile) {
  const record = JSON.parse(fs.readFileSync(path.resolve(recordFile), 'utf8'));
  if (!record || Array.isArray(record) || typeof record !== 'object') {
    throw new Error('report record must be a JSON object');
  }
  return appendReportRecord(sessionDir, record);
}

function findLifecycleEvent(sessionDir, eventId, status) {
  const lifecyclePath = path.join(sessionDir, 'lifecycle.ndjson');
  if (!fs.existsSync(lifecyclePath)) return undefined;
  for (const line of fs.readFileSync(lifecyclePath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line);
      if (record.eventId === eventId && record.status === status) return record;
    } catch {
      // Preserve malformed evidence; a later event remains independently parseable.
    }
  }
  return undefined;
}

function lifecycleHasEvent(sessionDir, eventId, status) {
  return Boolean(findLifecycleEvent(sessionDir, eventId, status));
}

function latestLifecycleEvent(sessionDir, status, since) {
  const lifecyclePath = path.join(sessionDir, 'lifecycle.ndjson');
  if (!fs.existsSync(lifecyclePath)) return undefined;
  let latest;
  for (const line of fs.readFileSync(lifecyclePath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line);
      if (record.status !== status || (since && record.timestamp < since)) continue;
      if (!latest || record.timestamp >= latest.timestamp) latest = record;
    } catch {
      // Preserve malformed evidence; later complete events remain usable.
    }
  }
  return latest;
}

function blockerLifecycle(sessionDir, blockerId) {
  const lifecyclePath = path.join(sessionDir, 'lifecycle.ndjson');
  if (!fs.existsSync(lifecyclePath)) return [];
  const events = [];
  for (const line of fs.readFileSync(lifecyclePath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line);
      if (record.blockerId === blockerId && BLOCKER_EVENT_TYPES.has(record.status)) {
        events.push(record);
      }
    } catch {
      // Preserve malformed evidence; complete blocker events remain independently parseable.
    }
  }
  return events;
}

function requiredOption(options, name, eventType) {
  const value = options[name];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`--${name} is required for ${eventType}`);
  }
  return value.trim();
}

function parseBooleanOption(value, name) {
  if (value === undefined) return undefined;
  if (value === true || value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`--${name} must be true or false`);
}

function blockerEventDetails(sessionDir, state, type, options) {
  if (state.status !== 'active') {
    throw new Error(`${type} requires an active run`);
  }
  const blockerId = requiredOption(options, 'blocker-id', type);
  const priorEvents = blockerLifecycle(sessionDir, blockerId);
  const opened = priorEvents.find((event) => event.status === 'blocker-opened');
  const terminal = priorEvents.find(
    (event) => event.status === 'blocker-resolved' || event.status === 'blocker-abandoned'
  );

  if (type === 'blocker-opened') {
    if (opened) throw new Error(`blocker ${blockerId} is already recorded`);
    const category = requiredOption(options, 'category', type);
    if (!BLOCKER_CATEGORIES.has(category)) {
      throw new Error(
        `unsupported blocker category: ${category}; expected one of ${[...BLOCKER_CATEGORIES].join(', ')}`
      );
    }
    const humanIntervention = parseBooleanOption(
      options['human-intervention'],
      'human-intervention'
    );
    if (humanIntervention === undefined) {
      throw new Error('--human-intervention is required for blocker-opened');
    }
    return {
      blockerId,
      category,
      summary: requiredOption(options, 'summary', type),
      humanIntervention
    };
  }

  if (!opened) throw new Error(`blocker ${blockerId} has not been opened`);
  if (terminal) throw new Error(`blocker ${blockerId} is already ${terminal.status}`);

  if (type === 'blocker-attempted') {
    const strategyKind = requiredOption(options, 'strategy-kind', type);
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(strategyKind)) {
      throw new Error('--strategy-kind must be a lowercase kebab-case label up to 64 characters');
    }
    const outcome = requiredOption(options, 'outcome', type);
    if (!BLOCKER_ATTEMPT_OUTCOMES.has(outcome)) {
      throw new Error(
        `unsupported blocker attempt outcome: ${outcome}; expected one of ${[
          ...BLOCKER_ATTEMPT_OUTCOMES
        ].join(', ')}`
      );
    }
    const automated = parseBooleanOption(options.automated, 'automated');
    if (automated === undefined) {
      throw new Error('--automated is required for blocker-attempted');
    }
    return {
      blockerId,
      strategy: requiredOption(options, 'strategy', type),
      strategyKind,
      outcome,
      automated
    };
  }

  const resolutionKind = requiredOption(options, 'resolution-kind', type);
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(resolutionKind)) {
    throw new Error('--resolution-kind must be a lowercase kebab-case label up to 64 characters');
  }
  const automated = parseBooleanOption(options.automated, 'automated');
  if (automated === undefined) {
    throw new Error(`--automated is required for ${type}`);
  }
  return {
    blockerId,
    resolution: requiredOption(options, 'resolution', type),
    resolutionKind,
    automated
  };
}

function requestIntent(sessionDir, state, messageFile, eventId) {
  const content = fs.readFileSync(path.resolve(messageFile), 'utf8');
  const historyPath = path.join(sessionDir, 'request-history.ndjson');
  if (fs.existsSync(historyPath)) {
    for (const line of fs.readFileSync(historyPath, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line);
        if (record.eventId === eventId) return record;
      } catch {
        // Preserve malformed evidence and append a complete intent.
      }
    }
  }
  const record = {
    timestamp: now(),
    revision: state.revision + 1,
    baseRevision: state.revision,
    kind: 'requirement-change-intent',
    eventId,
    sha256: sha256Text(content),
    content
  };
  appendJsonLine(historyPath, record);
  return record;
}

function saveRequest(sessionDir, state, kind, messageFile, eventId) {
  if (!messageFile) return undefined;
  const content = fs.readFileSync(path.resolve(messageFile), 'utf8');
  const historyPath = path.join(sessionDir, 'request-history.ndjson');
  if (eventId && fs.existsSync(historyPath)) {
    for (const line of fs.readFileSync(historyPath, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const existing = JSON.parse(line);
        if (existing.eventId === eventId && existing.kind === kind) {
          return { requestSha256: existing.sha256, eventId };
        }
      } catch {
        // Preserve malformed evidence and append a complete request record.
      }
    }
  }
  const record = {
    timestamp: now(),
    revision: state.revision,
    kind,
    eventId,
    sha256: sha256Text(content),
    content
  };
  appendJsonLine(historyPath, record);
  return { requestSha256: record.sha256, eventId };
}

function snapshotRevision(sessionDir, state, checkpointId, revision = state.revision) {
  reconcileSessionUnlocked(sessionDir);
  const checkpointDir = path.join(
    sessionDir,
    'checkpoints',
    `revision-${String(revision).padStart(3, '0')}-${checkpointId}`
  );
  const mutableArtifacts = [
    'plan.md',
    'planning/planner-mode.json',
    'planning/planner-report.md',
    'review.md',
    'review.json',
    'final.md',
    'artifact-index.json',
    'run-state.json'
  ];
  for (const relativePath of mutableArtifacts) {
    const source = path.join(sessionDir, relativePath);
    if (!fs.existsSync(source)) continue;
    const destination = path.join(checkpointDir, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
  return path.relative(sessionDir, checkpointDir).replaceAll('\\', '/');
}

export function updateRunState(sessionDir, type, options = {}) {
  return withSessionLock(sessionDir, () => {
    const statePath = path.join(sessionDir, 'run-state.json');
    let state = readJson(statePath, undefined);
    if (!state) throw new Error(`run-state.json is missing in ${sessionDir}`);
    let checkpointPath;
    let requestEvidence;
    let eventId = options.eventId;
    const eventTimestamp = now();
    validateExecutionProfile(options.profile);
    const replayedLifecycle =
      type !== 'requirement-change' && eventId
        ? findLifecycleEvent(sessionDir, eventId, type) ??
          (type === 'phase'
            ? findLifecycleEvent(sessionDir, eventId, 'phase-ignored') ??
              findLifecycleEvent(sessionDir, eventId, 'phase-deferred')
            : undefined)
        : undefined;
    if (replayedLifecycle) {
      appendReportRecord(sessionDir, replayedLifecycle);
      const replayMarker = `event:${eventId}`;
      const progressText = fs.readFileSync(path.join(sessionDir, 'progress.log'), 'utf8');
      if (!progressText.includes(`[${replayMarker}]`)) {
        appendProgress(sessionDir, `🔁 Event replay reconciled — ${type}`, replayMarker);
      }
      return state;
    }

    if (type === 'requirement-change') {
      if (!options.messageFile) throw new Error('--message-file is required for requirement-change');
      const content = fs.readFileSync(path.resolve(options.messageFile), 'utf8');
      eventId = eventId ?? `requirement:${sha256Text(content)}`;
      const intent = requestIntent(sessionDir, state, options.messageFile, eventId);
      const checkpointId = `event-${sha256Text(eventId).slice(0, 32)}`;
      const alreadyApplied = new Set(state.appliedEventIds ?? []).has(eventId);
      if (alreadyApplied) {
        const appliedRevision = state.appliedEventRevisions?.[eventId] ?? intent.revision;
        const appliedBaseRevision = Math.max(1, appliedRevision - 1);
        checkpointPath = path
          .join(
            'checkpoints',
            `revision-${String(appliedBaseRevision).padStart(3, '0')}-${checkpointId}`
          )
          .replaceAll('\\', '/');
        const evidenceState = { ...state, revision: appliedRevision, phase: 'understand' };
        requestEvidence = { requestSha256: intent.sha256, eventId };
        const existingLifecycle = findLifecycleEvent(sessionDir, eventId, type);
        if (!existingLifecycle) {
          appendLifecycle(sessionDir, evidenceState, type, {
            reason: options.reason,
            checkpointPath,
            eventId,
            ...requestEvidence
          });
        } else {
          appendReportRecord(sessionDir, existingLifecycle);
        }
        const marker = `event:${eventId}`;
        const progressText = fs.readFileSync(path.join(sessionDir, 'progress.log'), 'utf8');
        if (!progressText.includes(`[${marker}]`)) {
          appendProgress(
            sessionDir,
            `🔁 Requirement revision ${appliedRevision} — checkpoint ${checkpointPath}`,
            marker
          );
        }
        return state;
      }
      settleActiveTiming(state, eventTimestamp);
      const baseRevision = state.revision;
      const targetRevision = baseRevision + 1;
      checkpointPath = path
        .join(
          'checkpoints',
          `revision-${String(baseRevision).padStart(3, '0')}-${checkpointId}`
        )
        .replaceAll('\\', '/');
      if (intent.baseRevision !== baseRevision || intent.revision !== targetRevision) {
        appendJsonLine(path.join(sessionDir, 'request-history.ndjson'), {
          timestamp: now(),
          kind: 'requirement-change-rebased',
          eventId,
          originalBaseRevision: intent.baseRevision,
          originalRevision: intent.revision,
          baseRevision,
          revision: targetRevision
        });
      }
      snapshotRevision(sessionDir, state, checkpointId, baseRevision);
      state = readJson(statePath, state);
      const applied = new Set(state.appliedEventIds ?? []);
      state.revision = targetRevision;
      applied.add(eventId);
      state.appliedEventIds = [...applied];
      state.appliedEventRevisions = {
        ...(state.appliedEventRevisions ?? {}),
        [eventId]: targetRevision
      };
      state.status = 'active';
      state.phase = 'understand';
      if (options.profile) state.executionProfile = options.profile;
      requestEvidence = { requestSha256: intent.sha256, eventId };
    } else if (type === 'interruption') {
      settleActiveTiming(state, eventTimestamp);
      if (state.status !== 'interrupted') {
        state.statusBeforeInterruption = state.status;
        state.interruptionStartedAt = eventTimestamp;
      }
      if (state.status !== 'completed') state.status = 'interrupted';
      requestEvidence = saveRequest(sessionDir, state, type, options.messageFile, eventId);
    } else if (type === 'resume') {
      if (state.status !== 'interrupted') {
        if (eventId && !lifecycleHasEvent(sessionDir, eventId, type)) {
          appendLifecycle(sessionDir, state, type, { reason: options.reason, eventId });
          appendProgress(
            sessionDir,
            `▶️ Run resume replay preserved — revision ${state.revision}, phase ${state.phase}`,
            `event:${eventId}`
          );
        }
        return state;
      }
      settleInterruptionTiming(state, state.interruptionStartedAt, eventTimestamp);
      state.status = state.statusBeforeInterruption === 'completed' ? 'completed' : 'active';
      const deferredPhase = latestLifecycleEvent(
        sessionDir,
        'phase-deferred',
        state.interruptionStartedAt
      );
      if (deferredPhase?.requestedPhase) state.phase = deferredPhase.requestedPhase;
      delete state.statusBeforeInterruption;
      delete state.interruptionStartedAt;
    } else if (type === 'phase') {
      if (state.status === 'completed' || state.status === 'interrupted') {
        const lifecycleStatus = state.status === 'completed' ? 'phase-ignored' : 'phase-deferred';
        eventId =
          eventId ??
          `phase:${state.revision}:${state.status}:${options.phase ?? 'unknown'}:${Date.now()}`;
        if (!lifecycleHasEvent(sessionDir, eventId, lifecycleStatus)) {
          appendLifecycle(sessionDir, state, lifecycleStatus, {
            eventId,
            requestedPhase: options.phase
          });
          const description =
            state.status === 'completed'
              ? 'Ignored late phase after completion'
              : 'Deferred phase until explicit resume';
          appendProgress(
            sessionDir,
            `⏭️ ${description} — ${options.phase ?? 'unknown'}`,
            `event:${eventId}`
          );
        }
        return state;
      }
      settleActiveTiming(state, eventTimestamp);
      state.status = 'active';
      state.phase = options.phase ?? state.phase;
    } else if (type === 'completed') {
      reconcileSessionUnlocked(sessionDir);
      state = readJson(statePath, state);
      settleActiveTiming(state, eventTimestamp);
      state.status = 'completed';
      state.phase = 'complete';
      ensureTimingState(state, eventTimestamp).completedAt = eventTimestamp;
    } else if (BLOCKER_EVENT_TYPES.has(type)) {
      settleActiveTiming(state, eventTimestamp);
      requestEvidence = blockerEventDetails(sessionDir, state, type, options);
    } else if (type === 'note') {
      settleActiveTiming(state, eventTimestamp);
      requestEvidence = saveRequest(sessionDir, state, type, options.messageFile, eventId);
    } else {
      throw new Error(`unsupported event type: ${type}`);
    }

    if (state.status === 'active') startActiveTiming(state, eventTimestamp);
    state.updatedAt = eventTimestamp;
    state.lastEvent = type;
    const timingSummary = refreshTimingSummary(state, eventTimestamp);
    atomicWriteJson(statePath, state);
    if (!eventId || !lifecycleHasEvent(sessionDir, eventId, type)) {
      appendLifecycle(sessionDir, state, type, {
        reason: options.reason,
        checkpointPath,
        eventId,
        ...requestEvidence
      });
    }
    const messages = {
      'requirement-change': `🔁 Requirement revision ${state.revision} — checkpoint ${checkpointPath}`,
      interruption: `⏸️ Run interrupted — ${options.reason ?? 'user message'}`,
      resume: `▶️ Run resumed — revision ${state.revision}, phase ${state.phase}`,
      phase: `🧭 Durable phase — ${state.phase}`,
      completed: `✅ Durable run state completed — ${formatTimingSummary(timingSummary)}`,
      'blocker-opened': `⛔ Blocker opened — ${requestEvidence?.blockerId}: ${requestEvidence?.category}`,
      'blocker-attempted': `🧪 Blocker attempt — ${requestEvidence?.blockerId}: ${requestEvidence?.outcome}`,
      'blocker-resolved': `✅ Blocker resolved — ${requestEvidence?.blockerId}: ${requestEvidence?.resolutionKind}`,
      'blocker-abandoned': `⚠️ Blocker abandoned — ${requestEvidence?.blockerId}: ${requestEvidence?.resolutionKind}`,
      note: '💬 Follow-up recorded'
    };
    const progressMarker = eventId ? `event:${eventId}` : undefined;
    const progressText = fs.readFileSync(path.join(sessionDir, 'progress.log'), 'utf8');
    if (!progressMarker || !progressText.includes(`[${progressMarker}]`)) {
      appendProgress(sessionDir, messages[type], progressMarker);
    }
    return state;
  });
}

function initSession(sessionDir, options) {
  validateExecutionProfile(options.profile);
  fs.mkdirSync(sessionDir, { recursive: true });
  return withSessionLock(sessionDir, () => {
    for (const directory of ['planning', 'implementation', 'evaluation', 'context', 'checkpoints']) {
      fs.mkdirSync(path.join(sessionDir, directory), { recursive: true });
    }
    for (const file of [
      'progress.log',
      'report.json',
      'report-recovery.ndjson',
      'lifecycle.ndjson',
      'request-history.ndjson'
    ]) {
      fs.closeSync(fs.openSync(path.join(sessionDir, file), 'a'));
    }
    const statePath = path.join(sessionDir, 'run-state.json');
    let state = readJson(statePath, undefined);
    if (!state) {
      state = {
        schemaVersion: 2,
        sessionId: options['run-id'] ?? path.basename(sessionDir),
        status: 'active',
        phase: 'orient',
        revision: 1,
        executionProfile: options.profile ?? 'standard',
        createdAt: now(),
        updatedAt: now()
      };
      ensureTimingState(state, state.createdAt);
      refreshTimingSummary(state, state.createdAt);
      atomicWriteJson(statePath, state);
    } else if (!state.executionProfile) {
      state.executionProfile = options.profile ?? 'standard';
      atomicWriteJson(statePath, state);
    }
    const initEventId = `initialized:${state.sessionId}`;
    const requestEvidence = saveRequest(
      sessionDir,
      state,
      'initial',
      options['request-file'],
      initEventId
    );
    if (!lifecycleHasEvent(sessionDir, initEventId, 'initialized')) {
      appendLifecycle(sessionDir, state, 'initialized', { eventId: initEventId, ...requestEvidence });
    }
    const initMarker = `event:${initEventId}`;
    const progressText = fs.readFileSync(path.join(sessionDir, 'progress.log'), 'utf8');
    if (!progressText.includes(`[${initMarker}]`)) {
      appendProgress(
        sessionDir,
        `🧱 Durable run initialized — revision ${state.revision}`,
        initMarker
      );
    }
    reconcileSessionUnlocked(sessionDir);
    return readJson(statePath, state);
  });
}

function main() {
  const { command, sessionDir, options } = parseArgs(process.argv.slice(2));
  if (!command || !sessionDir) {
    console.error(
      'usage: node run-state.mjs <init|event|reconcile|timing|complete|report|unlock> <sessionDir> [--type <event>] [--phase <phase>] [--profile <standard|poc>] [--message-file <path>] [--record-file <path>]'
    );
    process.exit(2);
  }
  if (command === 'init') {
    console.log(JSON.stringify(initSession(sessionDir, options)));
    return;
  }
  if (command === 'reconcile') {
    console.log(JSON.stringify(reconcileSession(sessionDir).state));
    return;
  }
  if (command === 'timing') {
    const state = reconcileSession(sessionDir).state;
    console.log(JSON.stringify(state.timing.summary));
    return;
  }
  if (command === 'complete') {
    console.log(JSON.stringify(updateRunState(sessionDir, 'completed', options)));
    return;
  }
  if (command === 'report') {
    if (!options['record-file']) throw new Error('--record-file is required');
    console.log(
      JSON.stringify(
        withSessionLock(sessionDir, () =>
          appendExternalReportRecord(sessionDir, options['record-file'])
        )
      )
    );
    return;
  }
  if (command === 'unlock') {
    console.log(JSON.stringify(unlockDeadSession(sessionDir)));
    return;
  }
  if (command === 'event') {
    if (!options.type) throw new Error('--type is required');
    console.log(
      JSON.stringify(
        updateRunState(sessionDir, options.type, {
          phase: options.phase,
          reason: options.reason,
          messageFile: options['message-file'],
          eventId: options['event-id'],
          profile: options.profile,
          'blocker-id': options['blocker-id'],
          category: options.category,
          summary: options.summary,
          strategy: options.strategy,
          'strategy-kind': options['strategy-kind'],
          outcome: options.outcome,
          resolution: options.resolution,
          'resolution-kind': options['resolution-kind'],
          automated: options.automated,
          'human-intervention': options['human-intervention']
        })
      )
    );
    return;
  }
  throw new Error(`unsupported command: ${command}`);
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) main();
