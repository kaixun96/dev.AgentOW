import { OW } from "../../shared/constants.js";
import type { FileLogger } from "../../shared/logger.js";
import { fetchAdoWithRetry, getAdoAuthorizationHeader } from "./adoHttp.js";
import { attachPrEvidence } from "./shared-a11y/ado-attachments.mjs";
import type { AttachmentInput, AttachmentResult } from "./shared-a11y/ado-attachments.mjs";

export type PrAttachInput = AttachmentInput;
export type PrAttachResult = AttachmentResult;

export class PrAttach {
  constructor(
    private readonly cwd: string = OW.odspWebRoot,
    private readonly logger?: FileLogger,
  ) {}

  async attach(input: PrAttachInput, signal?: AbortSignal): Promise<PrAttachResult> {
    return attachPrEvidence({
      organization: "https://dev.azure.com/onedrive",
      project: "ODSP-Web",
      repositoryId: "3829bdd7-1ab6-420c-a8ec-c30955da3205",
      authorization: await getAdoAuthorizationHeader(this.cwd, signal),
    }, input, {
      signal,
      readFetch: fetchAdoWithRetry,
      log: (message: string) => this.logger?.info("pr-attach", message),
    });
  }
}
