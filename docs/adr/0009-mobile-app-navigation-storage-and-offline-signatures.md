# 9. The mobile app: navigation, storage on the device, and checking signatures without WebCrypto

- **Status:** Accepted
- **Date:** 2026-10-06

## Context

Milestone 6 is an Expo app with two jobs:

- **Attendees** sign in or sign up and see their tickets. The QR codes must still show when the phone is offline, because that's what happens in a queue outside a venue.
- **Door staff** pick an event and scan tickets with the camera. They check them offline with the cached public key, queue the scans, and sync them, with the same API and the same rules as the web door page (ADR 8).

The web app gets three things from the browser that a React Native app doesn't have:

- **A router.**
- **localStorage.**
- **WebCrypto.** Hermes, React Native's JavaScript engine, has no `crypto.subtle`. The web door checks a ticket code's ECDSA P-256 signature (ADR 7) with WebCrypto, so that code can't run as it is.

A phone adds problems of its own:

- **A camera reads the same QR code many times a second.**
- **Venue networks often hang instead of failing.**
- **Access tokens last 60 minutes and can't be refreshed (ADR 4), but a door shift is longer than that.**

## Decision

### The app

- **The app lives in `mobile/`:** Expo SDK 57 and TypeScript. Like `web/`, it has its own package and lockfile.
- **Native projects are generated at build time.** `ios/` and `android/` aren't committed. Native settings live in `app.config.ts` and config plugins.
- **Three variants: development, preview and production.** Each has its own name, bundle id and URL scheme, so all three can be installed side by side.
  - Each build profile in `eas.json` sets the API address.
  - Only a development build works the address out for itself, from the computer that runs Metro. A build without an address says so, instead of guessing and quietly talking to the wrong environment.
- **Builds and store submissions go through EAS,** not CI.

### Navigation: Expo Router

- **Routes are files in `src/app/`.** Route groups separate the signed-out screens, the attendee's screens and the door's screens. `Stack.Protected` guards each group by the session's roles, the same roles the web's guards check:
  - **Attendees** get their tickets.
  - **Door staff and organizers** get the door.
- **Why Expo Router:**
  - It's Expo's default.
  - Routes are typed.
  - Deep links (`doorlist://…`) need no extra wiring.
  - Each guard sits next to the routes it protects.
- **Why not plain React Navigation:** it would mean writing the linking config and the guards by hand.

### Storage on the device

- **The session goes in `expo-secure-store`**, which uses the iOS Keychain and the Android Keystore. That's the access token, when it expires, and the user. The password is never stored.
- **Everything else goes in one `expo-sqlite` database:**
  - the cached tickets, with when they were fetched
  - the door device's id and name
  - the cached signing key
  - the scan queue, and the tickets admitted offline, per event

  `PRAGMA user_version` versions its schema.
- **One transaction per offline admission.** Admitting a ticket offline and queueing its scan happen together, so a crash can't record one without the other.
- **Signing out keeps unsynced scans.** It clears the session and the cached tickets. Queued scans belong to the device and the event (ADR 8), and they sync after the next door sign-in. The app warns before signing out while scans are waiting.
- **Why not AsyncStorage:** it has no transactions. The web door rewrites one JSON array per scan, and that cost grows with the queue.
- **Why not MMKV:** fast synchronous reads aren't what the door needs. Transactions are.

### Checking signatures without WebCrypto

- **`@noble/curves` checks P-256 signatures, with `@noble/hashes` for SHA-256.**
  - It's pure JavaScript with no native code.
  - It has been independently audited, by Cure53 in 2024 and Trail of Bits in 2023. The reports are in its repository.
- **The key is checked strictly.** The public key from `GET /api/tickets/signing-key` is a SubjectPublicKeyInfo. The app accepts it only if it is exactly the DER header for an EC P-256 key followed by a 65-byte uncompressed point. It rejects everything else.
- **The bytes match the web.** Signatures are 64-byte `r‖s` (IEEE P1363, which noble calls `compact`). They're checked against the SHA-256 of the ASCII of `DL1.` plus the payload, exactly as WebCrypto checks them on the web.
- **`lowS: false` is required.**
  - By default, noble rejects any signature whose `s` is in the upper half of the curve order. That rule comes from Bitcoin and Ethereum.
  - P-256 has no such rule, and .NET doesn't normalise `s`, so about half of all genuine ticket codes have a high `s`.
  - With noble's default, the door would refuse about half of all real tickets offline.
- **One set of test vectors for all three implementations.** The vectors are made by the API's own signer, and they include a valid code with a high `s`. API, web and mobile tests all check them, so .NET, WebCrypto and noble can't drift apart unnoticed.
- **Rejected:**
  - `react-native-quick-crypto`: a native WebCrypto. The web's code would run unchanged, but it adds a native module and a build dependency to save milliseconds on a scan.
  - `elliptic`: older, and it had signature-verification advisories as recently as 2024.
  - `expo-crypto`: only hashes and random values, no ECDSA.
  - Checking only on the server: that isn't offline, so it breaks ADR 8.

### The door: ADR 8's rules, plus three for a phone

The app uses the same API, the same outcomes and the same rules as the web door:

- Online, the server's answer is final.
- Offline, the device checks the signature, refuses tickets it has already admitted itself, admits the rest, queues their scans and syncs them later.

A phone adds three rules:

- **A timeout counts as no connection.** If a request hangs past its deadline, the device decides offline. The scan keeps its scan id. If the server did record it, syncing it again returns the server's original answer, and nothing is counted twice.
- **One read per code.** After reading a code, the scanner ignores it until it sees a different code or a few seconds pass. Otherwise every extra camera frame would be another scan, and online the summary would count each one as a duplicate.
- **An expired session doesn't lose scans.** When the access token expires, the door asks staff to sign in again over the console. The event, the queue and the admitted list stay. The API doesn't change.

## Consequences

- **Both ends work through a dropped network.** Attendees' QR codes show from the cache, and door checks run on the device.
- **Signature checks run in JavaScript on Hermes,** which is slower than native crypto. There's one check per scan and the key is parsed once, and the time is measured on a device before the door depends on it.
- **The code format has three implementations:** .NET signs, WebCrypto checks on the web, noble checks on the phone. One set of test vectors holds them together.
- **Door staff sign in again about once an hour.** If that turns out to be a problem, refresh tokens would need a new ADR that supersedes that part of ADR 4.
- **Browsing events and claiming tickets stay on the web for now.** The app's empty My tickets screen points there. They're planned for the app next.
- **CI checks the app's JavaScript:** formatting, lint, types, tests, Expo's dependency checks, and a Hermes bundle for each platform. Native builds are made locally and by EAS, which keeps CI quick and its minutes low.
