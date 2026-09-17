#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Runs the SQL security suite against a throwaway PostgreSQL + PostGIS database.
#
# It applies the real migrations — the ones deployed to Supabase — on top of a
# small shim that recreates `auth.uid()` and the anon/authenticated/service_role
# roles. Every assertion then runs as the `authenticated` role, i.e. with
# exactly the privileges a browser client has.
#
# Usage:
#   scripts/db-test.sh                    # start a temporary server
#   PGURL=postgres://... scripts/db-test.sh   # use an existing database
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PSQL_BIN="${PSQL_BIN:-psql}"

if [[ -n "${PGURL:-}" ]]; then
  PSQL=("$PSQL_BIN" "$PGURL")
else
  PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
  PGDATA="${PGDATA:-${TMPDIR:-/tmp}/mwhite-safecircle-pgdata}"
  PGSOCK="${PGSOCK:-${TMPDIR:-/tmp}/mwhite-safecircle-pgsock}"
  PGPORT="${PGPORT:-55432}"

  # PostgreSQL refuses to run as root, so when this script is invoked as root
  # (containers, some CI images) the server is run as the `postgres` system
  # user instead. `as_pg` wraps every server command accordingly.
  if [[ "$(id -u)" -eq 0 ]]; then
    if ! id postgres >/dev/null 2>&1; then
      echo "This script must not run as root without a 'postgres' system user." >&2
      exit 1
    fi
    as_pg() { su postgres -s /bin/bash -c "PATH=$PGBIN:\$PATH $*"; }
    OWNER=postgres
  else
    as_pg() { PATH="$PGBIN:$PATH" bash -c "$*"; }
    OWNER="$(id -un)"
  fi

  if [[ ! -d "$PGDATA" ]]; then
    echo "==> initdb $PGDATA"
    mkdir -p "$PGDATA" "$PGSOCK"
    chown -R "$OWNER" "$PGDATA" "$PGSOCK" 2>/dev/null || true
    as_pg "initdb -D '$PGDATA' -A trust -U postgres" >/dev/null
  fi

  mkdir -p "$PGSOCK"
  chown -R "$OWNER" "$PGSOCK" 2>/dev/null || true

  if ! "$PGBIN/pg_isready" -h "$PGSOCK" -p "$PGPORT" >/dev/null 2>&1; then
    echo "==> starting postgres on $PGSOCK:$PGPORT"
    as_pg "pg_ctl -D '$PGDATA' -o '-k $PGSOCK -p $PGPORT -c listen_addresses=' -l '$PGDATA/server.log' start -w" >/dev/null
  fi

  PSQL=("$PSQL_BIN" -h "$PGSOCK" -p "$PGPORT" -U postgres)
  "${PSQL[@]}" -q -c "drop database if exists mwhite_safecircle_test;" -c "create database mwhite_safecircle_test;"
  PSQL=("$PSQL_BIN" -h "$PGSOCK" -p "$PGPORT" -U postgres -d mwhite_safecircle_test)
fi

run() { "${PSQL[@]}" -v ON_ERROR_STOP=1 -q -f "$1"; }

echo "==> applying test shim"
run tests/db/00_supabase_shim.sql
run tests/db/01_helpers.sql

echo "==> applying migrations"
for migration in supabase/migrations/*.sql; do
  echo "    $(basename "$migration")"
  run "$migration"
done

echo "==> loading fixtures"
run tests/db/02_fixtures.sql

echo "==> running security assertions"
"${PSQL[@]}" -v ON_ERROR_STOP=1 -q -f tests/db/03_security.test.sql
