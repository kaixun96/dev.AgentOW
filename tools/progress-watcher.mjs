#!/usr/bin/env node
// progress-watcher.mjs
//
// Tail-watch a session's evaluation/ + report.json and append human-readable
// log lines to progress.log whenever new files appear or new NDJSON lines are
// written. This is the BACKSTOP for orchestrator forgetting to echo progress.
//
// Usage:
//   node tools/progress-watcher.mjs <sessionDir>
//
// Example:
//   node tools/progress-watcher.mjs /workspaces/odsp-web/.aero/redo10-bookmark-panel
//
// Designed to run as a background process for the lifetime of a session.
// Idempotent: safe to restart; remembers last-seen NDJSON line + last-seen file mtimes
// via a sidecar state file (.progress-watcher.state.json).

import * as fs from 'fs';
import { watch } from 'fs';

const sessionDir = process.argv[2];
if (!sessionDir || !fs.existsSync(sessionDir)) {
  console.error('usage: node progress-watcher.mjs <sessionDir>');
  process.exit(2);
}

const progressLog = `${sessionDir}/progress.log`;
const reportJson = `${sessionDir}/report.json`;
const evaluationDir = `${sessionDir}/evaluation`;
const stateFile = `${sessionDir}/.progress-watcher.state.json`;

const state = fs.existsSync(stateFile)
  ? JSON.parse(fs.readFileSync(stateFile, 'utf8'))
  : { ndjsonOffset: 0, seenFiles: {} };

function saveState() {
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

function ts() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
}

function log(msg) {
  const line = `[${ts()}] ${msg}\n`;
  fs.appendFileSync(progressLog, line);
  process.stderr.write(line); // also stderr for debugging
}

// --- 1. NDJSON tail: read new lines from report.json, translate to human log ---

function tailReportJson() {
  if (!fs.existsSync(reportJson)) return;
  const stat = fs.statSync(reportJson);
  if (stat.size <= state.ndjsonOffset) return;

  const fd = fs.openSync(reportJson, 'r');
  const buf = Buffer.alloc(stat.size - state.ndjsonOffset);
  fs.readSync(fd, buf, 0, buf.length, state.ndjsonOffset);
  fs.closeSync(fd);
  state.ndjsonOffset = stat.size;

  const text = buf.toString('utf8');
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      translateNdjson(obj);
    } catch {
      // ignore non-JSON
    }
  }
  saveState();
}

function translateNdjson(obj) {
  // planner result
  if (obj.sender === 'ow-planner') {
    if (obj.status === 'success') log(`📋 Planner result: success — plan=${obj.planPath?.split('/').pop()}`);
    else log(`📋 Planner result: ${obj.status}`);
    return;
  }
  // generator code_done
  if (obj.phase === 'code_done') {
    log(`🔨 code_done cycle ${obj.cycle}: ${obj.commits?.[0]?.slice(0,12) ?? '?'} on ${obj.branch}`);
    return;
  }
  // generator build_done
  if (obj.phase === 'build_done') {
    const status = obj.buildStatus === 'success' ? '✅' : '❌';
    log(`${status} build_done cycle ${obj.cycle}: ${obj.buildStatus}${obj.port ? ` — server :${obj.port}` : ''}`);
    return;
  }
  // evaluator code_inspection
  if (obj.agent === 'ow-evaluator' && obj.mode === 'code_inspection') {
    log(`🔍 code_inspection cycle ${obj.cycle}: ${obj.verdict}`);
    return;
  }
  // review
  if (obj.agent === 'ow-review-agent') {
    log(`📝 Review: ${obj.verdict ?? '?'} (${obj.criticalCount ?? 0} critical)`);
    return;
  }
}

// --- 2. evaluation/ file watch: new PNG / JSON triggers a log line ---

const interesting = /(before|after|composite|diff).*\.png$|^(rule|vision)-findings\.json$|^reflection\.md$/;

function scanEvaluation() {
  if (!fs.existsSync(evaluationDir)) return;
  for (const iter of fs.readdirSync(evaluationDir)) {
    const iterDir = `${evaluationDir}/${iter}`;
    if (!fs.statSync(iterDir).isDirectory()) continue;
    for (const f of fs.readdirSync(iterDir)) {
      if (!interesting.test(f)) continue;
      const full = `${iterDir}/${f}`;
      const m = fs.statSync(full).mtimeMs;
      const key = `${iter}/${f}`;
      if (state.seenFiles[key] === m) continue;
      state.seenFiles[key] = m;
      if (f.endsWith('.png')) log(`📸 ${iter}: ${f}`);
      else if (f === 'rule-findings.json') {
        try {
          const r = JSON.parse(fs.readFileSync(full, 'utf8'));
          log(`🔍 ${iter} rule-findings: verdict=${r.verdict ?? '?'} blockers=${r.blockers?.length ?? '?'}`);
        } catch { log(`🔍 ${iter} rule-findings.json written`); }
      } else if (f === 'vision-findings.json') {
        try {
          const v = JSON.parse(fs.readFileSync(full, 'utf8'));
          log(`👁  ${iter} vision-findings: verdict=${v.verdict ?? '?'} issues=${v.totalIssueCount ?? '?'}`);
        } catch { log(`👁  ${iter} vision-findings.json written`); }
      } else if (f === 'reflection.md') {
        log(`📝 ${iter} reflection.md written`);
      }
    }
  }
  saveState();
}

// --- 3. Wire up: poll every 2s (fs.watch is unreliable on some filesystems) ---

log(`🤖 progress-watcher started (pid ${process.pid}) — backstop for orchestrator log writes`);

scanEvaluation();
tailReportJson();

setInterval(() => {
  tailReportJson();
  scanEvaluation();
}, 2000);

process.on('SIGINT', () => { log('🤖 progress-watcher stopped'); process.exit(0); });
process.on('SIGTERM', () => { log('🤖 progress-watcher stopped'); process.exit(0); });
