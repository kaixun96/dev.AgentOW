import { OW } from "../../shared/constants.js";
import { fetchAdoWithRetry, getAdoAuthorizationHeader } from "./adoHttp.js";

const ODSP_WEB_REPO_ID = "3829bdd7-1ab6-420c-a8ec-c30955da3205";
const ADO_ORG = "https://dev.azure.com/onedrive";
const ADO_PROJECT = "ODSP-Web";
const API_VERSION = "7.1";
const DEBUG_QUERY_PATTERN: RegExp =
  /\?debug=true&noredir=true&loader=[^`\s]+&debugManifestsFile=[^`\s]+/;

export interface IAdoThreadComment {
  id?: number;
  content?: string;
  author?: { displayName?: string };
}

export interface IAdoThread {
  id?: number;
  comments?: IAdoThreadComment[];
}

export interface IAdoThreadsResponse {
  value?: IAdoThread[];
}

export interface IPrDebugQueryResult {
  prId: number;
  status: "available" | "missing";
  debugQuery?: string;
  threadId?: number;
  commentId?: number;
  author?: string;
  loaderStatus?: number;
  manifestsStatus?: number;
}

function splitDebugQueryUrls(debugQuery: string): { loader?: string; manifests?: string } {
  const query = new URLSearchParams(debugQuery.replace(/^\?/, ""));
  return {
    loader: query.get("loader") ?? undefined,
    manifests: query.get("debugManifestsFile") ?? undefined,
  };
}

async function fetchStatus(url: string | undefined, signal?: AbortSignal): Promise<number | undefined> {
  if (!url) {
    return undefined;
  }
  try {
    const response = await fetchAdoWithRetry(url, { method: "HEAD", signal });
    return response.status;
  } catch {
    return undefined;
  }
}

export class AdoClient {
  constructor(private readonly cwd: string = OW.odspWebRoot) {}

  async getAuthorizationHeader(signal?: AbortSignal): Promise<string> {
    return getAdoAuthorizationHeader(this.cwd, signal);
  }

  async getPullRequestThreads(prId: number, signal?: AbortSignal): Promise<IAdoThread[]> {
    const authorization = await this.getAuthorizationHeader(signal);
    const url =
      `${ADO_ORG}/${ADO_PROJECT}/_apis/git/repositories/${ODSP_WEB_REPO_ID}` +
      `/pullRequests/${prId}/threads?api-version=${API_VERSION}`;
    const response = await fetchAdoWithRetry(url, {
      headers: { "Authorization": authorization },
      signal,
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch PR ${prId} threads (HTTP ${response.status}): ${await response.text()}`);
    }
    const parsed = await response.json() as IAdoThreadsResponse;
    return parsed.value ?? [];
  }

  async getPrDebugQuery(prId: number, signal?: AbortSignal): Promise<IPrDebugQueryResult> {
    const threads = await this.getPullRequestThreads(prId, signal);
    for (const thread of threads) {
      for (const comment of thread.comments ?? []) {
        const content = comment.content ?? "";
        const match = DEBUG_QUERY_PATTERN.exec(content);
        if (match) {
          const debugQuery = match[0];
          const urls = splitDebugQueryUrls(debugQuery);
          const [loaderStatus, manifestsStatus] = await Promise.all([
            fetchStatus(urls.loader, signal),
            fetchStatus(urls.manifests, signal),
          ]);
          return {
            prId,
            status: "available",
            debugQuery,
            threadId: thread.id,
            commentId: comment.id,
            author: comment.author?.displayName,
            loaderStatus,
            manifestsStatus,
          };
        }
      }
    }
    return { prId, status: "missing" };
  }
}
