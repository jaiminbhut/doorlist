#!/usr/bin/env bash
#
# Rehearses a real deploy on this machine: builds the images, then runs
# deploy/scripts/deploy.sh for staging and production against local Docker,
# exactly as the deploy workflow runs it on the server. Caddy serves
# https://doorlist-staging.localhost and https://doorlist.localhost with local
# certificates. Then it checks the safety rails:
#
#   - a production deploy with a staging settings file is refused
#   - a release that fails during migrations or seeding stops before the
#     swap, so production keeps serving
#   - a release whose API crashes once serving fails its health check and
#     rolls back, data intact
#   - every deploy leaves a database backup
#   - the API's database login can't change the schema
#
#   scripts/rehearse-deploy.sh            # rehearse, then remove everything
#   KEEP=1 scripts/rehearse-deploy.sh     # leave it running to look around
#
# Needs Docker, curl, jq and openssl, and ports 80 and 443 free.

set -euo pipefail

repo=$(git rev-parse --show-toplevel)
root="$repo/.local/deploy-rehearsal"
registry=doorlist-rehearsal
good=$(git -C "$repo" rev-parse --short=12 HEAD)-rehearsal
fails_early="broken-step-rehearsal"
fails_serving="broken-start-rehearsal"
db=doorlist-shared-db-1

step() { printf '\n######## %s\n' "$*"; }
fail() { echo "REHEARSAL FAILED: $*" >&2; exit 1; }
secret() { printf 'Sh1-%s' "$(openssl rand -hex 16)"; }
deploy() { DOORLIST_ROOT="$root" SKIP_PULL=1 "$root/deploy/scripts/deploy.sh" "$@"; }

cleanup() {
  # IMAGE_TAG has to be set for compose to read app/compose.yml at all, even for `down`.
  for project in doorlist-production doorlist-staging; do
    IMAGE_TAG=cleanup docker compose --project-name "$project" --env-file "$root/${project#doorlist-}/.env" \
      -f "$root/deploy/app/compose.yml" --profile steps down --volumes --remove-orphans >/dev/null 2>&1 || true
  done
  docker compose --project-name doorlist-shared --env-file "$root/shared/.env" \
    -f "$root/deploy/shared/compose.yml" down --volumes --remove-orphans >/dev/null 2>&1 || true
  docker images --format '{{.Repository}}:{{.Tag}}' | grep "^$registry/" | xargs -r docker rmi >/dev/null 2>&1 || true
  rm -rf "$root"
  rmdir "$repo/.local" 2>/dev/null || true
}
if [[ "${KEEP:-}" != 1 ]]; then trap cleanup EXIT; fi

if [[ -d "$root" ]]; then
  step "Removing the stack a previous KEEP=1 run left"
  cleanup
fi

step "Building images ($good)"
docker build --quiet --target api -t "$registry/doorlist-api:$good" "$repo/api" >/dev/null
docker build --quiet --target migrate -t "$registry/doorlist-migrate:$good" "$repo/api" >/dev/null
docker build --quiet -t "$registry/doorlist-web:$good" "$repo/web" >/dev/null
# Two broken releases. One fails in the seed step, before any container is
# swapped. The other seeds fine but crashes when it starts serving, which
# only the health check can catch.
printf 'FROM %s\nENTRYPOINT ["sh", "-c", "echo broken on purpose >&2; exit 1"]\n' "$registry/doorlist-api:$good" |
  docker build --quiet -t "$registry/doorlist-api:$fails_early" - >/dev/null
# shellcheck disable=SC2016 # $1 and $@ belong to the image's shell, not this one
printf 'FROM %s\nENTRYPOINT ["sh", "-c", "if [ \\"$1\\" = seed-demo-users ]; then exec dotnet Doorlist.Api.dll \\"$@\\"; fi; echo crashes when serving >&2; exit 1", "--"]\n' \
  "$registry/doorlist-api:$good" | docker build --quiet -t "$registry/doorlist-api:$fails_serving" - >/dev/null
for tag in "$fails_early" "$fails_serving"; do
  docker tag "$registry/doorlist-migrate:$good" "$registry/doorlist-migrate:$tag"
  docker tag "$registry/doorlist-web:$good" "$registry/doorlist-web:$tag"
done

step "Writing settings, as the workflow does from GitHub secrets"
rm -rf "$root" && mkdir -p "$root/shared" "$root/staging" "$root/production"
cp -R "$repo/deploy" "$root/deploy"
cat >"$root/shared/.env" <<SETTINGS
ACME_EMAIL=rehearsal@example.com
PRODUCTION_HOST=doorlist.localhost
STAGING_HOST=doorlist-staging.localhost
CADDY_LOCAL_CERTS=local_certs
MSSQL_SA_PASSWORD=$(secret)
MSSQL_MEMORY_LIMIT_MB=1024
SETTINGS
demo_password=$(secret)
for environment in staging production; do
  host=$([[ $environment == production ]] && echo doorlist.localhost || echo doorlist-staging.localhost)
  migrator=$(secret) app_password=$(secret)
  cat >"$root/$environment/.env" <<SETTINGS
