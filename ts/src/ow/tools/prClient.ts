import * as cp from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { OW } from "../../shared/constants.js";
import type { FileLogger } from "../../shared/logger.js";

export interface PrCreateInput {
  title: string;
  description: string;
  targetBranch?: string;
  draft?: boolean;
  workItems?: string;
}

export interface PrCreateResult {
  prId: number;
  prUrl: string;
  branch: string;
  draft: boolean;
}

const BRANCH_PATTERN = /^user\/[^/]+\/[^/]+$/;
const ODSP_WEB_REPO_ID = "3829bdd7-1ab6-420c-a8ec-c30955da3205";
const ADO_ORG = "https://dev.azure.com/onedrive";
const ADO_PROJECT = "ODSP-Web";

function execCmd(cmd: string, cwd: string, signal?: AbortSignal): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = cp.exec(cmd, { cwd, signal }, (err, stdout, stderr) => {
      if (err && err.killed) { reject(new Error("Aborted")); return; }
      resolve({ exitCode: err?.code ?? 0, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

export class PrClient {
  constructor(
    private readonly cwd: string = OW.odspWebRoot,
    private readonly logger?: FileLogger,
  ) {}

  async createPr(input: PrCreateInput, signal?: AbortSignal): Promise<PrCreateResult> {
    // 1. Get current branch
    const branchResult = await execCmd("git rev-parse --abbrev-ref HEAD", this.cwd, signal);
    if (branchResult.exitCode !== 0) {
      throw new Error(`Failed to get current branch: ${branchResult.stderr}`);
    }
    const branch = branchResult.stdout;

    // 2. Validate branch name
    if (!BRANCH_PATTERN.test(branch)) {
      throw new Error(
        `Branch '${branch}' does not match required pattern 'user/<alias>/<feature>'. ` +
        `Create a properly named branch first.`
      );
    }

    this.logger?.info("pr-create", `branch=${branch}, pushing...`);

    // 3. Push
    const pushResult = await execCmd(`git push -u origin ${branch}`, this.cwd, signal);
    if (pushResult.exitCode !== 0) {
      throw new Error(`git push failed: ${pushResult.stderr}`);
    }
    this.logger?.info("pr-create", `pushed ${branch}`);

    // 4. Create PR — write description to a tmp file so newlines survive shell quoting.
    // (JSON.stringify on a multi-line string emits literal \n inside double quotes,
    //  which az CLI then passes verbatim to ADO and the markdown renderer treats
    //  the whole body as one line. Using `@<file>` keeps real newlines.)
    const target = input.targetBranch ?? "main";
    const draft = input.draft ?? true;

    const descFile = path.join(os.tmpdir(), `ow-pr-desc-${Date.now()}.md`);
    fs.writeFileSync(descFile, input.description, "utf8");

    const azArgs = [
      "az", "repos", "pr", "create",
      "--repository", ODSP_WEB_REPO_ID,
      "--source-branch", branch,
      "--target-branch", target,
      "--title", JSON.stringify(input.title),
      "--description", `@${descFile}`,
      "--draft", String(draft),
      "--org", ADO_ORG,
      "--project", ADO_PROJECT,
      "--output", "json",
    ];
    if (input.workItems) {
      azArgs.push("--work-items", input.workItems);
    }

    const azCmd = azArgs.join(" ");
    this.logger?.info("pr-create", `running: ${azCmd.slice(0, 200)}`);

    let prResult: Awaited<ReturnType<typeof execCmd>>;
    try {
      prResult = await execCmd(azCmd, this.cwd, signal);
    } finally {
      try { fs.unlinkSync(descFile); } catch { /* ignore */ }
    }
    if (prResult.exitCode !== 0) {
      throw new Error(
        `az repos pr create failed (exit ${prResult.exitCode}):\n${prResult.stderr}\n\n` +
        `Make sure 'az' is installed and authenticated:\n` +
        `  az extension add --name azure-devops\n` +
        `  az login\n`
      );
    }

    // 5. Parse output
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(prResult.stdout);
    } catch {
      throw new Error(`Failed to parse az output as JSON:\n${prResult.stdout}`);
    }

    const prId = parsed.pullRequestId as number;
    const prUrl = `${ADO_ORG}/${ADO_PROJECT}/_git/odsp-web/pullrequest/${prId}`;

    this.logger?.info("pr-create", `PR #${prId} created: ${prUrl}`);

    return { prId, prUrl, branch, draft };
  }
}
