import * as cp from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

export interface Finding {
  rule: string;
  severity: "tier1";
  doc: string;
  file: string;
  line: number;
  col: number;
  message: string;
  [extra: string]: unknown;
}

export interface LintInput {
  prId?: number;
  commitSha?: string; // when set with prId, read changed files at this commit instead of lastMergeSourceCommit. Useful for re-evaluating after a local fix commit.
  files?: string[]; // absolute paths; bypass PR fetch when set
  localDiff?: { baseRef?: string; headRef?: string }; // pre-PR mode: enumerate changed .tsx/.scss between two local refs, lint files at headRef. Defaults: baseRef='origin/main', headRef='HEAD'.
}

export interface LintResult {
  prId?: number;
  mode?: "files" | "pr" | "localDiff";
  baseRef?: string;
  headRef?: string;
  scanned: string[];
  findings: Finding[];
  count: number;
}

const ADO_REPO_ID = "3829bdd7-1ab6-420c-a8ec-c30955da3205";
const ADO_API = "https://dev.azure.com/onedrive/ODSP-Web/_apis/git/repositories";
const API_VERSION = "7.0";

const RULES = {
  BUNDLEICON:   { id: "spds-button-bundleicon-required", doc: "docs/replace-component-recipe.md#C2.5.1" },
  HARDCODE:     { id: "spds-no-hardcoded-style-values",  doc: "docs/replace-component-recipe.md#C0-rule2" },
  SCSS_LEAK:    { id: "spds-no-fui-var-in-scss",         doc: "docs/replace-component-recipe.md#C4" },
  EXPERIMENTAL: { id: "spds-no-experimental-import",     doc: "docs/replace-component-recipe.md#forbidden" },
} as const;

function exec(cmd: string, signal?: AbortSignal): Promise<{ stdout: string; exitCode: number }> {
  return new Promise((resolve) => {
    cp.exec(cmd, { signal, maxBuffer: 32 * 1024 * 1024 }, (err, stdout) =>
      resolve({ stdout: stdout.toString(), exitCode: err?.code ?? 0 }),
    );
  });
}

async function adoToken(signal?: AbortSignal): Promise<string> {
  const r = await exec(
    "az account get-access-token --resource=499b84ac-1321-427f-aa17-267ca6975798 --query accessToken -o tsv",
    signal,
  );
  const token = r.stdout.trim();
  if (!token) throw new Error("Failed to acquire ADO token. Run `az login` for the Microsoft tenant.");
  return token;
}

async function curlJson<T>(url: string, token: string, signal?: AbortSignal): Promise<T> {
  const r = await exec(`curl -sL -H "Authorization: Bearer ${token}" "${url}"`, signal);
  return JSON.parse(r.stdout) as T;
}

interface AdoPr { lastMergeSourceCommit?: { commitId: string }; lastMergeTargetCommit?: { commitId: string }; }
interface AdoChange { item: { path: string; isFolder?: boolean }; }
interface AdoCommitChanges { changes?: AdoChange[]; }

async function fetchPrChangedFiles(prId: number, signal?: AbortSignal): Promise<{ sourceSha: string; files: string[] }> {
  const token = await adoToken(signal);
  const pr = await curlJson<AdoPr>(`${ADO_API}/${ADO_REPO_ID}/pullRequests/${prId}?api-version=${API_VERSION}`, token, signal);
  const sourceSha = pr.lastMergeSourceCommit?.commitId;
  if (!sourceSha) throw new Error(`PR ${prId}: no lastMergeSourceCommit`);
  const changes = await curlJson<AdoCommitChanges>(
    `${ADO_API}/${ADO_REPO_ID}/commits/${sourceSha}/changes?api-version=${API_VERSION}`,
    token, signal,
  );
  const files = (changes.changes ?? [])
    .filter((c) => !c.item.isFolder && /\.(tsx?|scss)$/.test(c.item.path))
    .map((c) => c.item.path);
  return { sourceSha, files };
}

