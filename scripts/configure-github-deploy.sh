#!/usr/bin/env bash
#
# Sets up GitHub for deploys, once the server exists and bootstrap.sh has run:
# the staging and production environments (production needs a reviewer), and
# every variable and secret the deploy workflow reads. Run it on your machine:
#
#   scripts/configure-github-deploy.sh <server-ip> <deploy-private-key-file>
#   scripts/configure-github-deploy.sh --enable     # turn deploys on afterwards
#
# Secrets are generated here and never printed. A secret that's already set
# is left alone, so running this again is safe. The SQL Server admin password
# in particular must never change once the database volume exists. Demo
# passwords are saved to ~/.config/doorlist/demo-passwords, readable only by you,
# because GitHub can't show a secret again.

set -euo pipefail

repo=${DOORLIST_REPO:-jaiminbhut/doorlist}
reviewer=${DOORLIST_REVIEWER:-jaiminbhut}
production_host=${PRODUCTION_HOST:-doorlist.devtownhall.com}
staging_host=${STAGING_HOST:-doorlist-staging.devtownhall.com}
acme_email=${ACME_EMAIL:-jaiminbhut35@gmail.com}
memory_limit_mb=${MSSQL_MEMORY_LIMIT_MB:-1024}
passwords_file="$HOME/.config/doorlist/demo-passwords"

if [[ "${1:-}" == --enable ]]; then
  gh variable set DEPLOY_ENABLED --repo "$repo" --body true
  echo "Deploys are on: the next green CI run on main deploys to staging, then waits for approval for production."
  exit 0
fi

host=${1:?usage: configure-github-deploy.sh <server-ip> <deploy-private-key-file>}
key_file=${2:?usage: configure-github-deploy.sh <server-ip> <deploy-private-key-file>}
[[ -f "$key_file" ]] || { echo "no such key file: $key_file" >&2; exit 1; }

secret() { printf 'Sh1-%s' "$(openssl rand -hex 24)"; }
# An ECDSA P-256 key for signing ticket codes (ADR 7): PKCS#8, DER, base64.
ticket_key() { openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 | openssl pkcs8 -topk8 -nocrypt -outform DER | base64 | tr -d '\n'; }
has_secret() { gh secret list --repo "$repo" ${2:+--env "$2"} --json name --jq '.[].name' | grep -qx "$1"; }
set_secret_once() {
  local name=$1 environment=${2:-} value=$3
  if has_secret "$name" "$environment"; then
    echo "   $name${environment:+ ($environment)}: already set, kept"
  else
    printf '%s' "$value" | gh secret set "$name" --repo "$repo" ${environment:+--env "$environment"}
    echo "   $name${environment:+ ($environment)}: generated"
  fi
}

echo "==> Checking the server's SSH host key"
known_hosts=$(ssh-keyscan -T 10 -t ed25519 "$host" 2>/dev/null)
[[ -n "$known_hosts" ]] || { echo "could not read the host key of $host" >&2; exit 1; }
echo "   $(ssh-keygen -lf - <<<"$known_hosts")"
echo "   Compare this with the fingerprint you accepted when you first connected."
ssh -i "$key_file" -o BatchMode=yes -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile=<(printf '%s\n' "$known_hosts") "deploy@$host" true ||
  { echo "the deploy key can't sign in as deploy@$host; run bootstrap.sh first" >&2; exit 1; }
echo "   deploy@$host accepts the deploy key"

echo "==> Repository variables"
gh variable set PRODUCTION_HOST --repo "$repo" --body "$production_host"
gh variable set STAGING_HOST --repo "$repo" --body "$staging_host"
gh variable set ACME_EMAIL --repo "$repo" --body "$acme_email"
gh variable set MSSQL_MEMORY_LIMIT_MB --repo "$repo" --body "$memory_limit_mb"
echo "   PRODUCTION_HOST, STAGING_HOST, ACME_EMAIL, MSSQL_MEMORY_LIMIT_MB=$memory_limit_mb"

echo "==> Repository secrets"
printf '%s' "$host" | gh secret set DEPLOY_HOST --repo "$repo"
gh secret set DEPLOY_SSH_KEY --repo "$repo" <"$key_file"
printf '%s' "$known_hosts" | gh secret set DEPLOY_KNOWN_HOSTS --repo "$repo"
echo "   DEPLOY_HOST, DEPLOY_SSH_KEY, DEPLOY_KNOWN_HOSTS"
set_secret_once MSSQL_SA_PASSWORD "" "$(secret)"

reviewer_id=$(gh api "users/$reviewer" --jq .id)
mkdir -p "$(dirname "$passwords_file")" && touch "$passwords_file" && chmod 600 "$passwords_file"

for environment in staging production; do
  echo "==> Environment: $environment"
  if [[ $environment == production ]]; then
    public_host=$production_host
    # Production waits for a reviewer, and only main can deploy to it.
    gh api -X PUT "repos/$repo/environments/$environment" --input - >/dev/null <<JSON
{ "reviewers": [{ "type": "User", "id": $reviewer_id }],
  "deployment_branch_policy": { "protected_branches": false, "custom_branch_policies": true } }
JSON
    gh api "repos/$repo/environments/$environment/deployment-branch-policies" --jq '.branch_policies[].name' |
      grep -qx main || gh api -X POST "repos/$repo/environments/$environment/deployment-branch-policies" \
      -f name=main -f type=branch >/dev/null
    echo "   needs approval from $reviewer; main only"
  else
    public_host=$staging_host
    gh api -X PUT "repos/$repo/environments/$environment" >/dev/null
  fi

  gh variable set PUBLIC_HOST --repo "$repo" --env "$environment" --body "$public_host"
  echo "   PUBLIC_HOST=$public_host"
  set_secret_once DB_MIGRATOR_PASSWORD "$environment" "$(secret)"
  set_secret_once DB_APP_PASSWORD "$environment" "$(secret)"
  set_secret_once JWT_SIGNING_KEY "$environment" "$(openssl rand -hex 32)"
  set_secret_once TICKETS_SIGNING_KEY "$environment" "$(ticket_key)"
  if has_secret DEMO_PASSWORD "$environment"; then
    echo "   DEMO_PASSWORD ($environment): already set, kept"
  else
    demo=$(secret)
    printf '%s' "$demo" | gh secret set DEMO_PASSWORD --repo "$repo" --env "$environment"
    printf '%s demo password (lead@, developer@, viewer@example.com): %s\n' "$environment" "$demo" >>"$passwords_file"
    echo "   DEMO_PASSWORD ($environment): generated, saved to $passwords_file"
  fi
done

echo
echo "GitHub is ready. Deploys stay off until: scripts/configure-github-deploy.sh --enable"
