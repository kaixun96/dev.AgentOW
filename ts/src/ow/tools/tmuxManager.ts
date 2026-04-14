import * as cp from "node:child_process";
import { OW } from "../../shared/constants.js";
import type { TmuxWindowInfo } from "../../shared/models.js";

function exec(cmd: string, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    cp.exec(cmd, { signal }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

export class TmuxManager {
  private readonly session = OW.tmuxSession;

  async openWindow(windowName: string, signal?: AbortSignal): Promise<string> {
    const target = `${this.session}:${windowName}`;
    const script = [
      `tmux new-session -d -s ${this.session} 2>/dev/null || true`,
      `tmux new-window -t ${this.session} -n ${windowName} -c ${OW.odspWebRoot} 2>/dev/null || tmux select-window -t ${target}`,
    ].join(" && ");
    await exec(script, signal);
    return target;
  }

  async listWindows(signal?: AbortSignal): Promise<TmuxWindowInfo[]> {
    try {
      const out = await exec(
        `tmux list-windows -t ${this.session} -F '#{window_index}:#{window_name}' 2>/dev/null`,
        signal,
      );
      return out.trim().split("\n").filter(Boolean).map((line) => {
        const colon = line.indexOf(":");
        const index = parseInt(line.slice(0, colon), 10);
        const name = line.slice(colon + 1);
        return { index, name, target: `${this.session}:${name}` };
      });
    } catch {
      return [];
    }
  }

  async send(target: string, text: string, pressEnter = true, signal?: AbortSignal): Promise<void> {
    const b64 = Buffer.from(text, "utf8").toString("base64");
    const lines = [
      `_tmp=$(mktemp)`,
      `printf '%s' '${b64}' | base64 -d > "$_tmp"`,
      `tmux load-buffer "$_tmp"`,
      `rm -f "$_tmp"`,
      `tmux paste-buffer -t ${target}`,
    ];
    if (pressEnter) {
      lines.push(`tmux send-keys -t ${target} '' Enter`);
    }
    await exec(lines.join(" && "), signal);
  }

  async capture(target: string, lines = 100, signal?: AbortSignal): Promise<string> {
    const out = await exec(`tmux capture-pane -t ${target} -p -S -${lines}`, signal);
    return out.replace(OW.ansiEscapePattern, "");
  }

  async killWindow(windowName: string, signal?: AbortSignal): Promise<void> {
    await exec(`tmux kill-window -t ${this.session}:${windowName} 2>/dev/null || true`, signal);
  }

  async killSession(signal?: AbortSignal): Promise<void> {
    await exec(`tmux kill-session -t ${this.session} 2>/dev/null || true`, signal);
  }

  async interrupt(target: string, signal?: AbortSignal): Promise<void> {
    await exec(`tmux send-keys -t ${target} '' C-c`, signal);
  }
}
