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
#   KUBECONFIG=~/.kube/config-k3s bash scripts/e2e-cleanup.sh
#
set -euo pipefail

NS="${E2E_DB_NAMESPACE:-kaelyns-academy}"
DB="${E2E_DB_NAME:-kaelyns_academy}"

primary="$(kubectl -n "$NS" get pods -l cnpg.io/instanceRole=primary -o name | head -1)"
if [[ -z "$primary" ]]; then
  echo "[e2e-cleanup] no CNPG primary found in ns=$NS" >&2
  exit 1
fi
pod="${primary#pod/}"

run() { kubectl -n "$NS" exec -i "$pod" -c postgres -- psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 "$@"; }

echo "[e2e-cleanup] ns=$NS db=$DB pod=$pod"

# Order matters only where there is no ON DELETE CASCADE; learners cascade from
# their account (user), so deleting throwaway users removes their learners too.
run -c "DELETE FROM learner WHERE display_name LIKE 'E2E Kid%';"
run -c "DELETE FROM \"user\" WHERE email LIKE 'e2e-throwaway+%@kaelyns.test';"
# Draft programs the admin lifecycle test may create (slug is uniquely tagged).
run -c "DELETE FROM program WHERE slug LIKE 'e2e-draft-%';"

echo "[e2e-cleanup] remaining E2E-tagged rows (expect 0):"
run -tc "SELECT 'learners', count(*) FROM learner WHERE display_name LIKE 'E2E Kid%'
         UNION ALL SELECT 'throwaway-users', count(*) FROM \"user\" WHERE email LIKE 'e2e-throwaway+%@kaelyns.test'
         UNION ALL SELECT 'draft-programs', count(*) FROM program WHERE slug LIKE 'e2e-draft-%';"
echo "[e2e-cleanup] done."
