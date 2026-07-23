#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ODSP_ROOT = "/workspaces/odsp-web";
const LOCAL_MARKETPLACE = `${ODSP_ROOT}/.ai`;
const UI_PATTERN =
  /\b(ui|visual|screenshot|drawer|dialog|panel|card|layout|css|style|figma|button|icon|header|command bar|toolbar|web part|color|font|spacing|padding|margin|theme|navigation|menu|form|input)\b|截图|视觉|样式|布局|按钮|图标|标题栏|命令栏|工具栏|颜色|字体|间距|主题|导航|菜单|表单/i;
const FIGMA_PATTERN = /\bfigma\b|设计稿/i;
const ADO_PATTERN = /\b(ado|azure devops|work item|dev\.azure\.com|visualstudio\.com)\b|工作项/i;
const OPT_IN_PATTERN = /\b(bluebird|wiki|microsoft learn)\b/i;
const KILLSWITCH_PATTERN = /\b(killswitch|kill switch|guid)\b|熔断/i;
const SENSITIVE_LINE_PATTERN = /^\s*(authorization|proxy-authorization|cookie|set-cookie|token|password|passwd|secret|client_secret)\s*[:=].*$/gim;
const SENSITIVE_VALUE_PATTERN = /\b(token|password|passwd|secret|cookie|authorization|client_secret)\s*[:=]\s*[^\r\n]+/gi;
const BEARER_PATTERN = /\bbearer\s+[a-z0-9._~+/=-]+/gi;
const EMAIL_PATTERN = /\b[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+\b/gi;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const JSON_WHITESPACE_PATTERN = /\s/;

function parseArgs(argv) {
  const result = new Map();
  for (let index = 2; index < argv.length; index++) {
    const arg = argv[index];
    if (arg.startsWith("--")) {
      const next = argv[index + 1];
      if (next && !next.startsWith("--")) {
        result.set(arg, next);
        index++;
      } else {
        result.set(arg, true);
      }
    }
  }
  return result;
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: process.env,
    timeout: 120_000,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    output: redact(`${result.stdout ?? ""}\n${result.stderr ?? ""}`),
  };
}

function redact(value) {
  return value
    .replace(SENSITIVE_LINE_PATTERN, "$1=[REDACTED]")
    .replace(SENSITIVE_VALUE_PATTERN, "$1=[REDACTED]")
    .replace(BEARER_PATTERN, "Bearer [REDACTED]")
    .replace(/https?:\/\/[^@\s]+@/g, "https://[REDACTED]@")
    .replace(EMAIL_PATTERN, "[REDACTED_EMAIL]")
    .replace(UUID_PATTERN, "[REDACTED_ID]")
    .slice(0, 800);
}

function commandExists(command) {
  return run("which", [command]).ok;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return undefined;
  }
}

function stripJsonComments(value) {
  let result = "";
  let inString = false;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;
  for (let index = 0; index < value.length; index++) {
    const current = value[index];
    const next = value[index + 1];
    if (inLineComment) {
      if (current === "\n" || current === "\r") {
        inLineComment = false;
        result += current;
      }
      continue;
    }
    if (inBlockComment) {
      if (current === "*" && next === "/") {
        inBlockComment = false;
        index++;
      } else if (current === "\n" || current === "\r") {
        result += current;
      }
      continue;
    }
    if (inString) {
      result += current;
      if (escaped) {
        escaped = false;
      } else if (current === "\\") {
        escaped = true;
      } else if (current === '"') {
        inString = false;
      }
      continue;
    }
    if (current === '"') {
      inString = true;
      result += current;
    } else if (current === "/" && next === "/") {
      inLineComment = true;
      index++;
    } else if (current === "/" && next === "*") {
      inBlockComment = true;
      index++;
    } else {
      result += current;
    }
  }
  return result;
}

