# 2. SQL Server with EF Core code-first migrations

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

Shiplog's data is relational: apps have releases, releases have checklist items and an audit trail, and those links need real foreign keys and transactions. The API is ASP.NET Core, so the data layer should fit naturally with it, and schema changes have to be reviewable and repeatable across environments.

## Decision

- **Database:** SQL Server. Locally and in small deployments this is SQL Server Express in a container, which is free to use in production within its limits (10 GB per database).
- **Data access:** EF Core with code-first migrations. Every schema change is a migration in `api/src/Shiplog.Api/Data/Migrations/`, committed with the code that needs it.
- **Review:** every pull request's CI produces the idempotent SQL script (`dotnet ef migrations script --idempotent`). Reviewers read the SQL that will actually run, not only the C# model diff.
- **Drift check:** CI fails if the model has changes with no migration (`dotnet ef migrations has-pending-model-changes`).
- **Rules:** a migration that has been merged to `main` is never edited or deleted. Fixes are new migrations.

## Consequences

- Schema history lives in git next to the code, and any environment can be brought to any version.
- The SQL Server container image is linux/amd64 only. On Apple Silicon it runs under Rosetta, and production hosts must be x86-64.
- Breaking changes (renames, type changes, dropped columns) need the expand/contract approach so a running API version never meets a schema it can't read. This will be documented in `docs/migrations.md` with the first such change (milestone 4).
