#!/usr/bin/env bash
#
# merge-ready.sh — Attestation + validation for the pre-merge gate.
#
# Why this exists:
#   The pre-merge hook (.claude/hooks/pr-merge-guard.sh) used to check for a
#   single .merge-ready file, which `touch` could fabricate. That bypass
#   shipped unreviewed code to prod. This script
#   replaces the sentinel with stamped per-worktree attestations validated
#   against the PR branch's current HEAD.
#
# Adapted from askcv.ai/scripts/merge-ready.sh — askcv-specific structural
# guards (entity-disclosure, web-research-boundary, product-email-direct-send)
# removed. Those reference askcv.ai architecture not present here. This script
#   replaces the sentinel with stamped per-worktree attestations validated
#   against the PR branch's current HEAD.
#
# Subcommands:
#   attest <reviewer> [flags]     # Record that a reviewer ran (called from subagents)
#   check  --pr <num>             # Validate a PR's attestations before merge
#   status [--pr <num>]           # Show attestation state (diagnostic)
#   reset                         # Clear the current worktree's attestations
#
# Reviewers:
#   Always required:        simplifier | opus | codex | build | docs | knip
#   Conditionally required: impeccable (only when the PR diff touches frontend —
#                           any *.tsx/*.css/*.scss file or any src/components/
#                           or src/app/(app|marketing|public|auth|admin|embed)/
#                           or src/templates/ path. Driven by the impeccable
#                           design-system skill at .claude/skills/impeccable/.)
#   Advisory (never block): gemini
#
# Attestation file format (.merge-ready/<reviewer>):
#   attestor=<name>
#   head=<git-sha>
#   status=<pending|clean|findings-fixed|no-op|advisory|skipped-no-frontend>
#   timestamp=<iso8601>
#   commit=<git-sha>            # optional — set by simplifier when it committed
#
# Status `pending` means: reviewer is in-flight, do NOT merge yet. The
# `check` command rejects PRs with any reviewer at status=pending. This
# is the fix for the round-4 work-loss pattern: reviewers that intend to
# iterate multiple rounds must stamp `pending` at the start of EACH round
# and re-stamp the final status only when truly done iterating. Without
# `pending`, an early round-1 attestation could be treated as final by
# the orchestrator while the agent kept pushing fixes that got stranded
# on a closed branch. See PR #1645 / #1647 for the incident.
#
# Usage examples:
#   bash scripts/merge-ready.sh attest simplifier --status no-op
#   bash scripts/merge-ready.sh attest opus --status clean
#   bash scripts/merge-ready.sh attest codex --status findings-fixed
#   bash scripts/merge-ready.sh attest build
#   bash scripts/merge-ready.sh attest docs --status updated
#   bash scripts/merge-ready.sh attest impeccable --status clean        # ran impeccable critique, no findings
#   bash scripts/merge-ready.sh attest impeccable --status findings-fixed
#   bash scripts/merge-ready.sh attest impeccable --status skipped-no-frontend  # PR diff did not touch frontend
#   bash scripts/merge-ready.sh attest knip --status clean         # bun run audit:dead-code exited 0
#   bash scripts/merge-ready.sh attest knip --status findings-fixed
#   bash scripts/merge-ready.sh check --pr 1191
#   bash scripts/merge-ready.sh status --pr 1191
#   bash scripts/merge-ready.sh reset
#
# The `docs` attestor records that the author reviewed the PR's surface
# against the architecture docs index (`docs/architecture/COMPONENTS.md`,
# `lib.md`, `data-layer.md`, `ui.md`, `patterns.md`, plus `BACKEND.md` /
# `FRONTEND.md` / `STRUCTURE.md` when relevant) and either updated the
# affected docs or confirmed no update was needed. Valid statuses:
#   updated   — docs were changed in this PR
#   no-op     — PR surface did not add a new module/helper/route
#   deferred  — documented TODO in docs/claude/ with owner + date
#
# The `impeccable` attestor records that the impeccable design-system
# skill ran a critique against the PR's frontend changes. Required iff
# the diff touches frontend paths. Valid statuses:
#   clean                  — impeccable critique returned no findings
#   findings-fixed         — findings raised; addressed; re-critiqued clean
#   skipped-no-frontend    — PR diff did not touch frontend paths (gate auto-passes)
#
# The `knip` attestor records that `bun run audit:dead-code` ran against
# the worktree HEAD with zero findings. Wired up in Sprint 5 / PR 6 after
# the prior cleanup PRs drove `main` to a clean knip baseline. The status
# is a closed enum so the gate distinguishes "audit ran clean" from
# "findings were raised and the author fixed them" — both pass, but the
# distinction is preserved for telemetry. Freshness window matches `build`
# (30 minutes) because knip findings drift after subsequent edits and the
# cost of re-running is low (~10–30s with `--cache`). Valid statuses:
#   clean           — bun run audit:dead-code exited 0 on the first try
#   findings-fixed  — findings raised; deleted/demoted; re-ran clean

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKTREE_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
READY_DIR="${WORKTREE_ROOT}/.merge-ready"
LOG_FILE="${REPO_ROOT}/.claude/logs/merge-gate.jsonl"

