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
# Needs Docker, curl, jq, openssl and uuidgen. On Apple Silicon, SQL Server runs under Rosetta.

set -euo pipefail

base_ref=${1:?usage: scripts/check-schema-compat.sh <base-ref>}
root=$(git rev-parse --show-toplevel)
run_id="doorlist-compat-$$"
work=$(mktemp -d)
port=${COMPAT_API_PORT:-5099}
api="http://localhost:${port}/api"

sa_password="Compat_check_Passw0rd"
demo_password="Compat-demo-password-1"
signing_key="compat-check-signing-key-at-least-32-chars"
connection="Server=${run_id}-db;Database=Doorlist;User Id=sa;Password=${sa_password};TrustServerCertificate=True"
# The base may be from before the rename (ADR 6), when the API read its
# connection string as ConnectionStrings:Shiplog. Pass both names, so the
# check can run an API from either side of the rename.
api_settings=(-e "ConnectionStrings__Doorlist=$connection" -e "ConnectionStrings__Shiplog=$connection")
# Every other setting the API refuses to start without. An API from before a
# setting existed simply ignores it. When the API gains a required setting,
# add it here too, or the next pull request's check can't start main's API.
ticket_key=$(openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 | openssl pkcs8 -topk8 -nocrypt -outform DER | base64 | tr -d '\n')
api_settings+=(-e "Tickets__SigningKey=$ticket_key")

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
git -C "$root" diff --quiet HEAD -- api || head_sha="${head_sha}-dirty"

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
docker run --rm --network "${run_id}" "${api_settings[@]}" -e Demo__Password="$demo_password" \
  "${run_id}-base-api" seed-demo-users

step "2/4 Starting the ${base_sha} API and writing data with it"
docker run -d --name "${run_id}-api" --network "${run_id}" -p "${port}:8080" \
  "${api_settings[@]}" -e Auth__Jwt__SigningKey="$signing_key" \
  "${run_id}-base-api" >/dev/null
wait_until "the base API" curl --fail --silent "${api}/health"

token() {
  curl --fail --silent -H "Content-Type: application/json" \
    -d "{\"email\":\"$1@example.com\",\"password\":\"${demo_password}\"}" "${api}/auth/login" | jq -r .accessToken
}
organizer=$(token organizer)
door=$(token door)

call() {
  local token=$1 method=$2 path=$3 body=${4:-}
  local args=(--silent --show-error --fail-with-body -X "$method" -H "Authorization: Bearer ${token}")
  if [[ -n "$body" ]]; then args+=(-H "Content-Type: application/json" -d "$body"); fi
  curl "${args[@]}" "${api}${path}" || fail "${method} ${path}"
}

# Uses the API the way people do: an organizer publishes an event, a new
# attendee signs up and claims two tickets, and the door checks one in.
exercise() {
  local label=$1
  local starts ends event type attendee tickets code outcome
  starts=$(jq -nr '(now + 604800) | todate')
  ends=$(jq -nr '(now + 615600) | todate')
  event=$(call "$organizer" POST /events \
    "{\"name\":\"Compat ${label} ${RANDOM}\",\"venue\":\"Main Hall\",\"startsAt\":\"${starts}\",\"endsAt\":\"${ends}\"}" | jq .id)
  type=$(call "$organizer" POST "/events/${event}/ticket-types" '{"name":"General admission","capacity":10}' | jq .id)
  call "$organizer" POST "/events/${event}/publish" >/dev/null

  attendee=$(curl --fail --silent -H "Content-Type: application/json" \
    -d "{\"email\":\"compat-${label}-${RANDOM}@example.com\",\"password\":\"${demo_password}\",\"displayName\":\"Compat\"}" \
    "${api}/auth/register" | jq -r .accessToken) || fail "sign-up"
  tickets=$(call "$attendee" POST "/events/${event}/tickets" "{\"ticketTypeId\":${type},\"quantity\":2}")
  code=$(jq -r '.[0].code' <<<"$tickets")

  outcome=$(call "$door" POST "/events/${event}/checkins" \
    "{\"deviceId\":\"compat\",\"scans\":[{\"scanId\":\"$(uuidgen | tr '[:upper:]' '[:lower:]')\",\"code\":\"${code}\",\"scannedAt\":\"$(jq -nr 'now | todate')\"}]}" |
    jq -r '.results[0].outcome')
  [[ "$outcome" == admitted ]] || fail "check-in of a fresh ticket was ${outcome}"
  echo "   ${label}: published event ${event}, claimed 2 tickets, admitted 1"
}

exercise "before"
before_count=$(call "$organizer" GET /organizer/events | jq length)

step "3/4 Running ${head_sha}'s migrations while the ${base_sha} API keeps serving"
docker run --rm --network "${run_id}" "${run_id}-head-migrate" --connection "$connection"

step "4/4 The ${base_sha} API still reads and writes on the new schema"
after_count=$(call "$organizer" GET /organizer/events | jq length)
[[ "$after_count" == "$before_count" ]] || fail "event list changed from ${before_count} to ${after_count}"
call "$door" GET "/events/$(call "$organizer" GET /organizer/events | jq '.[0].id')/checkins/summary" >/dev/null
echo "   existing events and check-ins still read correctly (${after_count} events)"
exercise "after"

printf '\nOK: the API at %s works on the schema from %s.\n' "$base_sha" "$head_sha"
