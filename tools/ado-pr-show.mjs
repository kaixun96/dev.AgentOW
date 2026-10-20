#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
export function isRetryableAdoFailure(text) { return /(?:http\s*429|too many requests|rate limit|throttl|retry-after|http\s*5(?:00|02|03|04)|connection (?:reset|timed out)|operation timed out)/i.test(text); }

function spawnCommand(command, args, { input, env, timeout } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
      timeout,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => resolve({ code: 1, stdout, stderr, error }));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    if (input) child.stdin.end(input);
    else child.stdin.end();
  });
}

function windowsAzCandidates() {
  return [
    path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Microsoft SDKs", "Azure", "CLI2", "python.exe"),
    path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Microsoft SDKs", "Azure", "CLI2", "python.exe"),
    path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Microsoft SDKs", "Azure", "CLI2", "python.exe"),
  ].filter((command) => command && fs.existsSync(command))
    .map((command) => ({ command, argsPrefix: ["-IBm", "azure.cli"] }));
}

async function findAz(run) {
  const probe = await run("az", ["--version"]);
  if (probe.code === 0) return { command: "az", argsPrefix: [] };
  if (process.platform === "win32") {
    for (const candidate of windowsAzCandidates()) {
      if ((await run(candidate.command, [...candidate.argsPrefix, "--version"])).code === 0) return candidate;
    }
  }
  return undefined;
}

export async function installAzureCli(run = spawnCommand) {
  if (process.platform === "win32") {
    return run("winget", [
      "install",
      "--id", "Microsoft.AzureCLI",
      "--exact",
      "--silent",
      "--accept-package-agreements",
      "--accept-source-agreements",
      "--disable-interactivity",
    ]);
  }
  if (process.platform === "darwin") {
    return run("brew", ["install", "azure-cli"]);
  }
  return { code: 1, stdout: "", stderr: "Automatic Azure CLI installation is unsupported on this platform" };
}

async function prepareAzureCli(run) {
  let az = await findAz(run);
  if (!az) {
    await installAzureCli(run);
    az = await findAz(run);
  }
  if (!az) return undefined;

  const extension = await run(az.command, [...az.argsPrefix, "extension", "show", "--name", "azure-devops", "--only-show-errors"]);
  if (extension.code !== 0) {
    const install = await run(az.command, [...az.argsPrefix, "extension", "add", "--name", "azure-devops", "--only-show-errors"]);
    if (install.code !== 0) return undefined;
  }
  return az;
}

async function readWithAzureCli(id, organization, project, run) {
  const az = await prepareAzureCli(run);
  if (!az) return undefined;

  const args = ["repos", "pr", "show", "--id", id, "--org", organization, "--project", project, "--output", "json"];
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const result = await run(az.command, [...az.argsPrefix, ...args]);
    if (result.code === 0) return JSON.parse(result.stdout);
    if (attempt === 4 || !isRetryableAdoFailure(`${result.stdout}\n${result.stderr}`)) return undefined;
    await sleep(Math.min(1000 * (2 ** (attempt - 1)), 30_000));
  }
  return undefined;
}

function parseCredential(output) {
  const values = new Map(
    output.split(/\r?\n/)
      .map((line) => line.match(/^([^=]+)=(.*)$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2]]),
  );
  const username = values.get("username");
  const password = values.get("password");
  return username && password ? { username, password } : undefined;
}

export async function readWithGitCredential(id, organization, project, run = spawnCommand, request = fetch) {
  const organizationUrl = new URL(organization);
  const organizationPath = organizationUrl.pathname.replace(/^\/|\/$/g, "");
  const credential = await run("git", ["credential", "fill"], {
    env: {
      GCM_INTERACTIVE: "Never",
      GIT_TERMINAL_PROMPT: "0",
    },
    input: `url=${organizationUrl.origin}/${organizationPath}\n\n`,
    timeout: 30_000,
  });
  if (credential.code !== 0) return undefined;

  const auth = parseCredential(credential.stdout);
  if (!auth) return undefined;

  const apiUrl = new URL(
    `${organizationUrl.origin}/${organizationPath}/${encodeURIComponent(project)}/_apis/git/pullrequests/${id}`,
  );
  apiUrl.searchParams.set("api-version", "7.1");
  const authorization = Buffer.from(`${auth.username}:${auth.password}`).toString("base64");

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    let response;
    try {
      response = await request(apiUrl, {
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${authorization}`,
        },
      });
    } catch {
      if (attempt === 4) return undefined;
      await sleep(Math.min(1000 * (2 ** (attempt - 1)), 30_000));
      continue;
    }
    if (response.ok) return response.json();
    if (attempt === 4 || (response.status !== 429 && response.status < 500)) return undefined;
    await sleep(Math.min(1000 * (2 ** (attempt - 1)), 30_000));
  }
  return undefined;
}

function value(args, name, fallback) { const index = args.indexOf(name); return index < 0 ? fallback : args[index + 1]; }

export async function main(args = process.argv.slice(2), run = spawnCommand, request = fetch) {
  const id = value(args, "--id");
  const out = value(args, "--out");
  if (!/^\d+$/.test(id ?? "") || !out) throw new Error("Usage: ado-pr-show.mjs --id <number> --out <file>");

  const organization = value(args, "--org", "https://dev.azure.com/onedrive");
  const project = value(args, "--project", "ODSP-Web");
  const pr = await readWithAzureCli(id, organization, project, run)
    ?? await readWithGitCredential(id, organization, project, run, request);
  if (!pr) {
    throw new Error("Unable to read the PR with Azure CLI or the existing Git credentials");
  }

  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(pr, null, 2));
}

const isEntryPoint = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isEntryPoint) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
