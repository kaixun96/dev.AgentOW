#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { reconcileSession, updateRunState } from './run-state.mjs';

const sessionDir = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
if (!sessionDir || !fs.existsSync(sessionDir)) {
  console.error('usage: node progress-watcher.mjs <sessionDir>');
  process.exit(2);
}

const progressLog = path.join(sessionDir, 'progress.log');
const reportJson = path.join(sessionDir, 'report.json');
const recoveryJson = path.join(sessionDir, 'report-recovery.ndjson');
const stateFile = path.join(sessionDir, '.progress-watcher.state.json');
const state = readState();
const HEARTBEAT_MS = Number(process.env.OW_WATCHER_HEARTBEAT_MS) || 8 * 60 * 1000;
const STALL_MS = Number(process.env.OW_WATCHER_STALL_MS) || 24 * 60 * 1000;
let lastProgressMs = Date.now();
let lastHeartbeatMs = 0;

function readState() {
  try {
    const value = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    return {
      ...value,
      ndjsonOffsets: value.ndjsonOffsets ?? { report: value.ndjsonOffset ?? 0, recovery: 0 },
      pendingNdjson: {
        report:
          typeof value.pendingNdjson === 'string'
            ? value.pendingNdjson
            : value.pendingNdjson?.report ?? '',
        recovery: value.pendingNdjson?.recovery ?? ''
      }
    };
  } catch {
    return { ndjsonOffsets: { report: 0, recovery: 0 }, pendingNdjson: { report: '', recovery: '' } };
  }
}

function saveState() {
  const tempPath = `${stateFile}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(tempPath, stateFile);
}

function clock() {
  return new Date().toTimeString().slice(0, 8);
}

function log(message) {
  const line = `[${clock()}] ${message}\n`;
  fs.appendFileSync(progressLog, line);
  process.stderr.write(line);
}

function translate(record) {
  if (record.sender === 'planner' || record.sender === 'ow-planner') {
    log(`📋 Planner result (${record.mode ?? 'full'}): ${record.status}`);
  } else if (record.sender === 'evaluator') {
    log(`🔍 Evaluator cycle ${record.cycle ?? '?'}: ${record.verdict ?? record.status ?? '?'}`);
  } else if (record.sender === 'reviewer') {
    log(`📝 Review: ${record.verdict ?? record.status ?? '?'}`);
  } else if (record.phase === 'code_done') {
    log(`🔨 code_done cycle ${record.cycle}: ${record.commits?.[0]?.slice(0, 12) ?? '?'} on ${record.branch ?? '?'}`);
  } else if (record.phase === 'build_done') {
    const icon = record.buildStatus === 'success' ? '✅' : '❌';
    log(`${icon} build_done cycle ${record.cycle}: ${record.buildStatus ?? '?'}`);
  } else if (record.agent === 'ow-evaluator' && record.mode === 'code_inspection') {
    log(`🔍 code_inspection cycle ${record.cycle}: ${record.verdict ?? '?'}`);
  } else if (record.agent === 'ow-review-agent') {
    log(`📝 Review: ${record.verdict ?? '?'} (${record.criticalCount ?? 0} critical)`);
  }
}

function tailReportFile(filePath, key) {
  if (!fs.existsSync(filePath)) return;
  const stat = fs.statSync(filePath);
  if (stat.size < state.ndjsonOffsets[key]) {
    state.ndjsonOffsets[key] = 0;
    state.pendingNdjson[key] = '';
  }
  if (stat.size === state.ndjsonOffsets[key]) return;

  const descriptor = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(stat.size - state.ndjsonOffsets[key]);
  fs.readSync(descriptor, buffer, 0, buffer.length, state.ndjsonOffsets[key]);
  fs.closeSync(descriptor);
  state.ndjsonOffsets[key] = stat.size;

  const combined = `${state.pendingNdjson[key] ?? ''}${buffer.toString('utf8')}`;
  const lines = combined.split('\n');
  state.pendingNdjson[key] = lines.pop() ?? '';
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      translate(JSON.parse(line));
    } catch {
      log('⚠️ Invalid completed NDJSON line preserved in report.json');
    }
  }
  lastProgressMs = Date.now();
  saveState();
}

function tailReports() {
  tailReportFile(reportJson, 'report');
  tailReportFile(recoveryJson, 'recovery');
}

function reconcile() {
  const result = reconcileSession(sessionDir);
  if (result.newReportRecords > 0 || result.newProgressRecords > 0) lastProgressMs = Date.now();
  if (result.state.status === 'completed') {
    log('🤖 progress-watcher finished after durable completion');
    process.exit(0);
  }
}

function readRunState() {
  try {
    return JSON.parse(fs.readFileSync(path.join(sessionDir, 'run-state.json'), 'utf8'));
  } catch {
    return undefined;
  }
}

function checkStall() {
  const gap = Date.now() - lastProgressMs;
  if (gap < HEARTBEAT_MS || Date.now() - lastHeartbeatMs < HEARTBEAT_MS) return;
  lastHeartbeatMs = Date.now();
  const minutes = Math.round(gap / 60000);
  if (gap >= STALL_MS) {
    log(`⚠️ POSSIBLE STALL — no durable artifact or report output for ~${minutes}m; reconcile and resume from run-state.json`);
  } else {
    log(`🕐 watcher heartbeat — no new durable output for ~${minutes}m`);
  }
}

function shutdown(signal) {
  try {
    reconcileSession(sessionDir);
    updateRunState(sessionDir, 'interruption', { reason: `progress-watcher received ${signal}` });
  } finally {
    process.exit(0);
  }
}

log(`🤖 progress-watcher started (pid ${process.pid}) — disk-backed artifact reconciliation active`);
tailReports();
reconcile();

setInterval(() => {
  try {
    tailReports();
    reconcile();
    checkStall();
  } catch (error) {
    log(`⚠️ watcher recovery needed — ${error instanceof Error ? error.message : String(error)}`);
  }
}, 2000);

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