# The TRUSTED repo root — the MAIN worktree, where the merge gate
# (.claude/hooks/pr-merge-guard.sh) runs. All linked worktrees share one
# `.git` directory; `--git-common-dir` resolves to the MAIN worktree's `.git`,
# whose parent is the main worktree root. This is the same resolution pattern
# DEPLOY.md uses for the deploy lock. Used by cmd_check to run trusted copies
# of mechanical guards against a PR worktree's files (so a PR cannot bypass a
# guard by neutering its OWN copy). Empty if not inside a git repo.
MAIN_ROOT="$(git_common_dir="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)"; [[ -n "$git_common_dir" ]] && (cd "${git_common_dir}/.." && pwd) || true)"

REQUIRED_REVIEWERS=(simplifier opus codex build docs knip)
CONDITIONAL_REVIEWERS=(impeccable)   # required iff PR diff touches frontend
ADVISORY_REVIEWERS=(gemini)

# Freshness window per reviewer (seconds). Returns the number of seconds
# before the attestation should be considered expired, or empty string if
# the reviewer doesn't have a freshness window. `build` and `knip` both
# run against the on-disk source tree, so a stale attestation is meaningless
# once the tree has changed underneath it.
#
# Implemented as a function (not an associative array) because the script
# must run on macOS's bundled bash 3.2, which lacks `declare -A`.
freshness_window_seconds() {
  case "$1" in
    build) echo 1800 ;;
    knip)  echo 1800 ;;
    *)     echo "" ;;
  esac
}

# Frontend-touch detector: returns 0 (true) if the worktree's branch diff
# vs main contains any frontend-relevant file. Called from cmd_check to
# decide whether `impeccable` is conditionally required.
diff_touches_frontend() {
  local worktree="$1"
  git -C "$worktree" diff --name-only main...HEAD 2>/dev/null \
    | grep -qE '\.(tsx|css|scss)$|^src/components/|^src/app/'
}

usage() {
  # Print the file's top-of-file comment block as help text. Bound is set to
  # cover the full doc block including the pending-status note added in
  # PR #1649 (line 41) and the usage examples that follow (lines 43–56).
  # Bumping this is cheap; cutting too short truncates help mid-sentence.
  sed -n '2,56p' "$0" | sed 's|^# \{0,1\}||'
  exit 0
}

log_telemetry() {
  # Append one JSONL line: {timestamp, event, pr, branch, worktree, head, result, reason}
  local payload="$1"
  mkdir -p "$(dirname "$LOG_FILE")"
  printf '%s\n' "$payload" >> "$LOG_FILE"
}

now_iso() {
  date -u +'%Y-%m-%dT%H:%M:%SZ'
}

# Count occurrences of expected fields in an attestation file. Echoes three
# integers separated by spaces: "<head_count> <status_count> <timestamp_count>".
# Defense against duplicate-key forgery — see cmd_check for the rationale.
attestation_field_counts() {
  local path="$1"
  local hc sc tc
  hc=$(grep -c '^head=' "$path" || true)
  sc=$(grep -c '^status=' "$path" || true)
  tc=$(grep -c '^timestamp=' "$path" || true)
  echo "$hc $sc $tc"
}

# Read the first matching field's value from an attestation file.
attestation_field() {
  local path="$1"
  local field="$2"
  awk -F= -v key="^${field}=" '$0 ~ key {print $2; exit}' "$path"
}

