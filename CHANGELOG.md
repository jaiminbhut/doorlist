# Changelog

Notable changes to Doorlist, newest first. Versions follow [Semantic Versioning](https://semver.org/).

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
