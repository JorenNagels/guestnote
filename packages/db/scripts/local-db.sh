#!/usr/bin/env bash
# Create (or recreate) one database in the local Postgres container and apply every
# migration to it -- the tier-1 loop from packages/db/README.md, made repeatable.
#
#   packages/db/scripts/local-db.sh gn_s4       (the name must match ^gn_[a-z0-9_]+$)
#   export TEST_DATABASE_URL=postgres://app_user:verify@localhost:55433/gn_s4
#   export SEED_DATABASE_URL=postgres://postgres:verify@localhost:55433/gn_s4
#   npm run test:db
#
# ## Why one database per name
#
# `test:db` TRUNCATES the fixture tables (test/harness.ts `reseed()`), so two agents or two
# worktrees sharing one database corrupt each other's runs. Postgres databases in one
# container are cheap and fully isolated, so each caller gets its own and the container is
# shared. `guestnote` is what the harness assumes when no URL is exported, so this script
# refuses it: pass a `gn_` name and export the URLs it prints.
#
# ## It DROPS the database if it exists
#
# On purpose. A migration that half-applied last time, or a schema from before you rebased,
# is the failure this exists to remove, and a "create if missing" would leave it there. The
# only thing lost is a local throwaway. That is why the name is restricted to `gn_*`.
#
# ## Tier 1 only
#
# This is a plain local Postgres 17. It proves policy LOGIC. It says nothing about Neon's
# pooler, which is what tier 2 is for, and it must never be pointed at Neon.

set -euo pipefail

CONTAINER="${GN_PG_CONTAINER:-gn-pg}"
PORT="${GN_PG_PORT:-55433}"
IMAGE="postgres:17-alpine"
DB="${1:-}"

# The name goes into `create database "..."` below, so it is validated rather than quoted
# and hoped for. It must be `gn_` plus lowercase letters, digits and underscores, which by
# construction excludes `postgres`, `template*` and the harness's default `guestnote`. Those
# two are named anyway: this script DROPS the database it is given, `guestnote` is where the
# harness points when no URL is exported, and the pattern is one edit away from admitting it.
if [[ ! "$DB" =~ ^gn_[a-z0-9_]+$ ]] || [[ "$DB" == "guestnote" || "$DB" == "postgres" ]]; then
  echo "usage: $0 gn_<name>   (must match ^gn_[a-z0-9_]+\$; never guestnote or postgres)" >&2
  exit 2
fi

MIGRATIONS="$(cd "$(dirname "$0")/../migrations" && pwd)"

# --- the container ---------------------------------------------------------------------
if ! docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=verify -e POSTGRES_DB=guestnote \
    -p "$PORT:5432" "$IMAGE" >/dev/null
elif ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  docker start "$CONTAINER" >/dev/null
fi

# `pg_isready` answers during the image's first-boot init, when the server is up but is about
# to restart. Two successes in a row, with a query between, is what "ready" means here.
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" psql -U postgres -d postgres -tAc 'select 1' >/dev/null 2>&1; then
    sleep 1
    docker exec "$CONTAINER" psql -U postgres -d postgres -tAc 'select 1' >/dev/null 2>&1 && break
  fi
  sleep 1
done

psql_admin() { docker exec -i "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -q "$@"; }

# --- the role --------------------------------------------------------------------------
# Cluster-wide, so created once. NOBYPASSRLS is the point: `app_user` must be subject to
# every policy, and pooling.test.ts asserts it.
psql_admin -d postgres -tA >/dev/null <<'SQL'
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user login password 'verify' nobypassrls;
  end if;
end
$$;
SQL

# --- the database ----------------------------------------------------------------------
psql_admin -d postgres -c "drop database if exists \"$DB\" with (force)"
psql_admin -d postgres -c "create database \"$DB\""

# --- the migrations --------------------------------------------------------------------
# Not `npm run db:migrate` -- there is no drizzle journal table here, so it would replay from
# zero and fail behind its own spinner (CLAUDE.md invariant 8). The files are applied
# directly, in name order, each in one transaction so a failure leaves nothing half-applied.
shopt -s nullglob
files=("$MIGRATIONS"/0*.sql)
if [ "${#files[@]}" -eq 0 ]; then
  echo "no migrations found in $MIGRATIONS" >&2
  exit 1
fi
for f in "${files[@]}"; do
  echo "  applying $(basename "$f")"
  psql_admin -d "$DB" --single-transaction <"$f"
done

echo
echo "  database $DB ready (${#files[@]} migrations). Export, then run \`npm run test:db\`:"
echo "    export TEST_DATABASE_URL=postgres://app_user:verify@localhost:$PORT/$DB"
echo "    export SEED_DATABASE_URL=postgres://postgres:verify@localhost:$PORT/$DB"
