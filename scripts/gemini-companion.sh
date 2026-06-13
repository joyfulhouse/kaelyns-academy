#!/usr/bin/env bash
# Resolves the latest installed gemini-companion.mjs and forwards args to it.
# Override with GEMINI_PLUGIN_ROOT=<dir-containing-scripts/> if needed.
set -euo pipefail

if [[ -n "${GEMINI_PLUGIN_ROOT:-}" ]]; then
  root="$GEMINI_PLUGIN_ROOT"
else
  base="$HOME/.claude/plugins/cache/gemini/gemini"
  if [[ ! -d "$base" ]]; then
    echo "gemini-companion: $base not found — install the gemini plugin" >&2
    exit 127
  fi
  root="$(ls -d "$base"/*/ 2>/dev/null | sort -V | tail -n 1 | sed 's,/$,,')"
  if [[ -z "$root" ]]; then
    echo "gemini-companion: no version dirs in $base" >&2
    exit 127
  fi
fi

script="$root/scripts/gemini-companion.mjs"
if [[ ! -f "$script" ]]; then
  echo "gemini-companion: $script not found" >&2
  exit 127
fi

exec node "$script" "$@"
