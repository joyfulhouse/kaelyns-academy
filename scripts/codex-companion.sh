#!/usr/bin/env bash
# Resolves the latest installed codex-companion.mjs and forwards args to it.
# Override with CODEX_PLUGIN_ROOT=<dir-containing-scripts/> if needed.
set -euo pipefail

if [[ -n "${CODEX_PLUGIN_ROOT:-}" ]]; then
  root="$CODEX_PLUGIN_ROOT"
else
  base="$HOME/.claude/plugins/cache/openai-codex/codex"
  if [[ ! -d "$base" ]]; then
    echo "codex-companion: $base not found — install the openai-codex plugin" >&2
    exit 127
  fi
  # Pick highest semver-sorted version directory (e.g. 1.0.4 > 1.0.1)
  root="$(ls -d "$base"/*/ 2>/dev/null | sort -V | tail -n 1 | sed 's,/$,,')"
  if [[ -z "$root" ]]; then
    echo "codex-companion: no version dirs in $base" >&2
    exit 127
  fi
fi

script="$root/scripts/codex-companion.mjs"
if [[ ! -f "$script" ]]; then
  echo "codex-companion: $script not found" >&2
  exit 127
fi

exec node "$script" "$@"
