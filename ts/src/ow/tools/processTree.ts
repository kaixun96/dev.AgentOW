import * as fs from "node:fs";

const PROCESS_EXIT_POLL_MS = 250;
const BOOT_ID: string = (() => {
  try {
    return fs.readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
  } catch {
    return "";
  }
})();

function readProcessStartTime(pid: number): string {
  try {
    const stat: string = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    const commandEnd: number = stat.lastIndexOf(")");
    if (commandEnd < 0) {
      return "";
    }
    const fields: string[] = stat.slice(commandEnd + 2).split(" ");
    return fields[19] ?? "";
  } catch {
    return "";
  }
}

export function getProcessIdentity(pid: number): string {
  if (pid <= 0) {
    return "";
  }
  const startTime: string = readProcessStartTime(pid);
  if (!startTime) {
    return "";
  }
  return `${BOOT_ID}:${startTime}`;
}

export function getProcessCommandLine(pid: number): string {
  if (pid <= 0) {
    return "";
  }
  try {
    return fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ");
  } catch {
    return "";
  }
}

export function isSameProcess(pid: number, identity: string): boolean {
  return pid > 0 && identity !== "" && getProcessIdentity(pid) === identity;
}

function isProcessGroupAlive(processGroupId: number): boolean {
  try {
    process.kill(-processGroupId, 0);
    return true;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
}

async function waitUntilProcessGroupExited(processGroupId: number, timeoutMs: number): Promise<boolean> {
  const deadline: number = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessGroupAlive(processGroupId)) {
      return true;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, PROCESS_EXIT_POLL_MS));
  }
  return !isProcessGroupAlive(processGroupId);
}

function signalProcessGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      return;
    }
  }
}

export async function terminateProcessGroup(
  pid: number,
  identity: string,
  gracefulTimeoutMs = 10_000,
): Promise<void> {
  if (!isSameProcess(pid, identity)) {
    return;
  }
  signalProcessGroup(pid, "SIGTERM");
  if (await waitUntilProcessGroupExited(pid, gracefulTimeoutMs)) {
    return;
  }
  signalProcessGroup(pid, "SIGKILL");
  if (!(await waitUntilProcessGroupExited(pid, 5_000))) {
    throw new Error(`Process group ${pid} did not exit after SIGKILL.`);
  }
}

export async function terminateNewProcessGroup(pid: number): Promise<void> {
  signalProcessGroup(pid, "SIGKILL");
  if (!(await waitUntilProcessGroupExited(pid, 5_000))) {
    throw new Error(`New process group ${pid} did not exit after SIGKILL.`);
  }
}