async function readLocalFileAtCommit(repoRoot: string, repoPath: string, sha: string, signal?: AbortSignal): Promise<string | null> {
  const relPath = repoPath.replace(/^\//, "");
  const r = await exec(`git -C "${repoRoot}" show "${sha}:${relPath}"`, signal);
  if (r.exitCode !== 0) return null;
  return r.stdout;
}

async function localDiffChangedFiles(repoRoot: string, baseRef: string, headRef: string, signal?: AbortSignal): Promise<string[]> {
  // Use diff --name-only with merge-base semantics (three-dot) so we only see what the branch added vs base.
  const r = await exec(`git -C "${repoRoot}" diff --name-only "${baseRef}...${headRef}"`, signal);
  if (r.exitCode !== 0) {
    throw new Error(`git diff failed: baseRef=${baseRef} headRef=${headRef}\n${r.stdout}`);
  }
  return r.stdout
    .split("\n")
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && /\.(tsx?|scss)$/.test(p))
    .map((p) => "/" + p); // normalize to leading slash to match PR-mode paths
}

async function fetchFileAt(repoPath: string, sha: string, token: string, signal?: AbortSignal): Promise<string> {
  const url = `${ADO_API}/${ADO_REPO_ID}/items?path=${encodeURIComponent(repoPath)}&versionDescriptor.version=${sha}&versionDescriptor.versionType=commit&api-version=${API_VERSION}`;
  const r = await exec(`curl -sL -H "Authorization: Bearer ${token}" "${url}"`, signal);
  return r.stdout;
}

// ── lint rules ───────────────────────────────────────────────────────────────

function pushFinding(out: Finding[], rule: typeof RULES[keyof typeof RULES], file: string, line: number, col: number, message: string, extra: Record<string, unknown> = {}): void {
  out.push({ rule: rule.id, severity: "tier1", doc: rule.doc, file, line, col, message, ...extra });
}