ENVIRONMENT=$environment
DB_NAME=Doorlist_$environment
PUBLIC_HOST=$host
IMAGE_REGISTRY=$registry
DB_MIGRATOR_PASSWORD=$migrator
DB_APP_PASSWORD=$app_password
MIGRATOR_CONNECTION=Server=db;Database=Doorlist_$environment;User Id=doorlist_${environment}_migrator;Password=$migrator;TrustServerCertificate=True
APP_CONNECTION=Server=db;Database=Doorlist_$environment;User Id=doorlist_${environment}_app;Password=$app_password;TrustServerCertificate=True
JWT_SIGNING_KEY=$(openssl rand -hex 32)
TICKETS_SIGNING_KEY=$(openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 | openssl pkcs8 -topk8 -nocrypt -outform DER | base64 | tr -d '\n')
DEMO_PASSWORD=$demo_password
SETTINGS
done

step "Deploy staging"
deploy staging "$good"
step "Deploy production"
deploy production "$good"

https() { curl --silent --show-error --insecure "$@"; }

step "Check: both environments answer over HTTPS through Caddy"
for host in doorlist-staging.localhost doorlist.localhost; do
  [[ $(https "https://$host/api/health") == Healthy ]] || fail "$host is not healthy"
  headers=$(https --head "https://$host/")
  grep -qi '^strict-transport-security' <<<"$headers" || fail "$host has no HSTS header"
  grep -qi "^content-security-policy: default-src 'self'; script-src 'self'" <<<"$headers" || fail "$host has no CSP"
  echo "   https://$host: healthy, HSTS and CSP present"
done
grep -qi '^x-robots-tag: noindex' <<<"$(https --head https://doorlist-staging.localhost/)" || fail "staging is indexable"
echo "   staging is marked noindex"

step "Check: write data in production"
api=https://doorlist.localhost/api
token=$(https -H 'Content-Type: application/json' \
  -d "{\"email\":\"organizer@example.com\",\"password\":\"$demo_password\"}" "$api/auth/login" | jq -r .accessToken)
[[ -n "$token" && "$token" != null ]] || fail "could not sign in to production"
starts=$(jq -nr '(now + 604800) | todate')
ends=$(jq -nr '(now + 615600) | todate')
event_id=$(https -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Rehearsal Event\",\"venue\":\"Main Hall\",\"startsAt\":\"$starts\",\"endsAt\":\"$ends\"}" "$api/events" | jq .id)
[[ "$event_id" =~ ^[0-9]+$ ]] || fail "could not create an event"
echo "   created event $event_id as organizer@example.com"

step "Check: a production deploy with a staging settings file is refused"
cp "$root/production/.env" "$root/production/.env.real"
sed -i.bak 's/^ENVIRONMENT=production$/ENVIRONMENT=staging/' "$root/production/.env"
if deploy production "$good" >/dev/null 2>"$root/refused.log"; then
  fail "the mismatched deploy went ahead"
fi
grep -q 'says ENVIRONMENT=staging, but this is a production deploy' "$root/refused.log" || fail "refused for the wrong reason"
mv "$root/production/.env.real" "$root/production/.env" && rm -f "$root/production/.env.bak"
echo "   refused: $(grep FAIL "$root/refused.log")"

still_good() {
  [[ $(cat "$root/production/current-tag") == "$good" ]] || fail "current-tag moved off $good"
  [[ $(https "$api/health") == Healthy ]] || fail "production is down"
  https -H "Authorization: Bearer $token" "$api/organizer/events" | jq -e --argjson id "$event_id" 'any(.id == $id)' >/dev/null ||
    fail "event $event_id is missing"
}

step "Check: a release that fails before the swap leaves production alone"
if deploy production "$fails_early" >"$root/fails-early.log" 2>&1; then
  fail "the broken release reported success"
fi
grep -q '==> 7/8' "$root/fails-early.log" && fail "it got as far as swapping containers"
still_good
echo "   $fails_early stopped at the seed step; $good never stopped serving, event $event_id is intact"

step "Check: a release that crashes once serving rolls back to the last good one"
if deploy production "$fails_serving" >"$root/fails-serving.log" 2>&1; then
  fail "the broken release reported success"
fi
grep -q "Rolling back to $good" "$root/fails-serving.log" || fail "no rollback happened"
grep -q "$good is serving again" "$root/fails-serving.log" || fail "the rollback isn't serving"
still_good
echo "   $fails_serving failed its health check, $good is serving again, event $event_id is intact"

step "Check: every deploy left a backup"
backups=$(docker exec "$db" sh -c 'ls -1 /var/opt/mssql/backups/production/*.bak | wc -l')
(( backups >= 3 )) || fail "expected at least 3 production backups, found $backups"
echo "   $backups production backups in the database volume"

step "Check: the API's login can read and write data but not change the schema"
app_password=$(sed -n 's/^DB_APP_PASSWORD=//p' "$root/production/.env")
as_app() {
  docker exec -e SQLCMDPASSWORD="$app_password" "$db" \
    /opt/mssql-tools18/bin/sqlcmd -C -S localhost -U doorlist_production_app -d Doorlist_production -b -h -1 -W -Q "$1"
}
as_app "SELECT COUNT(*) FROM Events" >/dev/null || fail "the app login can't read"
if as_app "CREATE TABLE RehearsalProbe (Id int)" >/dev/null 2>&1; then
  fail "the app login created a table"
fi
echo "   SELECT works, CREATE TABLE is denied"

printf '\nREHEARSAL PASSED\n'
if [[ "${KEEP:-}" == 1 ]]; then
  echo "Still running: https://doorlist.localhost and https://doorlist-staging.localhost (accept the local certificate)."
  echo "Sign in as organizer@example.com, door@example.com or attendee@example.com with password $demo_password."
  echo "To remove it, run this script again without KEEP=1 (it starts by cleaning up), then let it finish."
fi