# Compute the age in seconds of an ISO-8601 timestamp. Falls back across BSD
# date (-j -f) and GNU date (-d) so the script runs on macOS and Linux.
attestation_age_seconds() {
  local timestamp="$1"
  local ts_epoch now_epoch
  ts_epoch="$(date -u -j -f '%Y-%m-%dT%H:%M:%SZ' "$timestamp" +%s 2>/dev/null \
              || date -u -d "$timestamp" +%s 2>/dev/null || echo 0)"
  now_epoch="$(date -u +%s)"
  echo $((now_epoch - ts_epoch))
}

cmd_attest() {
  local reviewer=""
  local status=""
  local commit=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --status) status="$2"; shift 2 ;;
      --commit) commit="$2"; shift 2 ;;
      -*) echo "[merge-ready] ERROR: unknown flag '$1'" >&2; exit 2 ;;
      *)
        if [[ -z "$reviewer" ]]; then reviewer="$1"; shift
        else echo "[merge-ready] ERROR: unexpected positional arg '$1'" >&2; exit 2
        fi
        ;;
    esac
  done

  if [[ -z "$reviewer" ]]; then
    echo "[merge-ready] ERROR: attest requires a reviewer name" >&2
    echo "  valid reviewers: ${REQUIRED_REVIEWERS[*]} ${CONDITIONAL_REVIEWERS[*]} ${ADVISORY_REVIEWERS[*]}" >&2
    exit 2
  fi

  # Defense-in-depth: reject newlines / '=' in --status and --commit values.
  # Without this, a status of $'clean\nattestor=fake\nhead=...' would write a
  # multi-key file. cmd_check's duplicate-key detection catches the result,
  # but rejecting at the source keeps the on-disk file shape stable and
  # makes attestation tampering more expensive — an attacker would need to
  # write the file directly, not just call attest with a crafted argument.
  if [[ "$status" == *$'\n'* || "$status" == *=* ]]; then
    echo "[merge-ready] ERROR: --status must not contain newlines or '=' (got '$status')" >&2
    exit 2
  fi
  if [[ "$commit" == *$'\n'* || "$commit" == *=* ]]; then
    echo "[merge-ready] ERROR: --commit must not contain newlines or '=' (got '$commit')" >&2
    exit 2
  fi

  # Validate reviewer name
  local valid=false
  for r in "${REQUIRED_REVIEWERS[@]}" "${CONDITIONAL_REVIEWERS[@]}" "${ADVISORY_REVIEWERS[@]}"; do
    if [[ "$r" == "$reviewer" ]]; then valid=true; break; fi
  done
  if ! $valid; then
    echo "[merge-ready] ERROR: unknown reviewer '$reviewer'" >&2
    echo "  valid: ${REQUIRED_REVIEWERS[*]} ${CONDITIONAL_REVIEWERS[*]} ${ADVISORY_REVIEWERS[*]}" >&2
    exit 2
  fi

  # Default statuses per reviewer if caller omits --status
  if [[ -z "$status" ]]; then
    case "$reviewer" in
      build)      status="clean" ;;
      gemini)     status="advisory" ;;
      docs)
        echo "[merge-ready] ERROR: docs attestor requires explicit --status" >&2
        echo "  valid: pending | updated | no-op | deferred" >&2
        exit 2
        ;;
      impeccable)
        echo "[merge-ready] ERROR: impeccable attestor requires explicit --status" >&2
        echo "  valid: pending | clean | findings-fixed | skipped-no-frontend" >&2
        exit 2
        ;;
      knip)
        echo "[merge-ready] ERROR: knip attestor requires explicit --status" >&2
        echo "  valid: pending | clean | findings-fixed" >&2
        exit 2
        ;;
      *)          status="clean" ;;
    esac
  fi

  # `docs` is the only reviewer whose status has a closed enum: the whole
  # point of the gate is to force an explicit author decision about the
  # architecture docs index (updated vs. no-op vs. deferred). Any other
  # value means the caller stamped something meaningless.
  if [[ "$reviewer" == "docs" ]]; then
    case "$status" in
      pending|updated|no-op|deferred) : ;;
      *)
        echo "[merge-ready] ERROR: docs attestor status must be one of: pending, updated, no-op, deferred (got '$status')" >&2
        exit 2
        ;;
    esac
  fi

  # `impeccable` enforces a closed enum for the same reason — the gate must
  # know whether the design-system critique ran clean, ran with findings
  # that got fixed, or was skipped because the PR did not touch frontend.
  if [[ "$reviewer" == "impeccable" ]]; then
    case "$status" in
      pending|clean|findings-fixed|skipped-no-frontend) : ;;
      *)
        echo "[merge-ready] ERROR: impeccable attestor status must be one of: pending, clean, findings-fixed, skipped-no-frontend (got '$status')" >&2
        exit 2
        ;;
    esac
  fi

  # `knip` enforces a closed enum: either the dead-code audit ran clean,
  # or findings were raised and addressed. There is no "skip" path — the
  # audit is fast and runs against the whole tree, so every PR must pass
  # it. A "no-op" or "advisory" stamp would defeat the entire gate.
  if [[ "$reviewer" == "knip" ]]; then
    case "$status" in
      pending|clean|findings-fixed) : ;;
      *)
        echo "[merge-ready] ERROR: knip attestor status must be one of: pending, clean, findings-fixed (got '$status')" >&2
        exit 2
        ;;
    esac
  fi

  # Must be inside a git worktree
  local head
  head="$(git rev-parse HEAD 2>/dev/null || true)"
  if [[ -z "$head" ]]; then
    echo "[merge-ready] ERROR: not inside a git worktree (no HEAD)" >&2
    exit 3
  fi

  mkdir -p "$READY_DIR"
  local out="${READY_DIR}/${reviewer}"
  {
    printf 'attestor=%s\n' "$reviewer"
    printf 'head=%s\n' "$head"
    printf 'status=%s\n' "$status"
    printf 'timestamp=%s\n' "$(now_iso)"
    [[ -n "$commit" ]] && printf 'commit=%s\n' "$commit"
  } > "$out"

  echo "[merge-ready] attested: ${reviewer} @ ${head:0:8} (${status})" >&2
}