function lintTsFile(filePath: string, text: string, out: Finding[]): void {
  const lines = text.split("\n");

  // Rule 1: bundleIcon required inside Button icon slot
  const bundled = new Set<string>();
  for (const line of lines) {
    const m = line.match(/\bconst\s+([A-Z]\w*)\s*(?::[^=]+)?=\s*bundleIcon\s*\(/);
    if (m) bundled.add(m[1]);
  }
  const iconRe = /icon=\{\s*<\s*([A-Z]\w*(?:Regular|Filled))\s*\/?\s*>/g;
  for (let i = 0; i < lines.length; i++) {
    let m: RegExpExecArray | null;
    while ((m = iconRe.exec(lines[i])) !== null) {
      const icon = m[1];
      if (!bundled.has(icon)) {
        const base = icon.replace(/Regular$|Filled$/, "");
        pushFinding(out, RULES.BUNDLEICON, filePath, i + 1, m.index + 1,
          `Icon <${icon}/> used directly inside a Button icon slot. Wrap with bundleIcon(${base}Filled, ${base}Regular).`,
          { icon, fixHint: `const ${base}Icon = bundleIcon(${base}Filled, ${base}Regular);` });
      }
    }
  }

  // Rule 4: experimental import
  for (let i = 0; i < lines.length; i++) {
    if (/@msinternal\/sharepoint-ui-react[^'"`\s]*\/experimental/.test(lines[i])) {
      pushFinding(out, RULES.EXPERIMENTAL, filePath, i + 1, 1,
        `Forbidden import from sharepoint-ui-react experimental subpath. Use the stable umbrella.`);
    }
  }

  // Rule 2: hardcoded style values inside makeStyles({...})
  let idx = 0;
  while (idx < text.length) {
    const start = text.indexOf("makeStyles(", idx);
    if (start === -1) break;
    const braceStart = text.indexOf("{", start);
    if (braceStart === -1) break;
    let depth = 0, j = braceStart;
    for (; j < text.length; j++) {
      if (text[j] === "{") depth++;
      else if (text[j] === "}") { depth--; if (depth === 0) { j++; break; } }
    }
    const body = text.slice(braceStart, j);
    const bodyStartLine = text.slice(0, braceStart).split("\n").length;
    const bodyLines = body.split("\n");
    const hardRe = /:\s*['"`]([^'"`]*?(?:#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|\d+(?:\.\d+)?(?:px|em|rem))[^'"`]*?)['"`]/g;
    for (let k = 0; k < bodyLines.length; k++) {
      let m: RegExpExecArray | null;
      while ((m = hardRe.exec(bodyLines[k])) !== null) {
        pushFinding(out, RULES.HARDCODE, filePath, bodyStartLine + k, m.index + 1,
          `Hardcoded style value "${m[1]}" inside makeStyles. Use tokens.* / typographyStyles.*.`,
          { value: m[1] });
      }
    }
    idx = j;
  }
}

function lintScssFile(filePath: string, text: string, out: Finding[]): void {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/(--fui-[A-Za-z0-9-]+)\s*:/);
    if (m) {
      pushFinding(out, RULES.SCSS_LEAK, filePath, i + 1, (m.index ?? 0) + 1,
        `Fluent v9 CSS variable ${m[1]} declared in .scss. Move to a Griffel makeStyles hook attached only to the v9 element (§C4).`,
        { var: m[1] });
    }
  }
}

function lintOne(filePath: string, text: string, out: Finding[]): void {
  if (filePath.endsWith(".scss")) lintScssFile(filePath, text, out);
  else if (/\.tsx?$/.test(filePath)) lintTsFile(filePath, text, out);
}

// ── public API ───────────────────────────────────────────────────────────────

export async function runRecipeLint(input: LintInput, signal?: AbortSignal): Promise<LintResult> {
  const findings: Finding[] = [];
  const scanned: string[] = [];
  const repoRoot = "/workspaces/odsp-web";

  if (input.files && input.files.length > 0) {
    for (const f of input.files) {
      const text = await fs.readFile(f, "utf8");
      scanned.push(f);
      lintOne(f, text, findings);
    }
    return { mode: "files", scanned, findings, count: findings.length };
  }

  if (input.localDiff) {
    const baseRef = input.localDiff.baseRef ?? "origin/main";
    const headRef = input.localDiff.headRef ?? "HEAD";
    const files = await localDiffChangedFiles(repoRoot, baseRef, headRef, signal);
    for (const repoPath of files) {
      const text = await readLocalFileAtCommit(repoRoot, repoPath, headRef, signal);
      if (text == null) continue; // file deleted at headRef — skip silently
      scanned.push(repoPath);
      lintOne(repoPath, text, findings);
    }
    return { mode: "localDiff", baseRef, headRef, scanned, findings, count: findings.length };
  }

  if (input.prId == null) throw new Error("ow-recipe-lint requires one of: prId, files[], or localDiff");

  const { sourceSha, files } = await fetchPrChangedFiles(input.prId, signal);
  const overrideSha = input.commitSha;
  const token = await adoToken(signal);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `recipe-lint-pr${input.prId}-`));

  for (const repoPath of files) {
    let text: string | null = null;
    if (overrideSha) {
      // Try local git first for the override commit. Fall back to ADO only if the commit isn't in local repo.
      text = await readLocalFileAtCommit(repoRoot, repoPath, overrideSha, signal);
      if (text == null) {
        text = await fetchFileAt(repoPath, overrideSha, token, signal);
      }
    } else {
      text = await fetchFileAt(repoPath, sourceSha, token, signal);
    }
    const localPath = path.join(tmpDir, repoPath.replace(/^\//, "").replace(/\//g, "__"));
    await fs.writeFile(localPath, text);
    scanned.push(repoPath);
    lintOne(repoPath, text, findings);
  }

  return { mode: "pr", prId: input.prId, scanned, findings, count: findings.length };
}
