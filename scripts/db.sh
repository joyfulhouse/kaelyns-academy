#!/usr/bin/env bash
# Run SQL against the kaelyns-academy Postgres. Prints an env banner on stderr.
#
# Usage:
#   scripts/db.sh -c "SELECT 1;"
#   scripts/db.sh < file.sql
#
# Resolution:
#   - In-cluster (CI/agents with kubeconfig + the CNPG cluster present):
#     exec psql inside the CNPG primary pod.
#   - Locally: use $DATABASE_URL.
#
# This wrapper is the single entry point the ported ship/sprint/work-item
# skills use, so their SQL ports unchanged from the askcv.ai (Neon) setup.
set -euo pipefail

ENV_NAME="${KAELYN_DB_ENV:-production}"
NS="kaelyns-academy"
CLUSTER="kaelyns-academy-db"

if command -v kubectl >/dev/null 2>&1 && kubectl -n "$NS" get cluster "$CLUSTER" >/dev/null 2>&1; then
  echo "[db.sh] env=${ENV_NAME} via=cnpg-pod ns=${NS}" >&2
  PRIMARY="$(kubectl -n "$NS" get pods -l cnpg.io/instanceRole=primary -o name | head -1)"
  if [ -z "$PRIMARY" ]; then
    echo "[db.sh] ERROR: no CNPG primary pod found in ns=${NS}" >&2
    exit 1
  fi
  exec kubectl -n "$NS" exec -i "${PRIMARY#pod/}" -- psql -U kaelyns_academy -d kaelyns_academy "$@"
else
  : "${DATABASE_URL:?DATABASE_URL not set and no in-cluster CNPG found}"
  echo "[db.sh] env=local via=DATABASE_URL host=$(echo "$DATABASE_URL" | sed -E 's#.*@([^/:]+).*#\1#')" >&2
  exec psql "$DATABASE_URL" "$@"
fi
