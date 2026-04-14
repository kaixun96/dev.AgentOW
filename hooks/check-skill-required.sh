#!/usr/bin/env bash
skill="$1"
input=$(cat)
session=$(printf '%s' "$input" | jq -r '.session_id // "default"')
source "$(dirname "$0")/session-guard.sh"
emit_guarded "$session" "$skill" \
  "SKILL REQUIRED before using this tool: invoke agentOW:${skill} now to load critical guidance."