cmd_check() {
  local pr=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --pr) pr="$2"; shift 2 ;;
      *) echo "[merge-ready] ERROR: unknown flag '$1'" >&2; exit 2 ;;
    esac
  done

  if [[ -z "$pr" ]]; then
    echo "[merge-ready] ERROR: check requires --pr <number>" >&2
    exit 2
  fi

  # Resolve branch name via gh
  local branch
  branch="$(gh pr view "$pr" --json headRefName --jq .headRefName 2>/dev/null || true)"
  if [[ -z "$branch" ]]; then
    block "pr=$pr" "cannot resolve branch for PR #$pr (gh failure or invalid PR)"
    exit 2
  fi

  # Find the worktree for that branch
  local worktree=""
  local current_wt=""
  while IFS= read -r line; do
    case "$line" in
      worktree\ *)   current_wt="${line#worktree }" ;;
      branch\ *)
        local ref="${line#branch }"
        if [[ "$ref" == "refs/heads/$branch" ]]; then
          worktree="$current_wt"
          break
        fi
        ;;
    esac
  done < <(git worktree list --porcelain)

  if [[ -z "$worktree" ]]; then
    block "pr=$pr branch=$branch" \
      "no local worktree for branch '$branch'. Create one with: git worktree add .claude/worktrees/agent-<slug> -b $branch origin/$branch"
    exit 2
  fi

  # Resolve current HEAD in that worktree
  local head
  head="$(git -C "$worktree" rev-parse HEAD)"
  local ready="${worktree}/.merge-ready"

  if [[ ! -d "$ready" ]]; then
    block "pr=$pr branch=$branch worktree=$worktree head=$head" \
      "no attestations directory at $ready — run the review pipeline"
    exit 2
  fi

  # Validate every required reviewer
  local reviewer path recorded_head recorded_status recorded_timestamp
  local counts head_count status_count timestamp_count
  for reviewer in "${REQUIRED_REVIEWERS[@]}"; do
    path="${ready}/${reviewer}"
    if [[ ! -f "$path" ]]; then
      block "pr=$pr branch=$branch head=$head missing=$reviewer" \
        "missing attestation: $reviewer"
      exit 2
    fi

    # Defense against duplicate-key forgery: each expected field must appear
    # exactly once. `awk '... exit'` returns the FIRST match, so a file with
    # a forged head=<sha> prepended would validate against the fake SHA. Count
    # lines first and reject any file that has more (or fewer) than one of
    # each required field.
    counts=($(attestation_field_counts "$path"))
    head_count=${counts[0]}
    status_count=${counts[1]}
    timestamp_count=${counts[2]}
    if [[ "$head_count" -ne 1 || "$status_count" -ne 1 || "$timestamp_count" -ne 1 ]]; then
      block "pr=$pr branch=$branch head=$head malformed=$reviewer heads=$head_count statuses=$status_count timestamps=$timestamp_count" \
        "malformed $reviewer attestation: expected exactly 1 each of head=/status=/timestamp=, got $head_count/$status_count/$timestamp_count. Delete $path and re-run $reviewer."
      exit 2
    fi

    recorded_head="$(attestation_field "$path" head)"
    recorded_status="$(attestation_field "$path" status)"
    recorded_timestamp="$(attestation_field "$path" timestamp)"

    if [[ -z "$recorded_head" ]]; then
      block "pr=$pr branch=$branch head=$head malformed=$reviewer" \
        "malformed $reviewer attestation: missing or empty 'head=' field in $path. Delete it and re-run $reviewer."
      exit 2
    fi

    if [[ "$recorded_head" != "$head" ]]; then
      block "pr=$pr branch=$branch head=$head stale=$reviewer recorded=$recorded_head" \
        "stale $reviewer attestation: recorded head ${recorded_head:0:8}, current head ${head:0:8}. Re-run $reviewer and re-attest."
      exit 2
    fi

    # Pending guard: a reviewer with status=pending means "I'm still iterating,
    # don't merge yet." This blocks the round-4 work-loss pattern where the
    # orchestrator treated round-1 attestations as final while the agent kept
    # pushing fixes that got stranded on a closed branch. See PR #1645/#1647.
    if [[ "$recorded_status" == "pending" ]]; then
      block "pr=$pr branch=$branch head=$head pending=$reviewer" \
        "$reviewer is still iterating (status=pending). Wait for the reviewer to finish all rounds and re-attest with a final status before merging. If the reviewer crashed or you intentionally want to merge with the current state, run: bash scripts/merge-ready.sh attest $reviewer --status clean"
      exit 2
    fi

    # Freshness window: attestations that audit the on-disk tree (build,
    # knip) expire after a configurable interval because the tree may have
    # drifted since the run. The reviewer-keyed lookup keeps the hardcoded
    # `build`-only check from drifting out of sync as more freshness-windowed
    # attestors are added.
    local window
    window="$(freshness_window_seconds "$reviewer")"
    if [[ -n "$window" ]]; then
      local age minutes rerun_hint
      age="$(attestation_age_seconds "$recorded_timestamp")"
      if [[ "$age" -gt "$window" ]]; then
        minutes=$((window / 60))
        case "$reviewer" in
          build) rerun_hint="Re-run 'bun run build' and attest." ;;
          knip)  rerun_hint="Re-run 'bun run audit:dead-code' and attest." ;;
          *)     rerun_hint="Re-run $reviewer and attest." ;;
        esac
        block "pr=$pr branch=$branch head=$head stale=$reviewer age=${age}s window=${window}s" \
          "$reviewer attestation older than ${minutes} minutes (${age}s). ${rerun_hint}"
        exit 2
      fi
    fi
  done

  # Conditionally-required reviewers — only enforced when the diff justifies them.
  # `impeccable` (design-system critique) is required iff the PR touches frontend.
  if diff_touches_frontend "$worktree"; then
    local imp_path="${ready}/impeccable"
    if [[ ! -f "$imp_path" ]]; then
      block "pr=$pr branch=$branch head=$head missing=impeccable frontend_touched=true" \
        "missing attestation: impeccable (PR diff touches frontend; design-system critique is required). Run the impeccable critique skill and stamp via: bash scripts/merge-ready.sh attest impeccable --status <clean|findings-fixed>"
      exit 2
    fi

    # Reuse the same malformed/HEAD/stale checks as required reviewers
    local imp_counts
    imp_counts=($(attestation_field_counts "$imp_path"))
    if [[ "${imp_counts[0]}" -ne 1 || "${imp_counts[1]}" -ne 1 || "${imp_counts[2]}" -ne 1 ]]; then
      block "pr=$pr branch=$branch head=$head malformed=impeccable" \
        "malformed impeccable attestation: expected exactly 1 each of head=/status=/timestamp=. Delete $imp_path and re-run impeccable critique."
      exit 2
    fi

    local imp_recorded_head imp_recorded_status
    imp_recorded_head="$(attestation_field "$imp_path" head)"
    imp_recorded_status="$(attestation_field "$imp_path" status)"

    if [[ "$imp_recorded_head" != "$head" ]]; then
      block "pr=$pr branch=$branch head=$head stale=impeccable recorded=$imp_recorded_head" \
        "stale impeccable attestation: recorded head ${imp_recorded_head:0:8}, current head ${head:0:8}. Re-run impeccable critique and re-attest."
      exit 2
    fi

    # Pending guard for impeccable too — same rationale as required reviewers.
    if [[ "$imp_recorded_status" == "pending" ]]; then
      block "pr=$pr branch=$branch head=$head pending=impeccable" \
        "impeccable critique is still iterating (status=pending). Wait for it to finish all rounds and re-attest with a final status before merging. If the reviewer crashed or you intentionally want to merge with the current state, run: bash scripts/merge-ready.sh attest impeccable --status clean"
      exit 2
    fi

    # Reject the wrong skip status when the diff actually does touch frontend —
    # the gate exists precisely to catch this case.
    if [[ "$imp_recorded_status" == "skipped-no-frontend" ]]; then
      block "pr=$pr branch=$branch head=$head impeccable=skipped-no-frontend frontend_touched=true" \
        "impeccable attestation says 'skipped-no-frontend' but the PR diff DOES touch frontend paths. Re-run impeccable critique and stamp --status clean or findings-fixed."
      exit 2
    fi
  fi

  # NOTE: Project-specific structural guards (entity-disclosure, web-research-boundary,
  # product-email-direct-send) from the askcv.ai origin are removed here — they reference
  # askcv.ai architecture (RETRIEVAL_CONTRACT.md, write-pack, Resend ratchet) that does
  # not exist in this project. Add project-specific guards here as the codebase grows.

  # Success
  log_telemetry "$(printf '{"timestamp":"%s","event":"merge-gate","pr":%s,"branch":"%s","worktree":"%s","head":"%s","result":"allow"}' \
    "$(now_iso)" "$pr" "$branch" "$worktree" "$head")"
  echo "[merge-ready] PASS pr=$pr branch=$branch head=${head:0:8}" >&2
  return 0
}

