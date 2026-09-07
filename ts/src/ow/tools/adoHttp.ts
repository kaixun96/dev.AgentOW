import * as cp from "node:child_process";

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const AUTH_CACHE_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 4;
let authorizationCache = new Map<string, { createdAt: number; value: Promise<string> }>();

function exec(command: string, cwd: string, signal?: AbortSignal): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => cp.exec(command, { cwd, signal, maxBuffer: 32 * 1024 * 1024 }, (error, stdout, stderr) => {
    resolve({ exitCode: error?.code ?? 0, stdout: stdout.toString(), stderr: stderr.toString() });
  }));
}

async function resolveAuthorization(cwd: string, signal?: AbortSignal): Promise<string> {
  const token = await exec("az account get-access-token --resource=499b84ac-1321-427f-aa17-267ca6975798 --query accessToken -o tsv", cwd, signal);
  if (token.exitCode === 0 && token.stdout.trim()) return `Bearer ${token.stdout.trim()}`;
  const credential = await exec("printf 'protocol=https\\nhost=onedrive.visualstudio.com\\n\\n' | git credential fill", cwd, signal);
  const password = credential.stdout.split(/\r?\n/).find((line) => line.startsWith("password="))?.slice("password=".length);
  if (credential.exitCode === 0 && password) return `Basic ${Buffer.from(`:${password}`).toString("base64")}`;
  throw new Error(`Failed to authenticate to Azure DevOps.\naz stderr:\n${token.stderr}\n\ngit credential stderr:\n${credential.stderr}`);
}

export function getAdoAuthorizationHeader(cwd: string, signal?: AbortSignal): Promise<string> {
  let cached = authorizationCache.get(cwd);
  if (cached && Date.now() - cached.createdAt > AUTH_CACHE_MS) {
    authorizationCache.delete(cwd);
    cached = undefined;
  }
  if (!cached) {
    const value = resolveAuthorization(cwd, signal);
    cached = { createdAt: Date.now(), value };
    authorizationCache.set(cwd, cached);
    value.catch(() => authorizationCache.delete(cwd));
  }
  return cached.value;
}

export function clearAdoAuthorizationCache(): void {
  authorizationCache = new Map();
}

export function adoRetryDelayMs(response: Response, attempt: number, random: () => number = Math.random): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 120_000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (dateDelay > 0) return Math.min(dateDelay, 120_000);
  }
  const base = Math.min(1000 * (2 ** (attempt - 1)), 30_000);
  return base + Math.floor(random() * Math.min(1000, base / 2));
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
  });
}

export async function fetchAdoWithRetry(input: string | URL, init: RequestInit = {}, options: { fetchImpl?: typeof fetch; sleepImpl?: typeof sleep; random?: () => number; maxAttempts?: number } = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const retryableMethod = method === "GET" || method === "HEAD";
  const attempts = retryableMethod ? options.maxAttempts ?? MAX_ATTEMPTS : 1;
  const fetchImpl = options.fetchImpl ?? fetch;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImpl(input, init);
    } catch (error) {
      if (attempt === attempts || init.signal?.aborted) throw error;
      await (options.sleepImpl ?? sleep)(1000 * (2 ** (attempt - 1)), init.signal ?? undefined);
      continue;
    }
    if (!RETRYABLE_STATUS.has(response.status) || attempt === attempts) return response;
    const delay = adoRetryDelayMs(response, attempt, options.random);
    await response.body?.cancel();
    await (options.sleepImpl ?? sleep)(delay, init.signal ?? undefined);
  }
  throw new Error("Unreachable retry state");
}
