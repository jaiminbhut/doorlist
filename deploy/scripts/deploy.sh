#!/usr/bin/env bash
#
# Deploys one environment on this server. The deploy workflow copies deploy/
# here and runs, over SSH:
#
#   deploy.sh <staging|production> <image-tag>
#
# It expects shared/.env and <environment>/.env under $DOORLIST_ROOT, both
# written by the workflow from GitHub secrets. Steps, in order:
#
#   1. Check the environment file is for this environment
#   2. Start the shared services (Caddy, SQL Server) if they aren't running
#   3. Create the environment's database and logins, or sync their passwords
#   4. Pull the images for <image-tag>
#   5. Back up the database
#   6. Run the migration bundle, then seed the demo users
#   7. Swap in the new API and web containers
#   8. Health check; on failure, go back to the previous images
#
# Step 7 can leave the old API running on the new schema for a moment, and
# step 8 can put it back for good. Both are safe because every migration
# passes the schema compatibility check (docs/migrations.md).

set -euo pipefail

environment=${1:?usage: deploy.sh <staging|production> <image-tag>}
tag=${2:?usage: deploy.sh <staging|production> <image-tag>}
root=${DOORLIST_ROOT:-/opt/doorlist}
deploy_dir="$root/deploy"
env_dir="$root/$environment"
db_container=doorlist-shared-db-1
backups_to_keep=${BACKUPS_TO_KEEP:-10}

step() { printf '\n==> %s\n' "$*"; }
fail() { echo "FAIL: $*" >&2; exit 1; }

case "$environment" in
  staging | production) ;;
  *) fail "unknown environment '$environment'" ;;
esac

shared() { docker compose --project-name doorlist-shared --env-file "$root/shared/.env" -f "$deploy_dir/shared/compose.yml" "$@"; }
app() {
  IMAGE_TAG="$1" docker compose --project-name "doorlist-$environment" --env-file "$env_dir/.env" \
    -f "$deploy_dir/app/compose.yml" "${@:2}"
}
sql() { docker exec -i "$db_container" sh -c 'SQLCMDPASSWORD="$MSSQL_SA_PASSWORD" /opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -b -h -1 -W'; }

# --- 1. The environment file must be for this environment -------------------
step "1/8 Checking the target"
[[ -f "$env_dir/.env" ]] || fail "$env_dir/.env is missing"
[[ -f "$root/shared/.env" ]] || fail "$root/shared/.env is missing"
env_value() { sed -n "s/^$1=//p" "$env_dir/.env" | tail -1; }

declared=$(env_value ENVIRONMENT)
database=$(env_value DB_NAME)
public_host=$(env_value PUBLIC_HOST)
[[ "$declared" == "$environment" ]] ||
  fail "the environment file says ENVIRONMENT=$declared, but this is a $environment deploy"
[[ "$database" == "Doorlist_$environment" ]] ||
  fail "the environment file says DB_NAME=$database, expected Doorlist_$environment"
if [[ "$environment" == production && "$public_host" == *staging* ]]; then
  fail "a production deploy is pointed at $public_host"
fi
if [[ "$environment" == staging && "$public_host" != *staging* ]]; then
  fail "a staging deploy is pointed at $public_host"
fi
printf '   environment  %s\n   database     %s\n   public URL   https://%s\n   image tag    %s\n' \
  "$environment" "$database" "$public_host" "$tag"

# --- 2. Shared services --------------------------------------------------------
step "2/8 Starting shared services"
shared up -d --wait --quiet-pull

# --- 3. Database and logins ----------------------------------------------------
step "3/8 Database and logins for $database"
escape() { printf '%s' "${1//\'/\'\'}"; }
migrator="doorlist_${environment}_migrator"
app_login="doorlist_${environment}_app"
sql >/dev/null <<SQL
SET NOCOUNT ON;
IF DB_ID(N'$database') IS NULL CREATE DATABASE [$database];
GO
IF SUSER_ID(N'$migrator') IS NULL
  CREATE LOGIN [$migrator] WITH PASSWORD = N'$(escape "$(env_value DB_MIGRATOR_PASSWORD)")', DEFAULT_DATABASE = [$database];