function removeTrailingJsonCommas(value) {
  let result = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < value.length; index++) {
    const current = value[index];
    if (inString) {
      result += current;
      if (escaped) {
        escaped = false;
      } else if (current === "\\") {
        escaped = true;
      } else if (current === '"') {
        inString = false;
      }
      continue;
    }
    if (current === '"') {
      inString = true;
      result += current;
      continue;
    }
    if (current === ",") {
      let nextIndex = index + 1;
      while (nextIndex < value.length && JSON_WHITESPACE_PATTERN.test(value[nextIndex])) {
        nextIndex++;
      }
      if (value[nextIndex] === "}" || value[nextIndex] === "]") {
        continue;
      }
    }
    result += current;
  }
  return result;
}

function readJsonc(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(removeTrailingJsonCommas(stripJsonComments(content)));
  } catch {
    return undefined;
  }
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function writeJson(filePath, value) {
  let targetPath = filePath;
  if (fs.existsSync(filePath) && fs.lstatSync(filePath).isSymbolicLink()) {
    targetPath = fs.realpathSync(filePath);
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.${process.pid}.tmp`;
  const existingMode = fs.existsSync(targetPath) ? fs.statSync(targetPath).mode : undefined;
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, existingMode === undefined ? undefined : { mode: existingMode });
    fs.renameSync(temporaryPath, targetPath);
  } finally {
    if (fs.existsSync(temporaryPath)) {
      fs.unlinkSync(temporaryPath);
    }
  }
}

function getHostProcessIdentity(host) {
  let pid = process.ppid;
  for (let depth = 0; depth < 12 && pid > 1; depth++) {
    try {
      const argv = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0");
      const executable = path.basename(fs.readlinkSync(`/proc/${pid}/exe`)).toLowerCase();
      const argv0 = path.basename(argv[0] ?? "").toLowerCase();
      const argv1 = path.basename(argv[1] ?? "").toLowerCase();
      const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
      const closeParen = stat.lastIndexOf(")");
      const fields = stat.slice(closeParen + 2).split(" ");
      const parentPid = Number(fields[1]);
      const startTime = fields[19];
      if (executable.includes(host) || argv0.includes(host) || argv1 === host) {
        return `${host}:${pid}:${startTime}`;
      }
      pid = parentPid;
    } catch {
      break;
    }
  }
  return `${host}:${process.ppid}`;
}

function getSessionIdentity(host, hostProcessIdentity) {
  const envId =
    process.env.AGENTOW_SESSION_ID ??
    process.env.CLAUDE_SESSION_ID ??
    process.env.COPILOT_SESSION_ID ??
    process.env.TERM_SESSION_ID;
  return envId ? `${host}:${envId}` : hostProcessIdentity;
}

function pluginState(host, pluginName) {
  const roots =
    host === "copilot"
      ? [`${os.homedir()}/.copilot/installed-plugins/odsp-web-plugins/${pluginName}`]
      : [
          `${os.homedir()}/.claude/plugins/cache/odsp-web-plugins/${pluginName}`,
          `${os.homedir()}/.claude/plugins/cache/${pluginName}`,
        ];
  if (!roots.some((root) => fs.existsSync(root))) {
    return "missing";
  }
  if (host !== "copilot") {
    return "available";
  }

  const qualifiedName = `${pluginName}@odsp-web-plugins`;
  const settings = readJson(`${os.homedir()}/.copilot/settings.json`);
  const enabledPlugins = isPlainObject(settings) && isPlainObject(settings.enabledPlugins) ? settings.enabledPlugins : undefined;
  if (enabledPlugins?.[qualifiedName] === true) {
    return "available";
  }
  if (enabledPlugins?.[qualifiedName] === false) {
    return "disabled";
  }

  const config = readJsonc(`${os.homedir()}/.copilot/config.json`);
  const installedPlugins = isPlainObject(config) && Array.isArray(config.installedPlugins) ? config.installedPlugins : [];
  const pluginConfig = installedPlugins.find(
    (plugin) => isPlainObject(plugin) && plugin.name === pluginName && plugin.marketplace === "odsp-web-plugins",
  );
  return isPlainObject(pluginConfig) && pluginConfig.enabled === false ? "disabled" : "available";
}

function enableCopilotPlugin(pluginName, actions) {
  const settingsPath = `${os.homedir()}/.copilot/settings.json`;
  const settingsExists = fs.existsSync(settingsPath);
  const settings = settingsExists ? readJson(settingsPath) : {};
  if (!isPlainObject(settings) || (settings.enabledPlugins !== undefined && !isPlainObject(settings.enabledPlugins))) {
    actions.push({
      type: "plugin-enable",
      target: pluginName,
      status: "failed",
      evidence: "Copilot settings.json or enabledPlugins is not a JSON object",
    });
    return false;
  }
  settings.enabledPlugins = {
    ...(settings.enabledPlugins ?? {}),
    [`${pluginName}@odsp-web-plugins`]: true,
  };
  writeJson(settingsPath, settings);
  actions.push({
    type: "plugin-enable",
    target: pluginName,
    status: "updated",
    evidence: "Enabled in Copilot settings",
  });
  return true;
}

function pluginAvailable(host, pluginName) {
  return pluginState(host, pluginName) === "available";
}

function trustedMarketplaceRegistered(host) {
  const result = spawnSync(host, ["plugin", "marketplace", "list"], {
    encoding: "utf8",
    env: process.env,
    timeout: 120_000,
  });
  if (result.status !== 0) {
    return false;
  }
  const lines = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.split(/\r?\n/);
  if (host === "copilot") {
    const expected = `odsp-web-plugins (Local: ${LOCAL_MARKETPLACE})`;
    return lines.some((line) => line.trim().replace(/^[•◆❯]\s*/, "") === expected);
  }
  for (let index = 0; index < lines.length - 1; index++) {
    const marketplaceName = lines[index].trim().replace(/^[•◆❯]\s*/, "");
    const source = lines[index + 1].trim();
    if (marketplaceName === "odsp-web-plugins" && source === `Source: Directory (${LOCAL_MARKETPLACE})`) {
      return true;
    }
  }
  return false;
}

function installPlugin(host, pluginName, actions) {
  let marketplaceTrusted = trustedMarketplaceRegistered(host);
  if (!marketplaceTrusted) {
    const marketplaceResult = run(host, ["plugin", "marketplace", "add", LOCAL_MARKETPLACE]);
    marketplaceTrusted = marketplaceResult.ok && trustedMarketplaceRegistered(host);
  }
  if (!marketplaceTrusted) {
    actions.push({
      type: "plugin-install",
      target: pluginName,
      status: "failed",
      evidence: `Refused installation because odsp-web-plugins is not registered at ${LOCAL_MARKETPLACE}`,
    });
    return false;
  }
  const installResult = run(host, ["plugin", "install", `${pluginName}@odsp-web-plugins`]);
  actions.push({
    type: "plugin-install",
    target: pluginName,
    status: installResult.ok ? "installed" : "failed",
    evidence: installResult.ok ? `Installed from ${LOCAL_MARKETPLACE}` : installResult.output,
  });
  return installResult.ok;
}

function makeCapability(id, role, status, evidence, fallbackIds = [], blocksPlanning = false, remediation = "") {
  return {
    id,
    role,
    status,
    redactedEvidence: redact(evidence),
    fallbackIds,
    blocksPlanning,
    remediation,
  };
}

function ensurePlugin({ host, pluginName, id, role, shouldInstall, firstRun, probeOnly, actions, fallbackIds }) {
  const state = pluginState(host, pluginName);
  if (state === "available") {
    return makeCapability(id, role, "available", `${pluginName} is installed`, fallbackIds);
  }
  if (
    state === "disabled" &&
    host === "copilot" &&
    shouldInstall &&
    !probeOnly &&
    enableCopilotPlugin(pluginName, actions)
  ) {
    return makeCapability(
      id,
      role,
      "installed-restart-required",
      `${pluginName} was enabled in Copilot settings`,
      fallbackIds,
      false,
      "Restart Copilot CLI so the plugin and MCP servers load",
    );
  }
  if (shouldInstall && (firstRun || role === "required") && !probeOnly && commandExists(host) && fs.existsSync(LOCAL_MARKETPLACE)) {
    const installed = installPlugin(host, pluginName, actions);
    if (installed) {
      return makeCapability(
        id,
        role,
        "installed-restart-required",
        `${pluginName} installed from the local odsp-web marketplace`,
        fallbackIds,
        false,
        `Restart ${host} so the plugin and MCP servers load`,
      );
    }
  }
  return makeCapability(
    id,
    role,
    state === "disabled" ? "misconfigured" : "missing",
    state === "disabled" ? `${pluginName} is installed but disabled` : `${pluginName} is not installed`,
    fallbackIds,
    role === "required" && fallbackIds.length === 0,
    state === "disabled"
      ? `Enable ${pluginName}@odsp-web-plugins in Copilot settings and restart`
      : `Install ${pluginName}@odsp-web-plugins from ${LOCAL_MARKETPLACE}`,
  );
}

function ensureClaudeAgentTeams(firstRun, probeOnly, actions) {
  const settingsPath = `${os.homedir()}/.claude/settings.json`;
  const settings = readJson(settingsPath);
  const settingsIsObject = isPlainObject(settings);
  const envIsObject = settingsIsObject && (settings.env === undefined || isPlainObject(settings.env));
  if (settingsIsObject && isPlainObject(settings.env) && settings.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS === "1") {
    return makeCapability("host.claude-agent-teams", "required", "available", "Agent Teams flag is enabled");
  }
  if (firstRun && !probeOnly && ((!fs.existsSync(settingsPath) && settings === undefined) || (settingsIsObject && envIsObject))) {
    const nextSettings = settings ?? {};
    nextSettings.env = { ...(nextSettings.env ?? {}), CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1" };
    writeJson(settingsPath, nextSettings);
    actions.push({ type: "settings-update", target: settingsPath, status: "updated", evidence: "Agent Teams enabled" });
    return makeCapability(
      "host.claude-agent-teams",
      "required",
      "installed-restart-required",
      "Agent Teams flag was added",
      [],
      false,
      "Restart Claude Code",
    );
  }
  return makeCapability(
    "host.claude-agent-teams",
    "required",
    "misconfigured",
    "Agent Teams flag is missing or settings.json is not valid JSON",
    [],
    true,
    "Set CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 in ~/.claude/settings.json and restart Claude",
  );
}

function ensureImageDependencies(ui, firstRun, probeOnly, actions) {
  const toolsDir = path.dirname(fileURLToPath(import.meta.url));
  const dependencies = ["sharp", "pngjs", "pixelmatch"];
  const missing = dependencies.filter((dependency) => !fs.existsSync(`${toolsDir}/node_modules/${dependency}`));
  if (missing.length === 0) {
    return makeCapability("visual.image-diff-deps", ui ? "required" : "optional", "available", "Image diff dependencies are installed");
  }
  if (ui && !probeOnly && commandExists("npm") && fs.existsSync(`${toolsDir}/package-lock.json`)) {
    const installResult = run("npm", ["ci", "--ignore-scripts=false"], toolsDir);
    actions.push({
      type: "dependency-install",
      target: "visual.image-diff-deps",
      status: installResult.ok ? "installed" : "failed",
      evidence: installResult.output,
    });
    if (installResult.ok) {
      return makeCapability("visual.image-diff-deps", "required", "available", "Installed sharp, pngjs, and pixelmatch");
    }
  }
  return makeCapability(
    "visual.image-diff-deps",
    ui ? "required" : "optional",
    "missing",
    `Missing: ${missing.join(", ")}`,
    [],
    ui,
    `Run npm ci in ${toolsDir}`,
  );
}

function ensureAzureDevOpsExtension(required, firstRun, probeOnly, actions) {
  const role = required ? "fallback" : "optional";
  if (!commandExists("az")) {
    return makeCapability(
      "ado.azure-devops-extension",
      role,
      required ? "missing" : "not-applicable",
      "Azure CLI is not installed",
      [],
      false,
      "Install Azure CLI and the Azure DevOps extension",
    );
  }
  const extension = run("az", ["extension", "show", "--name", "azure-devops", "--only-show-errors"]);
  if (extension.ok) {
    return makeCapability("ado.azure-devops-extension", role, "available", "Azure DevOps extension is installed");
  }
  if (required && firstRun && !probeOnly) {
    const installResult = run("az", ["extension", "add", "--name", "azure-devops", "--only-show-errors"]);
    actions.push({
      type: "extension-install",
      target: "azure-devops",
      status: installResult.ok ? "installed" : "failed",
      evidence: installResult.ok ? "Azure DevOps extension installed" : installResult.output,
    });
    if (installResult.ok) {
      return makeCapability("ado.azure-devops-extension", role, "available", "Azure DevOps extension installed");
    }
  }
  return makeCapability(
    "ado.azure-devops-extension",
    role,
    "missing",
    "Azure DevOps extension is missing",
    [],
    false,
    "Run az extension add --name azure-devops",
  );
}

const args = parseArgs(process.argv);
const host = args.get("--host");
const sessionDir = args.get("--session-dir");
const requestFile = args.get("--request-file");
const probeOnly = args.has("--probe-only");
const force = args.has("--force");

if ((host !== "claude" && host !== "copilot") || typeof sessionDir !== "string" || typeof requestFile !== "string") {
  console.error("Usage: agentow-bootstrap --host claude|copilot --session-dir <path> --request-file <path>");
  process.exit(2);
}

const request = fs.existsSync(requestFile) ? fs.readFileSync(requestFile, "utf8") : "";
const taskSignals = {
  ui: UI_PATTERN.test(request),
  figma: FIGMA_PATTERN.test(request),
  ado: ADO_PATTERN.test(request),
  optIn: OPT_IN_PATTERN.test(request),
  killswitch: KILLSWITCH_PATTERN.test(request),
};
const hostProcessIdentity = getHostProcessIdentity(host);
const hostProcessKey = createHash("sha256").update(hostProcessIdentity).digest("hex").slice(0, 16);
const identity = getSessionIdentity(host, hostProcessIdentity);
const sessionKey = createHash("sha256").update(identity).digest("hex").slice(0, 16);
const markerPath = `${os.homedir()}/.cache/agentow/bootstrap-sessions/${sessionKey}.json`;
const existingMarker = readJson(markerPath);
const pendingRestart =
  isPlainObject(existingMarker) &&
  existingMarker.pendingRestart === true &&
  existingMarker.pendingRestartHostKey === hostProcessKey;
const firstRun = force || !fs.existsSync(markerPath) || (isPlainObject(existingMarker) && existingMarker.bootstrapComplete === false);
const actions = [];
const capabilities = [];

capabilities.push(
  makeCapability(
    "core.source-repo",
    "required",
    fs.existsSync(`${ODSP_ROOT}/rush.json`) ? "available" : "missing",
    fs.existsSync(`${ODSP_ROOT}/rush.json`) ? "odsp-web repository found" : "rush.json not found",
    [],
    !fs.existsSync(`${ODSP_ROOT}/rush.json`),
    `Clone odsp-web at ${ODSP_ROOT}`,
  ),
);

const coreCommands = ["node", "git", "rush", "tmux"];
const missingCore = coreCommands.filter((command) => !commandExists(command));
capabilities.push(
  makeCapability(
    "core.rush-node-tmux",
    "required",
    missingCore.length === 0 ? "available" : "missing",
    missingCore.length === 0 ? "node, git, rush, and tmux are available" : `Missing: ${missingCore.join(", ")}`,
    [],
    missingCore.length > 0,
    "Install the missing core command(s)",
  ),
);

if (host === "claude") {
  capabilities.push(ensureClaudeAgentTeams(firstRun, probeOnly, actions));
  capabilities.push(
    makeCapability(
      "host.claude-auto-accept",
      "required",
      "unknown",
      "Claude permission mode is not observable from the bootstrap process",
      [],
      false,
      "Enable auto-accept with Shift+Tab before unattended runs",
    ),
  );
  capabilities.push(makeCapability("host.copilot-auth", "optional", "not-applicable", "Claude host"));
} else {
  const copilotAvailable = commandExists("copilot");
  capabilities.push(
    makeCapability(
      "host.copilot-auth",
      "required",
      copilotAvailable ? "available" : "missing",
      copilotAvailable ? "Bootstrap is running from an authenticated Copilot host" : "Copilot CLI missing",
      [],
      !copilotAvailable,
      "Run copilot auth, then restart Copilot CLI",
    ),
  );
  capabilities.push(makeCapability("host.claude-agent-teams", "optional", "not-applicable", "Copilot host"));
  capabilities.push(makeCapability("host.claude-auto-accept", "optional", "not-applicable", "Copilot host"));
}

capabilities.push(
  ensurePlugin({
    host,
    pluginName: "playwright-mcp-servers",
    id: "browser.playwright-mcp",
    role: taskSignals.ui ? "fallback" : "optional",
    shouldInstall: true,
    firstRun,
    probeOnly,
    actions,
    fallbackIds: ["browser.fic-heft"],
  }),
);
capabilities.push(
  makeCapability(
    "browser.fic-heft",
    taskSignals.ui ? "fallback" : "optional",
    fs.existsSync(`${ODSP_ROOT}/common/config/rush`) && commandExists("rushx") ? "available" : "unknown",
    "FIC availability is finalized after planning selects a Playwright project",
    ["browser.playwright-mcp"],
    false,
    "Run rush install and use a project Playwright harness",
  ),
);
capabilities.push(
  ensurePlugin({
    host,
    pluginName: "odsp-web-mcp-servers-opt-out",
    id: "odsp.mcp-opt-out",
    role: taskSignals.killswitch ? "required" : "optional",
    shouldInstall: true,
    firstRun,
    probeOnly,
    actions,
    fallbackIds: [],
  }),
);
capabilities.push(
  ensurePlugin({
    host,
    pluginName: "code-review-tools",
    id: "review.code-review-tools",
    role: "optional",
    shouldInstall: true,
    firstRun,
    probeOnly,
    actions,
    fallbackIds: ["review.builtin"],
  }),
);
capabilities.push(
  ensurePlugin({
    host,
    pluginName: "odsp-web-mcp-servers-opt-in",
    id: "odsp.mcp-opt-in",
    role: taskSignals.figma || taskSignals.ado || taskSignals.optIn ? "required" : "optional",
    shouldInstall: taskSignals.figma || taskSignals.ado || taskSignals.optIn,
    firstRun,
    probeOnly,
    actions,
    fallbackIds: taskSignals.ado ? ["ado.auth"] : [],
  }),
);

capabilities.push(
  makeCapability(
    "design.figma",
    taskSignals.figma ? "required" : "optional",
    taskSignals.figma && pluginAvailable(host, "odsp-web-mcp-servers-opt-in") ? "unknown" : taskSignals.figma ? "missing" : "not-applicable",
    taskSignals.figma ? "Figma OAuth and file access must be confirmed after the MCP loads" : "No Figma task signal",
    [],
    false,
    "Restart the host after opt-in plugin installation, complete Figma OAuth, or provide exported screenshots/design.md",
  ),
);

const adoExtension = ensureAzureDevOpsExtension(taskSignals.ado, firstRun, probeOnly, actions);
const azAvailable = commandExists("az");
capabilities.push(
  makeCapability(
    "ado.cli",
    taskSignals.ado ? "fallback" : "optional",
    azAvailable ? "available" : taskSignals.ado ? "missing" : "not-applicable",
    azAvailable ? "Azure CLI found" : "Azure CLI missing",
    [],
    false,
    "Install Azure CLI",
  ),
);
capabilities.push(adoExtension);
if (azAvailable) {
  const auth = run("az", ["account", "show", "--output", "none"]);
  const cliFallbackAvailable = auth.ok && adoExtension.status === "available";
  capabilities.push(
    makeCapability(
      "ado.auth",
      taskSignals.ado ? "fallback" : "optional",
      cliFallbackAvailable ? "available" : "misconfigured",
      cliFallbackAvailable ? "Azure DevOps CLI fallback is authenticated and ready" : auth.ok ? "Azure DevOps extension is unavailable" : auth.output,
      [],
      false,
      "Run az login in an interactive terminal",
    ),
  );
} else {
  capabilities.push(
    makeCapability(
      "ado.auth",
      taskSignals.ado ? "fallback" : "optional",
      taskSignals.ado ? "missing" : "not-applicable",
      "Azure CLI authentication is unavailable",
      [],
      false,
      "Install Azure CLI and run az login in an interactive terminal",
    ),
  );
}

capabilities.push(ensureImageDependencies(taskSignals.ui, firstRun, probeOnly, actions));
capabilities.push(
  makeCapability(
    "fixture.playwright-profile",
    taskSignals.ui ? "fallback" : "optional",
    fs.existsSync("/workspaces/.playwright-profile") ? "unknown" : "missing",
    fs.existsSync("/workspaces/.playwright-profile") ? "Playwright profile exists; login freshness is unknown" : "Playwright profile is absent",
    ["browser.fic-heft"],
    false,
    "Open the Playwright browser and sign in to SharePoint if MCP validation is used",
  ),
);
capabilities.push(
  makeCapability(
    "fixture.tenant-site",
    taskSignals.ui ? "fallback" : "optional",
    "unknown",
    "Tenant, site, and fixture eligibility are deferred until planning supplies predicates",
    [],
    false,
    "Evaluator environment discovery will enumerate eligible candidates",
  ),
);
capabilities.push(
  makeCapability(
    "review.superpowers",
    "optional",
    "unknown",
    "No trusted automatic installation source is declared",
    ["review.builtin"],
    false,
    "Install superpowers manually if enhanced brainstorming/review is desired",
  ),
);
capabilities.push(
  makeCapability(
    "context.library",
    "optional",
    fs.existsSync(`${os.homedir()}/.config/agentow/context-libraries.json`) ? "available" : "missing",
    "Context registry presence only; repository credentials are not inspected",
    [],
    false,
    "Configure a context library or continue unlinked",
  ),
);
capabilities.push(
  makeCapability(
    "context.git-permissions",
    "optional",
    "unknown",
    "Push permission is probed only when applying a context update",
    [],
    false,
    "Context failures export a patch and never block product work",
  ),
);

const capabilitiesById = new Map(capabilities.map((capability) => [capability.id, capability]));
let restartRequired = pendingRestart;
let blocked = false;
let setupRequired = false;
for (const capability of capabilities) {
  if (capability.status === "installed-restart-required") {
    restartRequired = true;
  }
  if (capability.blocksPlanning) {
    blocked = true;
  }
  const hasViableFallback = capability.fallbackIds.some((fallbackId) => {
    const fallback = capabilitiesById.get(fallbackId);
    return fallback?.status === "available" || fallback?.status === "installed-restart-required";
  });
  if (
    capability.role === "required" &&
    (capability.status === "missing" || capability.status === "misconfigured") &&
    !hasViableFallback
  ) {
    setupRequired = true;
  }
}

const overall = restartRequired ? "restart-required" : blocked ? "blocked" : setupRequired ? "setup-required" : "ready-with-fallbacks";
const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  host,
  sessionKey,
  firstRunInTerminalSession: firstRun,
  probeOnly,
  taskSignals,
  overall,
  restartRequired,
  capabilities,
  actions,
};

writeJson(`${sessionDir}/capabilities.json`, manifest);
const hasFailedAction = actions.some((action) => action.status === "failed");
if (!probeOnly) {
  writeJson(markerPath, {
    schemaVersion: 1,
    sessionKey,
    host,
    completedAt: manifest.generatedAt,
    bootstrapComplete: !hasFailedAction,
    pendingRestart: restartRequired,
    pendingRestartHostKey: restartRequired ? hostProcessKey : undefined,
    actions: actions.map((action) => ({ type: action.type, target: action.target, status: action.status })),
  });
}
process.stdout.write(`${JSON.stringify(manifest)}\n`);
process.exit(restartRequired ? 20 : blocked ? 21 : setupRequired ? 22 : 0);
