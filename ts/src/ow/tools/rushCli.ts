import * as cp from "node:child_process";
import * as readline from "node:readline";
import { OW } from "../../shared/constants.js";
import type { FileLogger } from "../../shared/logger.js";

export interface RushResult {
  exitCode: number;
  lines: string[];
  errors: string[];
  warnings: string[];
  durationMs: number;
}

export class RushCli {
  constructor(
    private readonly cwd: string = OW.odspWebRoot,
    private readonly logger?: FileLogger,
  ) {}

  async run(
    args: string[],
    onLine?: (line: string) => void,
    signal?: AbortSignal,
  ): Promise<RushResult> {
    const start = Date.now();
    const lines: string[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    this.logger?.info("rush", `rush ${args.join(" ")}`);

    const exitCode = await new Promise<number>((resolve, reject) => {
      const proc = cp.spawn("rush", args, {
        cwd: this.cwd,
        stdio: ["ignore", "pipe", "pipe"],
        shell: true,
        signal,
      });

      const rl = readline.createInterface({ input: proc.stdout!, crlfDelay: Infinity });
      rl.on("line", (line) => {
        const clean = line.replace(OW.ansiEscapePattern, "");
        lines.push(clean);
        onLine?.(clean);
        if (clean.includes("ERROR") || clean.includes("error TS")) errors.push(clean);
        if (clean.includes("WARNING") || clean.includes("warning")) warnings.push(clean);
      });

      const stderrLines: string[] = [];
      proc.stderr?.on("data", (d: Buffer) => stderrLines.push(d.toString()));

      proc.once("error", reject);
      proc.once("exit", (code) => resolve(code ?? 1));
    });

    return { exitCode, lines, errors, warnings, durationMs: Date.now() - start };
  }

  async build(project?: string, signal?: AbortSignal): Promise<RushResult> {
    const args = ["build"];
    if (project) args.push("-t", project);
    return this.run(args, undefined, signal);
  }

  async test(project?: string, testPattern?: string, signal?: AbortSignal): Promise<RushResult> {
    const args = ["test"];
    if (project) args.push("-t", project);
    if (testPattern) args.push(`--test-path-pattern="${testPattern}"`);
    return this.run(args, undefined, signal);
  }

  async update(signal?: AbortSignal): Promise<RushResult> {
    return this.run(["update"], undefined, signal);
  }

  async install(signal?: AbortSignal): Promise<RushResult> {
    return this.run(["install"], undefined, signal);
  }
}
