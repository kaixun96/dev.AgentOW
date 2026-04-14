// ── odsp-web constants ────────────────────────────────────────────────────────
export const OW = {
  odspWebRoot: "/workspaces/odsp-web",
  tmuxSession: "agentow",
  rushWindow: "rush",
  rushFailureMarker: "FAILURE:",
  rushWatchingMarker: "[WATCHING]",
  ansiEscapePattern: /\x1b\[[0-9;]*[mGKHF]/g,
} as const;
