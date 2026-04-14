/** Shell command output with optional raw log file. */
export interface ShellOutput {
  rawOutputPath: string;
  lines: number;
  truncated: boolean;
  output: string[];
  exitCode?: number;
}

export type DevShellResult = ShellOutput;

/** Rush build output with structured error parsing. */
export interface RushBuildOutput extends ShellOutput {
  durationMs: number;
  durationHuman: string;
  errors: string[];
  warnings: string[];
  project?: string;
}

/** Rush test output with structured results. */
export interface RushTestOutput extends ShellOutput {
  passed: number;
  failed: number;
  skipped: number;
  failures: string[];
  project?: string;
}

export interface TmuxWindowInfo {
  index: number;
  name: string;
  target: string;
}
