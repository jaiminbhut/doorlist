# Changing the schema without downtime

Shiplog's deploy order is fixed ([ADR 3](adr/0003-run-migrations-as-a-separate-step.md)): the migration bundle runs first, then the new API starts. So for a while, **the previous API version runs against the new schema**. On a single server that's the seconds between the migration and the container swap. With more than one instance, or a rollback, it's longer.

Every migration therefore has one rule:

> The API version currently in production must keep working after this migration runs.

## The check

CI enforces the rule on every pull request (`schema-compat` job, [`scripts/check-schema-compat.sh`](../scripts/check-schema-compat.sh)):

1. Build the API and the migration bundle from `main`, which is what production runs, and the bundle from the PR.
2. Start SQL Server, apply `main`'s migrations, start `main`'s API, and write data with it: an app, an environment, a release, its checklist, and a ship.
3. Run the PR's migrations while `main`'s API keeps running.
4. Check that `main`'s API still reads the existing data, and can write and ship a new release.

Run it locally the same way:

```sh
scripts/check-schema-compat.sh main
```

A naive change fails it. Renaming the `Version` column in a single migration makes step 4 fail with `Invalid column name 'Version'`. The previous API still selects and inserts the old name, and EF Core reads every mapped column, even ones a query doesn't use.

## What's safe in one step

| Change | One step? | Why |
|---|---|---|
| Add a table | Yes | The previous API doesn't know it exists. |
| Add a nullable column, or one with a default | Yes | The previous API's inserts leave it out and still succeed. |
| Add an index | Yes, if existing rows satisfy it | Watch unique indexes against data the previous API can still write. |
| Add a NOT NULL column without a default | No | The previous API's inserts fail. Add it nullable, backfill, then tighten. |
| Rename, split or retype a column | No | The previous API reads and writes the old shape. Use expand/contract. |
| Drop a column or table | Only once no running version maps it | Ship the code that stops using it first. |

## Expand/contract

A breaking change is split into steps, and each step passes the check against the one before it. A column rename or split takes three:

1. **Expand.** Add the new shape alongside the old one and backfill it. The code writes both and reads the new shape, falling back to the old.
2. **Switch.** The code stops mapping the old column. The migration backfills anything the previous version wrote only in the old shape, then makes the old column nullable instead of dropping it, because the previous version still writes to it.
3. **Contract.** Drop the old column. No running version maps it any more.

Steps 2 and 3 can't be merged. While step 3's migration runs, the step 2 API must still be able to read the table, so the step 2 API must not map the column being dropped.

Each step is its own pull request and its own release.
