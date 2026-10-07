#!/usr/bin/env bash
#
# Takes the app screenshots in docs/screenshots (app-*.png): a Release build
# of the production variant on the booted iOS Simulator, against a throwaway
# stack on port 5090 with the web screenshots' events. The Maestro flows in
# mobile/maestro/screenshots drive the app. This script runs them in order,
# and between them does what they can't: take the screenshots, switch to dark
# mode, and stop and start the API for the offline shots.
#
#   scripts/app-screenshots.sh              # build the app, then take them
#   scripts/app-screenshots.sh --no-build   # reuse the app a previous run installed
#
# The build runs in a copy of mobile/, so your own ios/ project (the
# development variant) is never regenerated. The copy, the build and the stack
# are removed at the end. The app stays installed on the simulator.
#
# Needs macOS with Xcode and a booted iPhone 17 Pro simulator, Docker, Maestro
# and Node, and port 5090 free.

set -euo pipefail

root=$(git rev-parse --show-toplevel)
flows="$root/mobile/maestro/screenshots"
shots="$root/docs/screenshots"
app_id=com.devtownhall.doorlist
port=5090
api="http://localhost:${port}"
compose=(docker compose -p doorlist-screenshots
  -f "$root/docker-compose.yml" -f "$root/mobile/maestro/stack.yml")

build=1
case "${1:-}" in
  --no-build) build=0 ;;
  '') ;;
  *)
    echo "Usage: $0 [--no-build]" >&2
    exit 2
    ;;
esac

read -r udid device < <(xcrun simctl list devices booted --json | node -e '
  const { devices } = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const booted = Object.values(devices).flat().find((d) => d.state === "Booted");
  if (booted) console.log(booted.udid, booted.name);
') || true
if [[ -z "${udid:-}" ]]; then
  echo "Boot an iPhone 17 Pro simulator first." >&2
  exit 1
fi
if [[ "$device" != "iPhone 17 Pro" ]]; then
  echo "Warning: the booted simulator is an ${device}. The committed screenshots are from an iPhone 17 Pro." >&2
fi
if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null; then
  echo "Port ${port} is in use. Stop whatever is on it first." >&2
  exit 1
fi
if (( ! build )) && ! xcrun simctl get_app_container "$udid" "$app_id" >/dev/null 2>&1; then
  echo "The app isn't installed on this simulator. Run without --no-build." >&2
  exit 1
fi

work=$(mktemp -d)
cleanup() {
  "${compose[@]}" down -v >/dev/null 2>&1 || true
  xcrun simctl status_bar "$udid" clear >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

echo "Starting a throwaway stack on port ${port}"
"${compose[@]}" down -v >/dev/null 2>&1 || true
"${compose[@]}" up -d --build --wait api >"$work/compose.log" 2>&1 ||
  { cat "$work/compose.log"; exit 1; }
node "$root/mobile/maestro/seed.mjs" "$api" >"$work/seed.json"
code() { node -p "require('$work/seed.json').$1"; }

if (( build )); then
  echo "Building the production variant, Release, in a copy of mobile/ (about 10 minutes)"
  mkdir "$work/app"
  # APFS clones: instant, and they share node_modules' disk space.
  for entry in "$root"/mobile/* "$root"/mobile/.[!.]*; do
    case "$(basename "$entry")" in ios | android | dist | .expo) continue ;; esac
    cp -c -R "$entry" "$work/app/"
  done
  (
    cd "$work/app"
    export APP_VARIANT=production EXPO_PUBLIC_API_URL="$api"
    npx expo prebuild --platform ios >"$work/prebuild.log" 2>&1 ||
      { cat "$work/prebuild.log"; exit 1; }
    # --reset-cache: Metro's cache can hold modules transformed for a
    # development build, without this build's API address.
    xcodebuild -workspace ios/Doorlist.xcworkspace -scheme Doorlist \
      -configuration Release -sdk iphonesimulator -destination "id=${udid}" \
      -derivedDataPath "$work/build" EXTRA_PACKAGER_ARGS=--reset-cache \
      build >"$work/xcodebuild.log" 2>&1 ||
      { grep -E 'error:|BUILD FAILED' "$work/xcodebuild.log" | head -40; exit 1; }
  )
  xcrun simctl install "$udid" "$work/build/Build/Products/Release-iphonesimulator/Doorlist.app"
fi

# Maestro's driver sometimes crashes SpringBoard as its session ends. The
# app survives, but goes to the background, and the status bar override goes
# with SpringBoard. Bring both back before every flow and every shot.
front() {
  xcrun simctl launch "$udid" "$app_id" >/dev/null
  xcrun simctl status_bar "$udid" override --time 9:41 --dataNetwork wifi --wifiMode active \
    --wifiBars 3 --cellularMode active --cellularBars 4 --batteryState discharging --batteryLevel 100
}

flow() {
  local name=$1
  shift
  echo "  ${name}"
  front
  maestro --device "$udid" test "$@" "$flows/${name}.yaml" >"$work/maestro.log" 2>&1 ||
    { cat "$work/maestro.log"; echo "Flow ${name} failed." >&2; exit 1; }
}

shot() {
  front
  sleep 1 # let the last animation, or the status bar, settle
  xcrun simctl io "$udid" screenshot "$work/$1.png" >/dev/null 2>&1
  # 1x, like the web's phone screenshots: 402 x 874 for an iPhone 17 Pro.
  sips --resampleWidth 402 "$work/$1.png" --out "$shots/app-$1.png" >/dev/null
}

api_healthy() {
  local tries=60
  until curl -fsS -m 2 "$api/api/health" >/dev/null 2>&1; do
    (( --tries )) || { echo "The API didn't come back." >&2; exit 1; }
    sleep 2
  done
}

echo "Taking the screenshots"
xcrun simctl privacy "$udid" grant camera "$app_id"
xcrun simctl ui "$udid" appearance light
# A fresh start. Not Maestro's launchApp: with clearState, it hangs when the
# app isn't running. front() launches it before the first flow.
xcrun simctl terminate "$udid" "$app_id" >/dev/null 2>&1 || true

flow 00-reset
shot sign-in
flow 01-tickets
shot tickets
xcrun simctl ui "$udid" appearance dark
sleep 1
shot tickets-dark
xcrun simctl ui "$udid" appearance light
flow 02-ticket
shot ticket
flow 03-door-picker
shot door-picker
flow 04-door-online -e CODE="$(code online)"
shot door
"${compose[@]}" stop api >/dev/null 2>&1
flow 05-door-offline -e CODE_A="$(code offlineA)" -e CODE_B="$(code offlineB)"
shot door-offline
"${compose[@]}" start api >/dev/null 2>&1
api_healthy
flow 06-door-synced
shot door-synced
flow 07-sign-out

echo "Done: docs/screenshots/app-*.png"
