# 3. Run migrations as a separate step, not on API startup

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

A common shortcut is to call `Database.Migrate()` when the API starts. That ties schema changes to app startup. If several instances start at once, they race. A failed migration shows up as an API that won't boot. The API's database login needs rights to change the schema. And nothing outside the API can run, check, or gate the migration.

## Decision

The API never migrates the database. Migrations are compiled into an EF Core **migration bundle** (`dotnet ef migrations bundle`), a single executable built from the same commit as the API. It is shipped as its own image (`api/Dockerfile`, target `migrate`) and runs as a separate step that must succeed before the API starts:

- **Locally:** docker compose runs `migrate` once, and `api` starts only after it exits successfully (`service_completed_successfully`).
- **In deployment (milestone 3):** the release workflow backs up the database, runs the bundle, then rolls out the API and checks `/api/health`. A failed migration stops the release before the new API is started.

The bundle takes its connection string at run time (`--connection`), and the EF tools use a design-time factory (`DesignTimeDbContextFactory`), so building the bundle needs no database or secrets.

## Consequences

- Schema changes have one clear place to succeed or fail, visible in the deploy log.
- The API's runtime login can be limited to reading and writing data. Schema rights belong to the migration step only (milestone 3).
- Tests apply the same committed migrations to a throwaway SQL Server (Testcontainers), so a broken migration fails CI.
- There is one more image to build and one more step to run on each release.