block() {
  local context="$1"
  local reason="$2"
  log_telemetry "$(printf '{"timestamp":"%s","event":"merge-gate","result":"block","reason":"%s","context":"%s"}' \
    "$(now_iso)" "$reason" "$context")"
  cat >&2 << BLOCK

╔══════════════════════════════════════════════════════════╗
║  PR MERGE BLOCKED — attestation check failed            ║
╚══════════════════════════════════════════════════════════╝

Reason: ${reason}

Required reviewers (blocking):                ${REQUIRED_REVIEWERS[*]}
Conditional reviewers (frontend-touching PRs): ${CONDITIONAL_REVIEWERS[*]}
Advisory reviewers (optional):                ${ADVISORY_REVIEWERS[*]}

To attest from inside the PR's worktree:
  bash scripts/merge-ready.sh attest simplifier --status no-op
  bash scripts/merge-ready.sh attest opus --status clean
  bash scripts/merge-ready.sh attest codex --status clean
  bash scripts/merge-ready.sh attest build
  bash scripts/merge-ready.sh attest docs --status updated         # or --status no-op
  bash scripts/merge-ready.sh attest impeccable --status clean     # frontend PRs only — see .claude/skills/impeccable/
  bash scripts/merge-ready.sh attest knip --status clean           # bun run audit:dead-code exited 0

For multi-round reviewers (codex, opus iterations): stamp --status pending
at the START of each round, and only re-stamp the final status when truly
done iterating. The check command rejects pending — this is the fix for
the round-4 work-loss pattern (PR #1645/#1647 incident).

See docs/claude/2026-04-17-merge-ready-attestation-system.md for full pipeline.

BLOCK
}

cmd_status() {
  local pr=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --pr) pr="$2"; shift 2 ;;
      *) echo "[merge-ready] ERROR: unknown flag '$1'" >&2; exit 2 ;;
    esac
  done

  # If --pr given, resolve worktree via gh; else use current worktree
  local worktree head
  if [[ -n "$pr" ]]; then
    local branch
    branch="$(gh pr view "$pr" --json headRefName --jq .headRefName 2>/dev/null || true)"
    if [[ -z "$branch" ]]; then
      echo "[merge-ready] ERROR: cannot resolve branch for PR #$pr" >&2
      exit 2
    fi
    local current_wt=""
    while IFS= read -r line; do
      case "$line" in
        worktree\ *) current_wt="${line#worktree }" ;;
        branch\ refs/heads/*)
          if [[ "${line#branch refs/heads/}" == "$branch" ]]; then
            worktree="$current_wt"; break
          fi
          ;;
      esac
    done < <(git worktree list --porcelain)
    if [[ -z "$worktree" ]]; then
      echo "[merge-ready] no worktree for branch $branch" >&2
      exit 0
    fi
  else
    worktree="$WORKTREE_ROOT"
  fi

  head="$(git -C "$worktree" rev-parse HEAD)"
  local ready="${worktree}/.merge-ready"

  echo "worktree: $worktree"
  echo "head:     ${head:0:8}"
  echo
  # Render one attestation's status line. Centralizes the malformed/stale-head/
  # stale-age/ok branches so required and conditional reviewer loops don't each
  # re-implement the validation. `head` is captured from cmd_status's enclosing
  # scope (this is a bash inner function, not a closure — but locals defined
  # before this point are visible).
  render_attestation_line() {
    local apath="$1" reviewer="$2"
    local counts hc sc tc rh rs rt window age
    counts=($(attestation_field_counts "$apath"))
    hc=${counts[0]} sc=${counts[1]} tc=${counts[2]}
    if [[ "$hc" -ne 1 || "$sc" -ne 1 || "$tc" -ne 1 ]]; then
      echo "  ✗ $reviewer MALFORMED — heads=$hc statuses=$sc timestamps=$tc (expected 1 each)"
      return
    fi
    rh="$(attestation_field "$apath" head)"
    rs="$(attestation_field "$apath" status)"
    rt="$(attestation_field "$apath" timestamp)"
    if [[ "$rh" != "$head" ]]; then
      echo "  ✗ $reviewer STALE — recorded ${rh:0:8}, current ${head:0:8}"
      return
    fi
    # Pending check before freshness, mirroring cmd_check's order. A reviewer
    # that's still iterating shouldn't be reported as STALE just because the
    # timestamp drifted past the freshness window — the user-visible signal
    # must match what cmd_check reports.
    if [[ "$rs" == "pending" ]]; then
      echo "  ⏳ $reviewer PENDING — reviewer in-flight; merge blocked until final status is stamped"
      return
    fi
    window="$(freshness_window_seconds "$reviewer")"
    if [[ -n "$window" && -n "$rt" ]]; then
      age="$(attestation_age_seconds "$rt")"
      if [[ "$age" -gt "$window" ]]; then
        echo "  ✗ $reviewer STALE — attestation older than $((window / 60))m (${age}s); re-run and re-attest"
        return
      fi
    fi
    echo "  ✓ $reviewer (${rs})"
  }

  echo "Required reviewers:"
  for r in "${REQUIRED_REVIEWERS[@]}"; do
    if [[ -f "${ready}/${r}" ]]; then
      render_attestation_line "${ready}/${r}" "$r"
    else
      echo "  ✗ $r MISSING"
    fi
  done
  echo
  echo "Conditional reviewers (frontend-touching PRs):"
  local frontend_touched=false
  if diff_touches_frontend "$worktree"; then frontend_touched=true; fi
  for r in "${CONDITIONAL_REVIEWERS[@]}"; do
    if [[ -f "${ready}/${r}" ]]; then
      render_attestation_line "${ready}/${r}" "$r"
    elif $frontend_touched; then
      echo "  ✗ $r MISSING (REQUIRED — diff touches frontend)"
    else
      echo "  · $r not present (not required — diff has no frontend changes)"
    fi
  done
  echo
  echo "Advisory reviewers:"
  for r in "${ADVISORY_REVIEWERS[@]}"; do
    if [[ -f "${ready}/${r}" ]]; then
      echo "  · $r (present, not required)"
    fi
  done
}

cmd_reset() {
  if [[ -d "$READY_DIR" ]]; then
    rm -rf "$READY_DIR"
    echo "[merge-ready] cleared ${READY_DIR}" >&2
  else
    echo "[merge-ready] nothing to clear at ${READY_DIR}" >&2
  fi
}

# Entry point
if [[ $# -eq 0 ]]; then usage; fi
SUBCOMMAND="$1"; shift
case "$SUBCOMMAND" in
  attest) cmd_attest "$@" ;;
  check)  cmd_check "$@" ;;
  status) cmd_status "$@" ;;
  reset)  cmd_reset "$@" ;;
  -h|--help) usage ;;
  *) echo "[merge-ready] ERROR: unknown subcommand '$SUBCOMMAND'" >&2; exit 2 ;;
esac
