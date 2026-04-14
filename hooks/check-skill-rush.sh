#!/usr/bin/env bash
input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
session=$(printf '%s' "$input" | jq -r '.session_id // "default"')
source "$(dirname "$0")/session-guard.sh"

if printf '%s' "$cmd" | grep -qiE '\bgit\b|branch|checkout|merge'; then
  emit_guarded "$session" "ow-dev-git" \
    "SKILL REQUIRED: invoke agentOW:ow-dev-git — branch from main; user/<alias>/<feature> naming."
fi
