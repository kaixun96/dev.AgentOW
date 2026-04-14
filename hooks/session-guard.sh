#!/usr/bin/env bash
AGENTES_HOOK_INTERVAL="${AGENTES_HOOK_INTERVAL:-10}"
emit_guarded() {
  local session="$1" skill="$2" msg="$3"
  local flag="${TMPDIR:-/tmp}/agentow-${session}-${skill}"
  local count=0
  [ -f "$flag" ] && count=$(cat "$flag")
  if [ "$count" -eq 0 ]; then
    printf '{"systemMessage": "%s"}\n' "$msg"
  fi
  count=$(( count + 1 ))
  if [ "$count" -ge "$AGENTES_HOOK_INTERVAL" ]; then count=0; fi
  printf '%d' "$count" > "$flag"
}
