# Doorlist

Free event tickets with door check-in. Organizers create events with ticket types and capacities. Attendees sign up and claim tickets, each a QR code the server signs so it can be checked without a connection. Door staff scan tickets, offline if the venue's network drops, and scans sync when it comes back.

Doorlist is also a public reference project. Alongside the features, it shows how the whole product is built and run: an Angular front end, an ASP.NET Core API on SQL Server, EF Core migrations that run as their own deploy step and are checked against the running API, Docker, CI on every pull request, a rehearsed deploy pipeline, and the decisions behind each of these, written down.

> **Status:** changing course. This project started as Shiplog, a release tracker; [ADR 6](docs/adr/0006-from-release-tracking-to-event-ticketing.md) explains why it's becoming Doorlist. The rename is done; the events and tickets come next, and the release tracker is retired in steps afterwards. Until then, the app below is still the release tracker.

## What it does today: the release tracker

- **Apps and environments.** A lead adds each app the team ships, and its environments, each with the API URL a build for it must point at. Production environments are flagged.
- **Releases with a checklist.** A release is one version of an app, for one platform, going to one environment. It starts with a checklist built from its environment: *"Build is configured for the production environment"*, *"Build points at https://api.example.com/"*, release notes, testing.
- **A gate on shipping.** A release can ship only when every item is ticked. Developers ship to staging; only a lead ships to production. Who ticked what, and who shipped, is recorded.
- **Roles.** Viewer (read only), Developer (works on releases), Lead (everything). There is no public sign-up.

## Stack

| Layer | Choice |
|---|---|
| Web | Angular (standalone components, signals), served by nginx |
| API | ASP.NET Core on .NET 10, minimal APIs, ProblemDetails, health checks |
| Data | SQL Server, EF Core code-first migrations ([ADR 2](docs/adr/0002-sql-server-with-ef-core-code-first.md)) |
| Auth | ASP.NET Core Identity, short-lived JWTs, role policies ([ADR 4](docs/adr/0004-authentication-with-identity-and-jwt.md)) |
| Migrations | EF Core migration bundle, run as a separate step before the API starts ([ADR 3](docs/adr/0003-run-migrations-as-a-separate-step.md)); every PR checked against the running API version, breaking changes in expand/contract steps ([docs/migrations.md](docs/migrations.md)) |
| Tests | xUnit integration tests against a real SQL Server (Testcontainers) |
| Delivery | Docker multi-stage images, GHCR, GitHub Actions; staging then production (with approval) on one server behind Caddy ([ADR 5](docs/adr/0005-single-server-deploy-with-docker-compose.md), [deploy/](deploy/README.md)) |

## Architecture

```mermaid
flowchart LR
    browser([Browser]) --> web["web<br/>nginx + Angular"]
    web -- "/api/*" --> api["api<br/>ASP.NET Core"]
    api --> db[("db<br/>SQL Server")]
    migrate["migrate<br/>EF Core bundle"] -- "1. runs once" --> db
    seed["seed<br/>demo users"] -- "2. runs once" --> db
```

The API never changes the schema itself. The migration bundle built from the same commit runs first, then the demo-user seed step, and the API starts only if both succeed.

## Run it

You need Docker with Compose. On Apple Silicon, see [CONTRIBUTING.md](CONTRIBUTING.md#apple-silicon).

```sh
docker compose up --build
```

- Web: http://localhost:8080
- API: http://localhost:5080. `/api/health` is open; everything else needs a token from `POST /api/auth/login`.

Local demo accounts, all with the password `Doorlist-demo-2026`:

| Email | Role |
|---|---|
| `lead@example.com` | Lead |
| `developer@example.com` | Developer |
| `viewer@example.com` | Viewer |

## Repository layout

```
api/                     ASP.NET Core API, EF Core, migrations, tests
  src/Doorlist.Api/
  tests/Doorlist.Api.Tests/
web/                     Angular app
docs/adr/                Architecture decision records
deploy/                  Server setup, Caddy, compose files and the deploy script
.github/workflows/       CI (build, tests, migration checks, schema compatibility, smoke test) and Deploy
scripts/                 Schema compatibility check, deploy rehearsal, GitHub deploy setup
docker-compose.yml       Local stack
```

## Roadmap

| Milestone | Scope |
|---|---|
| 1. Skeleton ✅ | `docker compose up` runs end to end; CI on every pull request |
| 2. Domain and auth ✅ | The release tracker: apps, environments, releases, checklists; ASP.NET Core Identity + JWT with roles |
| 3. Deploy pipeline (built, waiting for the server) | Images to GHCR; staging then production with approval; settings check, backup, migrations, health check and rollback; Content-Security-Policy |
| 4. Expand/contract ✅ | A CI check that the running API survives each PR's migrations; a breaking schema change shipped in three steps that each pass it ([`docs/migrations.md`](docs/migrations.md)) |
| 5. Doorlist | Rename ✅; events, ticket types and attendee sign-up; claiming tickets without overselling; signed QR tickets; door check-in with offline sync; the release tracker retired in steps ([ADR 6](docs/adr/0006-from-release-tracking-to-event-ticketing.md)) |
| 6. Mobile | React Native (Expo) app: an attendee's tickets, and a door scanner that works offline |
| 7. Polish | Live demo, screenshots, `v1.0.0` |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow, code standards and migration rules.

## License

[MIT](LICENSE)