ELSE
  ALTER LOGIN [$migrator] WITH PASSWORD = N'$(escape "$(env_value DB_MIGRATOR_PASSWORD)")';
IF SUSER_ID(N'$app_login') IS NULL
  CREATE LOGIN [$app_login] WITH PASSWORD = N'$(escape "$(env_value DB_APP_PASSWORD)")', DEFAULT_DATABASE = [$database];
ELSE
  ALTER LOGIN [$app_login] WITH PASSWORD = N'$(escape "$(env_value DB_APP_PASSWORD)")';
GO
USE [$database];
-- Schema changes belong to the migration step only (ADR 3).
IF USER_ID(N'$migrator') IS NULL CREATE USER [$migrator] FOR LOGIN [$migrator];
ALTER ROLE db_owner ADD MEMBER [$migrator];
-- The API reads and writes data, nothing more.
IF USER_ID(N'$app_login') IS NULL CREATE USER [$app_login] FOR LOGIN [$app_login];
ALTER ROLE db_datareader ADD MEMBER [$app_login];
ALTER ROLE db_datawriter ADD MEMBER [$app_login];
GO
SQL
echo "   $migrator (db_owner), $app_login (read and write)"

# --- 4. Images -------------------------------------------------------------------
step "4/8 Pulling images for $tag"
if [[ "${SKIP_PULL:-}" == 1 ]]; then
  echo "   skipped (SKIP_PULL=1, images are local)"
else
  app "$tag" --profile steps pull --quiet
fi

# --- 5. Backup ---------------------------------------------------------------------
step "5/8 Backing up $database"
backup_dir="/var/opt/mssql/backups/$environment"
backup_file="$backup_dir/$(date -u +%Y%m%dT%H%M%SZ)-$tag.bak"
docker exec "$db_container" mkdir -p "$backup_dir"
sql >/dev/null <<SQL
BACKUP DATABASE [$database] TO DISK = N'$backup_file' WITH INIT, CHECKSUM;
SQL
docker exec "$db_container" sh -c "ls -1t '$backup_dir'/*.bak | tail -n +$((backups_to_keep + 1)) | xargs -r rm --"
echo "   $backup_file (keeping the newest $backups_to_keep)"

# --- 6. Migrations and seed ------------------------------------------------------
step "6/8 Running migrations, then seeding demo users"
app "$tag" --profile steps run --rm --quiet-pull migrate
if [[ -n "$(env_value DEMO_PASSWORD)" ]]; then
  app "$tag" --profile steps run --rm --quiet-pull seed
else
  echo "   no DEMO_PASSWORD, so no demo users"
fi

# --- 7. Swap containers ----------------------------------------------------------
step "7/8 Starting the $tag API and web"
previous=$(cat "$env_dir/current-tag" 2>/dev/null || true)
app "$tag" up -d --remove-orphans

# --- 8. Health check, or roll back -------------------------------------------------
step "8/8 Health check"
# Through the web container's nginx to the API and the database: the whole
# path a request takes, short of Caddy. 127.0.0.1 because nginx listens on
# IPv4 and busybox wget tries ::1 for "localhost".
healthy() {
  local answer=""
  for _ in $(seq 1 30); do
    answer=$(app "$1" exec -T web wget -qO- http://127.0.0.1/api/health 2>&1) || true
    if [[ "$answer" == Healthy ]]; then
      return 0
    fi
    sleep 2
  done
  echo "   last health answer: ${answer:-<none>}" >&2
  return 1
}

if healthy "$tag"; then
  echo "$tag" >"$env_dir/current-tag"
  docker image prune -f >/dev/null
  printf '\nOK: %s is running %s at https://%s\n' "$environment" "$tag" "$public_host"
  exit 0
fi

echo "   $tag is not healthy. Last API log lines:" >&2
app "$tag" logs --tail 40 api >&2 || true
if [[ -n "$previous" && "$previous" != "$tag" ]]; then
  echo "   Rolling back to $previous" >&2
  app "$previous" up -d --remove-orphans
  healthy "$previous" && echo "   $previous is serving again" >&2
fi
fail "$tag did not become healthy on $environment"
