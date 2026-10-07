# Changelog

Notable changes to Doorlist, newest first. Versions follow [Semantic Versioning](https://semver.org/).

## Unreleased

### Fixed

- **The app's screen titles were cut off at the top on iOS.** Big Shoulders is set tighter than its own line height, as on the web, where the tops overflow and still show. iOS clips them instead. Titles like "Sign in" lost the top 2 to 3 points of every letter, and the door's event name and day numbers lost about half a point. They keep their tight leading and now show in full.

## 1.1.0 (2026-10-07)

The mobile app. Attendees carry their tickets on their phone, and door staff check tickets with the phone's camera, with or without a connection ([ADR 9](docs/adr/0009-mobile-app-navigation-storage-and-offline-signatures.md)). The API and its schema are unchanged. The app itself is version 0.1.0 and isn't in the app stores yet.

### For attendees and door staff

- **Sign in and sign up,** with the web's messages. A session lasts until sign-out. When its token expires, the app asks for the password again and keeps the saved tickets and queued scans.
- **My tickets:**
  - Paper stubs with the QR code, as on the web. A tapped ticket fills the screen at full brightness.
  - The tickets are saved on the phone, so they show and scan offline.
  - Claiming stays on the web for now.
- **The door:**
  - Door staff pick an event and name the door. They scan with the camera, or type or paste a code, or use a Bluetooth scanner.
  - Online, the server's answer is final, in the web's words. Each verdict comes with a haptic and is announced to screen readers.
  - The camera reads each code once, not once per frame.
  - Offline, or when the server doesn't answer within 4 seconds, the phone checks the signature itself. It refuses tickets it has let in or seen used, and queues the scans.
  - It syncs when the connection or the app comes back, every 20 seconds while scans wait, and on "Sync now". It lists any ticket another door let in first.
  - Queued scans survive an expired session and signing out.

### Under the hood

- **App:** Expo SDK 57 (React Native 0.86, TypeScript) with Expo Router, each role's screens guarded by role. SecureStore holds the session and SQLite holds the rest. An offline admission and its queued scan are saved in one transaction.
- **Builds:** development, preview and production, each with its own name, bundle id, URL scheme and API address. Only a development build works the API address out by itself.
- **Signatures on the phone:** `@noble/curves` P-256, with `lowS: false`. Of 1,000 codes from the API's signer, 501 had a high `s`, which noble's defaults would have refused.
- **Shared test vectors:** [`test-vectors/ticket-codes.json`](test-vectors/ticket-codes.json), made by the API's own signer and checked by the API, web and mobile tests.
- **Tests:**
  - 95 Jest tests, the storage ones running the app's real SQL on Node's SQLite.
  - A new CI job runs Prettier, ESLint, the type check, Jest, expo-doctor and a Hermes bundle for both platforms.
  - Each pull request was also checked on the iOS Simulator, online and offline, against a local stack.

### Not checked yet

- **Android** compiles, but hasn't run on an emulator or a phone.
- **Camera scanning** needs a real phone, because the simulator has no camera. Typed codes go through the same checks.
- **Speed on a phone:** a signature check takes about 36 ms on the simulator, in a Release build. A phone will be slower.

## 1.0.0 (2026-10-06)

The first release. The project began as Shiplog, a release tracker, and became Doorlist: free event tickets with door check-in ([ADR 6](docs/adr/0006-from-release-tracking-to-event-ticketing.md)).

### For organizers, attendees and door staff

- **Events:** organizers draft events, add ticket types with capacities, and publish them. Anyone can browse published events.
- **Sign-up:** attendees sign up with an email, rate-limited per IP.
- **Claiming:** up to 4 tickets per attendee per event. An event never issues more than its capacity, however many people claim at once ([ADR 7](docs/adr/0007-signed-ticket-codes-and-claiming-without-overselling.md)).
- **Tickets:** QR codes of ECDSA P-256 signed codes. Any device holding the public key can check them without a connection.
- **Door check-in** ([ADR 8](docs/adr/0008-door-check-in-offline-first.md)):
  - Online, the server's answer is final.
  - Offline, the browser checks signatures with WebCrypto, refuses tickets it has already let in, and queues the scans.
  - When the connection returns, it syncs the queue and flags any ticket another door admitted first.
  - It works with a USB or Bluetooth QR scanner, or a pasted code.
- **Its own look:**
  - Gig-poster type for events.
  - Paper tickets with a tear-off QR stub.
  - A dark door console whose verdicts state the decision in words, not only in colour.
  - Light and dark themes.
- **Motion** only where it answers an action: a verdict landing, new tickets arriving, an event being published. It's off when the system asks for reduced motion.

### Under the hood

- **API:** ASP.NET Core minimal API on .NET 10, with EF Core code-first on SQL Server. ASP.NET Core Identity issues short-lived JWTs, checked by role policies.
- **Migrations:**
  - They run as their own step, from an EF Core migration bundle ([ADR 3](docs/adr/0003-run-migrations-as-a-separate-step.md)).
  - CI runs `main`'s API against every pull request's migrations.
  - Two breaking changes shipped in expand/contract steps: splitting a column (three pull requests) and retiring the release tracker's tables (two). See [docs/migrations.md](docs/migrations.md).
- **Tests:**
  - 67 API tests against a real SQL Server (Testcontainers).
  - 53 web unit tests.
  - Browser tests of the whole flow, online and offline, against the production build with its CSP.
  - A full-stack smoke test.
- **Delivery:**
  - Images go to GHCR.
  - Deploys go to staging, then to production with approval. Each deploy checks settings, takes a backup, runs migrations, does a health check and rolls back on failure.
  - The pipeline is rehearsed locally ([ADR 5](docs/adr/0005-single-server-deploy-with-docker-compose.md)). It's built but switched off until the server exists.
- **Decisions:** eight architecture decision records in [docs/adr](docs/adr).
