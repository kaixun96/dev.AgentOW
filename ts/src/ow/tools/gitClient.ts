import * as cp from "node:child_process";
import { OW } from "../../shared/constants.js";

export interface GitResult {
  exitCode: number;
  output: string;
}

export class GitClient {
  constructor(private readonly cwd: string = OW.odspWebRoot) {}

  async run(args: string[], signal?: AbortSignal): Promise<GitResult> {
    return new Promise((resolve, reject) => {
      const proc = cp.spawn("git", args, {
        cwd: this.cwd,
        stdio: ["ignore", "pipe", "pipe"],
        signal,
      });
      const out: Buffer[] = [];
      proc.stdout.on("data", (d: Buffer) => out.push(d));
      proc.stderr.on("data", (d: Buffer) => out.push(d));
      proc.once("error", reject);
      proc.once("exit", (code) => {
        resolve({ exitCode: code ?? 1, output: Buffer.concat(out).toString("utf8").trim() });
      });
    });
  }

  async status(signal?: AbortSignal): Promise<GitResult> {
    return this.run(["status", "--short"], signal);
  }

  async branch(signal?: AbortSignal): Promise<string> {
    const r = await this.run(["rev-parse", "--abbrev-ref", "HEAD"], signal);
    return r.output.trim();
  }

  async diff(base?: string, signal?: AbortSignal): Promise<GitResult> {
    const args = base ? ["diff", `${base}...HEAD`, "--stat"] : ["diff", "--stat"];
    return this.run(args, signal);
  }

  async createBranch(name: string, base = "origin/main", signal?: AbortSignal): Promise<GitResult> {
    return this.run(["checkout", "-b", name, base], signal);
  }

  async fetchOrigin(signal?: AbortSignal): Promise<GitResult> {
    return this.run(["fetch", "origin"], signal);
  }
}
