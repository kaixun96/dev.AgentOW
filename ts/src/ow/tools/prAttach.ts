import * as cp from "node:child_process";
import * as fs from "node:fs/promises";
import { OW } from "../../shared/constants.js";
import type { FileLogger } from "../../shared/logger.js";

export interface PrAttachInput {
  prId: number;
  attachments: Array<{
    name: string;        // filename used on ADO, e.g. "before-pr2219557.png"
    localPath: string;   // absolute path to the local PNG
  }>;
  commentMarkdown?: string;     // post as a new PR comment; use {{name}} placeholders for attachments
  appendToDescription?: string; // append to existing PR description (also supports {{name}} placeholders)
}

export interface PrAttachResult {
  prId: number;
  uploaded: Array<{ name: string; url: string }>;
  commentPosted: boolean;
  descriptionUpdated: boolean;
}

const ODSP_WEB_REPO_ID = "3829bdd7-1ab6-420c-a8ec-c30955da3205";
const ADO_ORG = "https://dev.azure.com/onedrive";
const ADO_PROJECT = "ODSP-Web";
const API_VERSION = "7.0";

function execCmd(cmd: string, cwd: string, signal?: AbortSignal): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = cp.exec(cmd, { cwd, signal, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ exitCode: err?.code ?? 0, stdout: stdout.toString(), stderr: stderr.toString() });
    });
  });
}

async function getAdoToken(signal?: AbortSignal): Promise<string> {
  const result = await execCmd(
    "az account get-access-token --resource=499b84ac-1321-427f-aa17-267ca6975798 --query accessToken -o tsv",
    process.cwd(),
    signal,
  );
  if (result.exitCode !== 0 || !result.stdout.trim()) {
    throw new Error(
      `Failed to get ADO access token via 'az account get-access-token'. Ensure you have run 'az login' for the Microsoft tenant.\n${result.stderr}`,
    );
  }
  return result.stdout.trim();
}

function replacePlaceholders(text: string, uploaded: Array<{ name: string; url: string }>): string {
  let out = text;
  for (const { name, url } of uploaded) {
    out = out.split(`{{${name}}}`).join(url);
  }
  return out;
}

export class PrAttach {
  constructor(
    private readonly cwd: string = OW.odspWebRoot,
    private readonly logger?: FileLogger,
  ) {}

  async attach(input: PrAttachInput, signal?: AbortSignal): Promise<PrAttachResult> {
    const token = await getAdoToken(signal);
    const baseUrl = `${ADO_ORG}/${ADO_PROJECT}/_apis/git/repositories/${ODSP_WEB_REPO_ID}/pullRequests/${input.prId}`;

    // 1. Upload each attachment
    const uploaded: Array<{ name: string; url: string }> = [];
    for (const att of input.attachments) {
      const fileData = await fs.readFile(att.localPath);
      this.logger?.info("pr-attach", `uploading ${att.name} (${fileData.byteLength} bytes) to PR #${input.prId}`);

      const uploadUrl = `${baseUrl}/attachments/${encodeURIComponent(att.name)}?api-version=${API_VERSION}`;
      const resp = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/octet-stream",
        },
        body: new Uint8Array(fileData),
        signal,
      });

      if (!resp.ok) {
        const errBody = await resp.text();
        throw new Error(`Failed to upload attachment '${att.name}' (HTTP ${resp.status}): ${errBody}`);
      }

      const parsed = await resp.json() as { url?: string };
      const url = parsed.url;
      if (!url) {
        throw new Error(`ADO did not return a URL for attachment '${att.name}'. Response: ${JSON.stringify(parsed)}`);
      }
      uploaded.push({ name: att.name, url });
      this.logger?.info("pr-attach", `uploaded ${att.name} -> ${url}`);
    }

    // 2. Optionally post a comment thread
    let commentPosted = false;
    if (input.commentMarkdown) {
      const content = replacePlaceholders(input.commentMarkdown, uploaded);
      const threadUrl = `${baseUrl}/threads?api-version=${API_VERSION}`;
      const resp = await fetch(threadUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          comments: [{ parentCommentId: 0, content, commentType: 1 }],
          status: 1, // active
        }),
        signal,
      });
      if (!resp.ok) {
        const errBody = await resp.text();
        throw new Error(`Failed to post PR comment (HTTP ${resp.status}): ${errBody}`);
      }
      commentPosted = true;
      this.logger?.info("pr-attach", `comment posted on PR #${input.prId}`);
    }

    // 3. Optionally update description
    let descriptionUpdated = false;
    if (input.appendToDescription) {
      // Fetch current PR to get existing description
      const getUrl = `${baseUrl}?api-version=${API_VERSION}`;
      const getResp = await fetch(getUrl, {
        headers: { "Authorization": `Bearer ${token}` },
        signal,
      });
      if (!getResp.ok) {
        const errBody = await getResp.text();
        throw new Error(`Failed to fetch PR for description update (HTTP ${getResp.status}): ${errBody}`);
      }
      const pr = await getResp.json() as { description?: string };
      const existing = pr.description ?? "";

      const append = replacePlaceholders(input.appendToDescription, uploaded);
      const newDescription = existing.trim() + "\n\n" + append;

      const patchResp = await fetch(getUrl, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ description: newDescription }),
        signal,
      });
      if (!patchResp.ok) {
        const errBody = await patchResp.text();
        throw new Error(`Failed to update PR description (HTTP ${patchResp.status}): ${errBody}`);
      }
      descriptionUpdated = true;
      this.logger?.info("pr-attach", `description updated on PR #${input.prId}`);
    }

    return {
      prId: input.prId,
      uploaded,
      commentPosted,
      descriptionUpdated,
    };
  }
}
