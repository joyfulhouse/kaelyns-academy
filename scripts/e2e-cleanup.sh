#!/usr/bin/env bash
#
# e2e-cleanup.sh — Sweep E2E test artifacts from the target DB.
#
# Deletes ONLY uniquely-tagged test data the Playwright suite may leave behind
# on a failed run. Never touches the two long-lived seeded accounts
# (e2e-parent@kaelyns.test / e2e-admin@kaelyns.test) or any real data.
#
# Targets the in-cluster CNPG primary via `kubectl exec ... psql -U postgres`
# (db.sh peer-auths as kaelyns_academy and fails). Requires KUBECONFIG.
#
# DRY RUN by default — prints the row counts it WOULD delete and exits without
# touching anything. Pass --confirm (or E2E_CLEANUP_CONFIRM=1) to actually delete:
#
#   KUBECONFIG=~/.kube/config-k3s bash scripts/e2e-cleanup.sh            # dry run
#   KUBECONFIG=~/.kube/config-k3s bash scripts/e2e-cleanup.sh --confirm  # delete
#
set -euo pipefail

NS="${E2E_DB_NAMESPACE:-kaelyns-academy}"
DB="${E2E_DB_NAME:-kaelyns_academy}"
CONFIRM="${E2E_CLEANUP_CONFIRM:-}"
[[ "${1:-}" == "--confirm" ]] && CONFIRM=1

# Seeded E2E parent account email — learner cleanup is scoped to it so a real
# child profile that happens to be named "E2E Kid…" (display names are parent-
# supplied) can NEVER be matched: real learners belong to other accounts.
E2E_PARENT="${E2E_PARENT_EMAIL:-e2e-parent@kaelyns.test}"
# Validate before it goes anywhere near a destructive prod query (defense in depth
# on top of the psql literal-quoting below).
if [[ ! "$E2E_PARENT" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]+$ ]]; then
  echo "[e2e-cleanup] refusing: E2E_PARENT_EMAIL '$E2E_PARENT' is not a plain email" >&2
  exit 2
fi

# Predicates scope each delete to uniquely-tagged E2E artifacts ONLY. $E2E_PARENT
# is safe to inline: the regex above admits only [A-Za-z0-9._%+-@.] — no quote,
# semicolon, backslash, or space — so it cannot break out of the SQL literal (the
# injection vector is closed at validation, before any SQL is built). Learner
# delete is double-scoped (seeded account AND name prefix); throwaway-email and
# draft-slug prefixes are test-only by construction. None match the seeded accounts.
W_LEARNER="display_name LIKE 'E2E Kid%' AND account_id = (SELECT id FROM \"user\" WHERE email = '$E2E_PARENT')"
W_USER="email LIKE 'e2e-throwaway+%@kaelyns.test'"
W_PROGRAM="slug LIKE 'e2e-draft-%'"

primary="$(kubectl -n "$NS" get pods -l cnpg.io/instanceRole=primary -o name | head -1)"
if [[ -z "$primary" ]]; then
  echo "[e2e-cleanup] no CNPG primary found in ns=$NS" >&2
  exit 1
fi
pod="${primary#pod/}"

run() {
  kubectl -n "$NS" exec -i "$pod" -c postgres -- \
    psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 "$@"
}

echo "[e2e-cleanup] ns=$NS db=$DB pod=$pod parent=$E2E_PARENT"
echo "[e2e-cleanup] matching E2E-tagged rows:"
run -tc "SELECT 'learners', count(*) FROM learner WHERE $W_LEARNER
         UNION ALL SELECT 'throwaway-users', count(*) FROM \"user\" WHERE $W_USER
         UNION ALL SELECT 'draft-programs', count(*) FROM program WHERE $W_PROGRAM;"

if [[ "$CONFIRM" != "1" ]]; then
  echo "[e2e-cleanup] DRY RUN — nothing deleted. Re-run with --confirm (or E2E_CLEANUP_CONFIRM=1) to delete the rows above."
  exit 0
fi

# All deletes in ONE transaction. Cascades: throwaway user → its learners/sessions;
# program → versions/units/lessons/activities; learner → attempts/skill_state, and
# (Adventure 2.0 Phase A) star_ledger/learner_sticker/learner_interest/learner_quest
# — all four FK learner.id ON DELETE CASCADE (see src/lib/db/schema.ts), so no
# separate per-table delete is needed here. The motivation.spec.ts e2e fixture
# learner is named "E2E Learner" (never "E2E Kid…"), so $W_LEARNER never matches
# it — that learner is a stable, intentionally-never-swept fixture (see
# e2e/helpers.ts's ensurePersistentLearner doc comment).
run -c "BEGIN;
        DELETE FROM learner WHERE $W_LEARNER;
        DELETE FROM \"user\" WHERE $W_USER;
        DELETE FROM program WHERE $W_PROGRAM;
        COMMIT;"
echo "[e2e-cleanup] deleted (single transaction). Done."
