# Shiplog

A release tracker for teams that ship mobile and web apps. It keeps track of each app, its environments, its releases and the checklist each release has to pass. That checklist includes the check that catches the classic mistake of a staging build going to production: confirming the target environment and API URL before anything ships.

Shiplog is also a public reference project. Alongside the features, it shows how the whole product is built and run: an Angular front end, an ASP.NET Core API on SQL Server, EF Core migrations that run as their own deploy step, Docker, CI on every pull request, and the decisions behind each of these, written down.

> **Status:** milestone 2 of 5 (domain and auth). See the [roadmap](#roadmap).

## What it does

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
| Migrations | EF Core migration bundle, run as a separate step before the API starts ([ADR 3](docs/adr/0003-run-migrations-as-a-separate-step.md)) |
| Tests | xUnit integration tests against a real SQL Server (Testcontainers) |
| Delivery | Docker multi-stage images, docker compose, GitHub Actions |

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

Local demo accounts, all with the password `Shiplog-demo-2026`:

| Email | Role |
|---|---|
| `lead@example.com` | Lead |
| `developer@example.com` | Developer |
| `viewer@example.com` | Viewer |

## Repository layout

```
api/                     ASP.NET Core API, EF Core, migrations, tests
  src/Shiplog.Api/
  tests/Shiplog.Api.Tests/
web/                     Angular app
docs/adr/                Architecture decision records
.github/workflows/ci.yml CI: build, tests, migration checks, full-stack smoke test
docker-compose.yml       Local stack
```

## Roadmap

| Milestone | Scope |
|---|---|
| 1. Skeleton ✅ | `docker compose up` runs end to end; CI on every pull request |
| 2. Domain and auth ✅ | Apps, environments, releases, checklists; ASP.NET Core Identity + JWT with roles; Angular release board |
| 3. Deploy pipeline | Images to GHCR; release workflow with env verification, DB backup, migration bundle, API rollout and health check; staging and production; Content-Security-Policy |
| 4. Expand/contract | A breaking schema change shipped across two releases with no downtime, documented in `docs/migrations.md` |
| 5. Polish | Demo account, screenshots, `v1.0.0` |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow, code standards and migration rules.

## License

[MIT](LICENSE)
