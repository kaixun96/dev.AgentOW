#!/usr/bin/env bash
input=$(cat)
session=$(printf '%s' "$input" | jq -r '.session_id // "default"')
rm -f "${TMPDIR:-/tmp}"/agentow-"${session}"-*
