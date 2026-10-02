## What and why

<!-- What this changes, and the reason. Link the issue. -->

Closes #

## How it was checked

<!-- Tests added or run, and anything checked by hand. -->

## Checklist

- [ ] Tests cover the change, and `dotnet test` / `npm test` pass locally
- [ ] Schema change? A new migration is included, and the generated SQL (CI artifact `migrations-sql`) has been read
- [ ] Breaking schema change? It follows expand/contract, so the running API version still works mid-deploy
- [ ] Significant decision? An ADR is added in `docs/adr/`
- [ ] No secrets, real customer data or production connection strings
