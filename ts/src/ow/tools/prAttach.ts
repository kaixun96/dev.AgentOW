import * as cp from "node:child_process";
import * as fs from "node:fs/promises";
import { OW } from "../../shared/constants.js";
import type { FileLogger } from "../../shared/logger.js";
import { preparePrDescriptionUpdate } from "./prDescriptionBudget.js";

export interface PrAttachInput {
  prId: number;
  attachments: Array<{
    name: string;        // filename used on ADO, e.g. "before-pr2219557.png"
    localPath: string;   // absolute path to the local PNG
  }>;
  commentMarkdown?: string;     // legacy input: folded into the PR description; never posted as a comment
  appendToDescription?: string; // append to existing PR description (also supports {{name}} placeholders)
}

export interface PrAttachResult {
  prId: number;
  uploaded: Array<{ name: string; url: string }>;
  commentPosted: boolean;
  descriptionUpdated: boolean;
  descriptionPruned: boolean;
  prunedDescriptionSections: string[];
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

async function getAdoAuthorizationHeader(cwd: string, signal?: AbortSignal): Promise<string> {
  const result = await execCmd(
    "az account get-access-token --resource=499b84ac-1321-427f-aa17-267ca6975798 --query accessToken -o tsv",
    cwd,
    signal,
  );
  if (result.exitCode === 0 && result.stdout.trim()) {
    return `Bearer ${result.stdout.trim()}`;
  }

  const credentialResult = await execCmd(
    "printf 'protocol=https\\nhost=onedrive.visualstudio.com\\n\\n' | git credential fill",
    cwd,
    signal,
  );
  const credentialPassword: string | undefined = extractCredentialPassword(credentialResult.stdout);
  if (credentialResult.exitCode === 0 && credentialPassword) {
    return `Basic ${Buffer.from(`:${credentialPassword}`).toString("base64")}`;
  }

  throw new Error(
    `Failed to authenticate to Azure DevOps. Tried 'az account get-access-token' and git credential fill for onedrive.visualstudio.com.\n` +
    `az stderr:\n${result.stderr}\n\n` +
    `git credential stderr:\n${credentialResult.stderr}`,
  );
}

function extractCredentialPassword(credentialOutput: string): string | undefined {
  let position = 0;
  while (position < credentialOutput.length) {
    const nextNewline = credentialOutput.indexOf("\n", position);
    const end = nextNewline === -1 ? credentialOutput.length : nextNewline;
    const line = credentialOutput.slice(position, end);
    if (line.startsWith("password=")) {
      return line.slice("password=".length);
    }
    position = end + 1;
  }
  return undefined;
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
    const authorizationHeader = await getAdoAuthorizationHeader(this.cwd, signal);
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
          "Authorization": authorizationHeader,
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

    // 2. Never post comments from this tool. Legacy callers that still pass
    // commentMarkdown are folded into the description instead.
    let commentPosted = false;

    // 3. Always update the description for screenshots/attachments.
    let descriptionUpdated = false;
    let descriptionPruned = false;
    let prunedDescriptionSections: string[] = [];
    const descriptionAppend = buildDescriptionAppend(input, uploaded);
    if (descriptionAppend) {
      // Fetch current PR to get existing description
      const getUrl = `${baseUrl}?api-version=${API_VERSION}`;
      const getResp = await fetch(getUrl, {
        headers: { "Authorization": authorizationHeader },
        signal,
      });
      if (!getResp.ok) {
        const errBody = await getResp.text();
        throw new Error(`Failed to fetch PR for description update (HTTP ${getResp.status}): ${errBody}`);
      }
      const pr = await getResp.json() as { description?: string };
      const existing = pr.description ?? "";

      const append = replacePlaceholders(descriptionAppend, uploaded);
      const descriptionUpdate = preparePrDescriptionUpdate(existing, append);
      const newDescription = descriptionUpdate.description;
      descriptionPruned = descriptionUpdate.prunedSections.length > 0;
      prunedDescriptionSections = descriptionUpdate.prunedSections;

      const patchResp = await fetch(getUrl, {
        method: "PATCH",
        headers: {
          "Authorization": authorizationHeader,
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
      descriptionPruned,
      prunedDescriptionSections,
    };
  }
}

function buildDescriptionAppend(
  input: PrAttachInput,
  uploaded: Array<{ name: string; url: string }>,
): string | undefined {
  const sections: string[] = [];
  if (input.appendToDescription?.trim()) {
    sections.push(input.appendToDescription.trim());
  }
  if (input.commentMarkdown?.trim()) {
    sections.push(input.commentMarkdown.trim());
  }
  if (sections.length > 0) {
    return sections.join("\n\n");
  }
  if (uploaded.length === 0) {
    return undefined;
  }

  const lines: string[] = ["## Visual Validation Attachments", ""];
  for (const { name } of uploaded) {
    lines.push(`- [${name}]({{${name}}})`);
  }
  return lines.join("\n");
}
