#!/usr/bin/env bash
# Runs every supabase/tests/*.test.sql file. Each test runs in a transaction
# that is rolled back, so it is safe to run against a local database.
#
#   Against `supabase start` (migrations already applied by `supabase db reset`):
#     ./supabase/tests/run.sh
#   Against a throwaway plain Postgres (creates a fresh database, applies a
#   tiny auth shim + all migrations + seed first):
#     DB_URL=postgresql://postgres@localhost:5432/postgres ./supabase/tests/run.sh --fresh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
PSQL=(psql -X -v ON_ERROR_STOP=1 -q)

if [[ "${1:-}" == "--fresh" ]]; then
  TEST_DB="zikr_test_$$"
  ADMIN_URL="$DB_URL"
  "${PSQL[@]}" "$ADMIN_URL" -c "create database $TEST_DB" >/dev/null
  cleanup() { "${PSQL[@]}" "$ADMIN_URL" -c "drop database if exists $TEST_DB with (force)" >/dev/null; }
  trap cleanup EXIT
  DB_URL="${DB_URL%/*}/$TEST_DB"
  "${PSQL[@]}" "$DB_URL" -f "$HERE/shim/plain_postgres_auth_shim.sql" >/dev/null
  for f in "$ROOT"/migrations/*.sql; do
    echo "migrate: $(basename "$f")"
    "${PSQL[@]}" "$DB_URL" -f "$f" >/dev/null
  done
  "${PSQL[@]}" "$DB_URL" -f "$ROOT/seed.sql" >/dev/null
fi

pass=0
fail=0
for t in "$HERE"/*.test.sql; do
  name="$(basename "$t")"
  if out="$(cd "$HERE" && "${PSQL[@]}" "$DB_URL" -f "$t" -o /dev/null 2>&1)"; then
    n="$(grep -c 'NOTICE:  ok - ' <<<"$out" || true)"
    echo "PASS $name ($n assertions)"
    pass=$((pass + n))
  else
    echo "FAIL $name"
    echo "$out"
    fail=$((fail + 1))
  fi
done

echo "assertions passed: $pass, failing files: $fail"
[[ "$fail" -eq 0 ]]
