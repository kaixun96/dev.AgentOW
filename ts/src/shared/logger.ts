import * as fs from "node:fs";
import * as path from "node:path";

export class FileLogger {
  constructor(private readonly logDir: string, private readonly prefix: string) {}

  log(level: string, category: string, message: string): void {
    const ts = new Date().toISOString();
    const date = ts.slice(0, 10);
    const logPath = path.join(this.logDir, `${this.prefix}-${date}.log`);
    fs.appendFileSync(logPath, `${ts} [${level.toUpperCase()}] ${category}: ${message}\n`, "utf8");
  }

  info(category: string, message: string): void  { this.log("info",  category, message); }
  debug(category: string, message: string): void { this.log("debug", category, message); }
  error(category: string, message: string): void { this.log("error", category, message); }

  close(cb?: () => void): void { cb?.(); }
}

export function purgeLogs(dir: string, maxAgeDays: number): void {
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      purgeLogs(full, maxAgeDays);
    } else if (entry.name.endsWith(".log")) {
      try {
        if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
      } catch { /* ignore */ }
    }
  }
}

export function createLogFile(dir: string, prefix: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ts = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  return path.join(dir, `${ts}-${prefix}.log`);
}

export class RawOutputLog {
  readonly path: string;

  constructor(logDir: string, prefix: string) {
    this.path = createLogFile(logDir, prefix);
  }

  writeLine(line: string): void { fs.appendFileSync(this.path, line + "\n", "utf8"); }
  write(text: string): void     { fs.appendFileSync(this.path, text, "utf8"); }
  end(): void                   {}
}
