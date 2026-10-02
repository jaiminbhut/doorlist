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

The same reasoning moves work earlier. If step 2 will stop writing a NOT NULL column, step 1 must already make it nullable, and step 1's code must already tolerate NULL in it. Otherwise the step 1 API breaks on rows the step 2 API writes, whether the two run side by side or step 2 is rolled back.

Each step is its own pull request and its own release.

## Worked example: splitting `Release.Version`

Releases used to store their version as one string, `"2.4.0 (118)"`. That makes "every build of 2.4.0" or "the highest build number" awkward to query. The change splits it into `VersionName` (`"2.4.0"`) and `BuildNumber` (`118`).

### Step 1: expand

Migration `SplitReleaseVersionExpand`:

- Adds `VersionName` (nullable `nvarchar(50)`) and `BuildNumber` (nullable `int`).
- Backfills them from `Version` with hand-written SQL. EF generates only the two `AddColumn` calls.
- Makes `Version` nullable. Nothing writes NULL yet, so the previous API is unaffected. The point is that step 2 can stop writing it while *this* version may still be running, or be rolled back to.
- Recreates the unique index on `Version` with a `WHERE [Version] IS NOT NULL` filter. SQL Server allows only one NULL in a plain unique index.
- `Down()` is hand-edited too. It rebuilds `Version` from the split fields before dropping them, so rolling back loses nothing.

Code:

- **Writes:** all three columns. `Version` keeps the display form, so the previous API version still reads and de-duplicates correctly.
- **Reads:** `VersionName` and `BuildNumber`, falling back to parsing `Version` for rows the previous version writes during the deploy. A row with no `Version` is fine too.
- **Duplicates:** a new release is checked against both shapes.
- **API:** create requests take `versionName` and `buildNumber`. The old `version` string is still accepted from older clients. Responses add the two fields and keep `version` as the display form.

How it's checked:

- `ReleaseVersionTests` pins the C# parser on edge cases: `"1.0 (beta)"`, `"(7)"`, `"v2(3)"`, and integer overflow.
- `MigrationTests` migrates a fresh database to the migration before this one, inserts rows in the old shape, applies the expand migration, and asserts the SQL backfill gives exactly what `ReleaseVersion.Parse` gives.
- A second migration test goes the other way. It writes rows with no `Version`, rolls the migration back, and checks `Version` is rebuilt.
- The CI compatibility check runs the previous API against the expanded schema.

### Step 2: switch

The code stops mapping `Version`. EF's model no longer has the column at all, so EF reads, writes and selects only `VersionName` and `BuildNumber`. Create requests no longer accept the old `version` string. Every client the step 1 API served already sends the split fields.

Migration `SplitReleaseVersionSwitch`, hand-edited where EF's output would break the step 1 API:

- **Backfills first.** Rows the pre-split API wrote while step 1 was rolling out have only `Version`. The same split SQL runs again, copied in, so the migration stays self-contained.
- **`VersionName` becomes NOT NULL.** EF's generated `defaultValue: ""` is removed, so a row the backfill missed fails loudly instead of being silently blanked.
- **The unique index moves** from `Version` to `(VersionName, BuildNumber)`, with no filter. A release without a build number is still unique per version name.
- **`Version` is kept.** EF generated `DropColumn("Version")` because the model no longer maps it. That line is replaced with a comment: the step 1 API may still be running, and it writes that column. It's already nullable, so new rows simply leave it NULL.
- **`Down()`** removes EF's `AddColumn("Version")`, since the column was never dropped, and rebuilds `Version` for rows this step wrote without it.

How it's checked:

- A migration test writes a row the way the pre-split API did (only `Version`), applies the switch migration, and asserts the split.
- An endpoint test asserts the column is no longer written, and that duplicates are judged on the split fields.
- The rollback test now goes through both steps' `Down()`.
- The CI compatibility check runs the step 1 API on the switched schema.
