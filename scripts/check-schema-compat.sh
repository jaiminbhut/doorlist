#!/usr/bin/env bash
#
# Proves that the API version on <base-ref> keeps working after this
# checkout's migrations run underneath it.
#
# That is the condition for a deploy without downtime: migrations run first,
# and for a while the previous API version is still serving requests against
# the new schema (docs/migrations.md). If this check fails, the change needs
# to be split into expand/contract steps.
#
#   scripts/check-schema-compat.sh <base-ref>
#
# Needs Docker, curl and jq. On Apple Silicon, SQL Server runs under Rosetta.

set -euo pipefail

base_ref=${1:?usage: scripts/check-schema-compat.sh <base-ref>}
root=$(git rev-parse --show-toplevel)
run_id="shiplog-compat-$$"
work=$(mktemp -d)
port=${COMPAT_API_PORT:-5099}
api="http://localhost:${port}/api"

sa_password="Compat_check_Passw0rd"
demo_password="Compat-demo-password-1"
signing_key="compat-check-signing-key-at-least-32-chars"
connection="Server=${run_id}-db;Database=Shiplog;User Id=sa;Password=${sa_password};TrustServerCertificate=True"

cleanup() {
  docker rm -f "${run_id}-db" "${run_id}-api" >/dev/null 2>&1 || true
  docker network rm "${run_id}" >/dev/null 2>&1 || true
  docker rmi "${run_id}-base-api" "${run_id}-base-migrate" "${run_id}-head-migrate" >/dev/null 2>&1 || true
  git -C "$root" worktree remove --force "$work/base" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

step() { printf '\n==> %s\n' "$*"; }

fail() {
  echo "FAIL: $*" >&2
  echo "--- base API logs ---" >&2
  docker logs --tail 50 "${run_id}-api" >&2 || true
  exit 1
}

wait_until() {
  local what=$1; shift
  for _ in $(seq 1 60); do
    if "$@" >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  fail "timed out waiting for ${what}"
}

base_sha=$(git -C "$root" rev-parse --short "$base_ref")
head_sha=$(git -C "$root" rev-parse --short HEAD)

step "Building the API from ${base_ref} (${base_sha}) and migrations from both versions"
git -C "$root" worktree add --detach "$work/base" "$base_ref" >/dev/null 2>&1
docker build --quiet --target api -t "${run_id}-base-api" "$work/base/api" >/dev/null
docker build --quiet --target migrate -t "${run_id}-base-migrate" "$work/base/api" >/dev/null
docker build --quiet --target migrate -t "${run_id}-head-migrate" "$root/api" >/dev/null

step "Starting SQL Server"
docker network create "${run_id}" >/dev/null
docker run -d --name "${run_id}-db" --network "${run_id}" --platform linux/amd64 \
  -e ACCEPT_EULA=Y -e MSSQL_PID=Express -e MSSQL_SA_PASSWORD="$sa_password" \
  mcr.microsoft.com/mssql/server:2022-latest >/dev/null
wait_until "SQL Server" docker exec "${run_id}-db" \
  /opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -P "$sa_password" -Q "SELECT 1" -b

step "1/4 Schema as it is today: ${base_sha}'s migrations and demo users"
docker run --rm --network "${run_id}" "${run_id}-base-migrate" --connection "$connection"
docker run --rm --network "${run_id}" -e ConnectionStrings__Shiplog="$connection" -e Demo__Password="$demo_password" \
  "${run_id}-base-api" seed-demo-users

step "2/4 Starting the ${base_sha} API and writing data with it"
docker run -d --name "${run_id}-api" --network "${run_id}" -p "${port}:8080" \
  -e ConnectionStrings__Shiplog="$connection" -e Auth__Jwt__SigningKey="$signing_key" \
  "${run_id}-base-api" >/dev/null
wait_until "the base API" curl --fail --silent "${api}/health"

token() {
  curl --fail --silent -H "Content-Type: application/json" \
    -d "{\"email\":\"$1@example.com\",\"password\":\"${demo_password}\"}" "${api}/auth/login" | jq -r .accessToken
}
lead=$(token lead)
developer=$(token developer)

call() {
  local token=$1 method=$2 path=$3 body=${4:-}
  local args=(--silent --show-error --fail-with-body -X "$method" -H "Authorization: Bearer ${token}")
  if [[ -n "$body" ]]; then args+=(-H "Content-Type: application/json" -d "$body"); fi
  curl "${args[@]}" "${api}${path}" || fail "${method} ${path}"
}

# Writes an app, an environment and a release, ticks the checklist and ships.
# The release body carries both the old single "version" field and the split
# fields, so it works against the API before and after the version split.
exercise() {
  local label=$1
  local app env release
  app=$(call "$lead" POST /apps "{\"name\":\"Compat ${label} ${RANDOM}\"}" | jq .id)
  env=$(call "$lead" POST "/apps/${app}/environments" \
    '{"name":"staging","apiUrl":"https://staging-api.example.com","isProduction":false}' | jq .id)
  release=$(call "$developer" POST /releases \
    "{\"appId\":${app},\"environmentId\":${env},\"platform\":\"android\",\"version\":\"2.4.0 (118)\",\"versionName\":\"2.4.0\",\"buildNumber\":118}")
  local id; id=$(jq .id <<<"$release")
  for item in $(jq '.checklist[].id' <<<"$release"); do
    call "$developer" PUT "/releases/${id}/checklist/${item}" '{"isDone":true}' >/dev/null
  done
  [[ $(call "$developer" POST "/releases/${id}/ship" | jq -r .status) == "shipped" ]] || fail "release ${id} did not ship"
  echo "   ${label}: created and shipped release ${id}"
}

exercise "before"
before_count=$(call "$developer" GET /releases | jq length)

step "3/4 Running ${head_sha}'s migrations while the ${base_sha} API keeps serving"
docker run --rm --network "${run_id}" "${run_id}-head-migrate" --connection "$connection"

step "4/4 The ${base_sha} API still reads and writes on the new schema"
after_count=$(call "$developer" GET /releases | jq length)
[[ "$after_count" == "$before_count" ]] || fail "release list changed from ${before_count} to ${after_count}"
call "$developer" GET "/releases/$(call "$developer" GET /releases | jq '.[0].id')" >/dev/null
echo "   existing releases still read correctly (${after_count})"
exercise "after"

printf '\nOK: the API at %s works on the schema from %s.\n' "$base_sha" "$head_sha"
