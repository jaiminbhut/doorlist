# 5. Deploy to a single server with Docker Compose

- **Status:** Accepted
- **Date:** 2026-10-05

## Context

Shiplog needs public staging and production environments on a small budget and with little traffic. It still needs a deploy you'd trust with real data: an approval before production, a backup before every migration, a check that a staging build can't land in production, and a way back when a release is bad.

Managed services (App Runner or ECS for the API, RDS for SQL Server) would remove the server work, but at several times the monthly cost, and RDS for SQL Server has no small free option. SQL Server's container image is x86-64 only, and won't start below 2 GB of RAM.

## Decision

- **One x86-64 Ubuntu server** (AWS Lightsail, 2 GB to start), running Docker Compose.
- **Caddy** terminates HTTPS with automatic Let's Encrypt certificates, routes `shiplog.devtownhall.com` and `shiplog-staging.devtownhall.com` to their environments, and adds HSTS. nginx, inside each web image, adds the Content-Security-Policy (no inline scripts) and the other security headers, so they're the same locally and deployed.
- **One SQL Server Express container** holds a database per environment. Each database has two logins: a migrator with `db_owner`, used only by the migration bundle, and an app login with read and write on data, used by the API and the demo-user seed (ADR 3).
- **Images** for the API, the migration bundle and the web app are built once per commit, pushed to GHCR tagged with the commit, and promoted unchanged from staging to production.
- **GitHub Actions** deploys over SSH as a dedicated `deploy` user. It writes each environment's settings from GitHub secrets, copies `deploy/`, and runs `deploy/scripts/deploy.sh`: target check, database and logins, pull, backup, migrate, seed, swap, health check, and rollback to the previous images on failure. Production is a GitHub environment that needs a reviewer and accepts only `main`.
- **Rehearsal:** `scripts/rehearse-deploy.sh` runs the same deploy script against local Docker and exercises its failure paths.

## Consequences

- It costs one small server a month, and staging and production have the same shape.
- The server is a single point of failure. If it goes, both environments go until it's rebuilt from `bootstrap.sh` and a backup.
- Swapping the API container on one server drops requests for a few seconds. The schema compatibility rule (docs/migrations.md) is what makes rollbacks and old-and-new overlap safe; it doesn't make the swap seamless. Zero-downtime swaps would need two API instances behind the proxy, and a later ADR.
- Backups are on the server's disk until they're also copied off it (Lightsail snapshots, or object storage).
- SQL Server Express limits each database to 10 GB and caps its memory use, which is far more than Shiplog needs.
- If traffic or availability needs grow, the same images move to managed hosting without changing the application.
