#!/usr/bin/env bash
#
# Runs the browser tests (web/e2e) in the official Playwright image, against
# the local stack. Start the stack first:
#
#   docker compose up -d --build
#   scripts/e2e.sh                  # all tests
#   scripts/e2e.sh --grep offline   # any Playwright arguments pass through
#
# The image matches the installed @playwright/test version and has its
# browsers built in, so nothing is downloaded on this machine.

set -euo pipefail

root=$(git rev-parse --show-toplevel)
version=$(node -p "require('${root}/web/node_modules/@playwright/test/package.json').version")

# Host networking, so the browser reaches the stack at http://localhost:8080,
# as CI does. Browsers treat localhost as a secure origin, which the door
# page's offline checks need (WebCrypto).
docker run --rm --init --ipc=host \
  --network host \
  -e E2E_BASE_URL=http://localhost:8080 \
  -e SCREENSHOTS="${SCREENSHOTS:-}" \
  -v "${root}/web:/work/web" \
  -v "${root}/docs:/work/docs" \
  -w /work/web \
  "mcr.microsoft.com/playwright:v${version}-noble" \
  npx playwright test "$@"
