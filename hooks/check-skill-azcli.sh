#!/usr/bin/env bash
input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
session=$(printf '%s' "$input" | jq -r '.session_id // "default"')
source "$(dirname "$0")/session-guard.sh"

if printf '%s' "$cmd" | grep -qiE '\baz (repos|pipelines|devops|rest)\b'; then
  emit_guarded "$session" "ow-dev-pr" \
    "SKILL REMINDER: read agentOW:ow-dev-pr for ADO PR workflow — --draft true (not bare flag), repo ID for odsp-web."
fi
