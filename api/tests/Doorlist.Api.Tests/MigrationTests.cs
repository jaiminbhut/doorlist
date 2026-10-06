using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Doorlist.Api.Data;

namespace Doorlist.Api.Tests;

/// <summary>
/// Tests a migration's data handling, not just its schema: migrate a fresh
/// database to the version before the migration, write rows the way the API
/// at that version did, then apply the migration and check the rows.
/// </summary>
[Collection(ApiTests.Name)]
public sealed class MigrationTests(DoorlistApiFactory factory)
{
    private const string BeforeVersionSplit = "20261002121352_AddIdentityEnvironmentsAndReleases";
    private const string Expand = "20261002125507_SplitReleaseVersionExpand";
    private const string Switch = "20261002125953_SplitReleaseVersionSwitch";
    private const string VersionContract = "20261002130728_SplitReleaseVersionContract";
    private const string TrackerSwitch = "20261006115448_RetireReleaseTrackerSwitch";

    public static TheoryData<string> OldVersions { get; } =
    [
        "2.4.0 (118)", "2.4.0", "v2(3)", "2.4.0 (1) (2)", "1.0 (beta)", "1.0 ()", "(7)", "1.0 (99999999999)",
    ];

    [Fact]
    public async Task ExpandBackfillsVersionNameAndBuildNumberTheSameWayTheCodeParses()
    {
        await using var db = CreateFreshDatabase();
        await db.GetService<IMigrator>().MigrateAsync(BeforeVersionSplit);

        await db.Database.ExecuteSqlRawAsync("""
            INSERT INTO Apps (Name, CreatedAt) VALUES (N'Field App', SYSDATETIMEOFFSET());
            INSERT INTO Environments (AppId, Name, ApiUrl, IsProduction) VALUES (1, N'staging', N'https://staging.example.com/', 0);
            """);
        foreach (var version in OldVersions)
        {
            await db.Database.ExecuteSqlAsync($"""
                INSERT INTO Releases (AppId, EnvironmentId, Version, Platform, Status, CreatedAt, CreatedBy)
                VALUES (1, 1, {version}, N'Android', N'InProgress', SYSDATETIMEOFFSET(), N'developer@example.com')
                """);
        }

        await db.GetService<IMigrator>().MigrateAsync(Expand);

        var rows = await db.Database
            .SqlQuery<VersionRow>($"SELECT Version, VersionName, BuildNumber FROM Releases")
            .ToListAsync();

        Assert.Equal(OldVersions.Count, rows.Count);
        Assert.All(rows, row => Assert.Equal(LegacyVersion.Parse(row.Version!), (row.VersionName!, row.BuildNumber)));
        await db.Database.EnsureDeletedAsync();
    }

    [Fact]
    public async Task RollingBackTheSwitchAndExpandStepsRestoresVersionFromTheSplitFields()
    {
        await using var db = CreateFreshDatabase();
        await db.GetService<IMigrator>().MigrateAsync(Switch);

        await db.Database.ExecuteSqlRawAsync("""
            INSERT INTO Apps (Name, CreatedAt) VALUES (N'Field App', SYSDATETIMEOFFSET());
            INSERT INTO Environments (AppId, Name, ApiUrl, IsProduction) VALUES (1, N'staging', N'https://staging.example.com/', 0);
            INSERT INTO Releases (AppId, EnvironmentId, Version, VersionName, BuildNumber, Platform, Status, CreatedAt, CreatedBy) VALUES
                (1, 1, NULL, N'2.4.0', 118, N'Android', N'InProgress', SYSDATETIMEOFFSET(), N'developer@example.com'),
                (1, 1, NULL, N'3.0.0', NULL, N'Android', N'InProgress', SYSDATETIMEOFFSET(), N'developer@example.com');
            """);

        await db.GetService<IMigrator>().MigrateAsync(BeforeVersionSplit);

        var versions = await db.Database.SqlQuery<string>($"SELECT Version AS Value FROM Releases ORDER BY Id").ToListAsync();
        Assert.Equal(["2.4.0 (118)", "3.0.0"], versions);
        await db.Database.EnsureDeletedAsync();
    }

    [Fact]
    public async Task SwitchSplitsRowsThePreSplitApiWroteWhileTheExpandStepRolledOut()
    {
        await using var db = CreateFreshDatabase();
        await db.GetService<IMigrator>().MigrateAsync(Expand);

        // The pre-split API knows only Version, so it leaves the new columns NULL.
        await db.Database.ExecuteSqlRawAsync("""
            INSERT INTO Apps (Name, CreatedAt) VALUES (N'Field App', SYSDATETIMEOFFSET());
            INSERT INTO Environments (AppId, Name, ApiUrl, IsProduction) VALUES (1, N'staging', N'https://staging.example.com/', 0);
            INSERT INTO Releases (AppId, EnvironmentId, Version, Platform, Status, CreatedAt, CreatedBy)
            VALUES (1, 1, N'4.0.0 (9)', N'Android', N'InProgress', SYSDATETIMEOFFSET(), N'developer@example.com');
            """);

        await db.GetService<IMigrator>().MigrateAsync(Switch);

        var row = await db.Database
            .SqlQuery<VersionRow>($"SELECT Version, VersionName, BuildNumber FROM Releases")
            .SingleAsync();
        Assert.Equal(("4.0.0 (9)", "4.0.0", 9), (row.Version, row.VersionName, row.BuildNumber));
        await db.Database.EnsureDeletedAsync();
    }

    [Fact]
    public async Task ContractDropsVersionAndItsRollbackRebuildsIt()
    {
        await using var db = CreateFreshDatabase();
        await db.GetService<IMigrator>().MigrateAsync(VersionContract);

        await db.Database.ExecuteSqlRawAsync("""
            INSERT INTO Apps (Name, CreatedAt) VALUES (N'Field App', SYSDATETIMEOFFSET());
            INSERT INTO Environments (AppId, Name, ApiUrl, IsProduction) VALUES (1, N'staging', N'https://staging.example.com/', 0);
            INSERT INTO Releases (AppId, EnvironmentId, VersionName, BuildNumber, Platform, Status, CreatedAt, CreatedBy)
            VALUES (1, 1, N'7.0.0', 12, N'Web', N'InProgress', SYSDATETIMEOFFSET(), N'developer@example.com');
            """);
        var versionColumns = () => db.Database
            .SqlQuery<int>($"SELECT COUNT(*) AS Value FROM sys.columns WHERE object_id = OBJECT_ID(N'Releases') AND name = N'Version'")
            .SingleAsync();

        Assert.Equal(0, await versionColumns());

        await db.GetService<IMigrator>().MigrateAsync(Switch);

        Assert.Equal(1, await versionColumns());
        var version = await db.Database.SqlQuery<string>($"SELECT Version AS Value FROM Releases").SingleAsync();
        Assert.Equal("7.0.0 (12)", version);
        await db.Database.EnsureDeletedAsync();
    }

    [Fact]
    public async Task RetiringTheTrackerDropsItsTablesAndOnlyTheDemoUsersMadeForIt()
    {
        await using var db = CreateFreshDatabase();
        await db.GetService<IMigrator>().MigrateAsync(TrackerSwitch);

        // As a database looked after the switch step: the tracker's roles and
        // demo users, one of which has since been made an organizer.
        await db.Database.ExecuteSqlRawAsync("""
            INSERT INTO AspNetRoles (Id, Name, NormalizedName) VALUES
                (N'r-lead', N'Lead', N'LEAD'), (N'r-dev', N'Developer', N'DEVELOPER'), (N'r-org', N'Organizer', N'ORGANIZER');
            INSERT INTO AspNetUsers (Id, UserName, NormalizedUserName, Email, NormalizedEmail, EmailConfirmed, PhoneNumberConfirmed,
                                     TwoFactorEnabled, LockoutEnabled, AccessFailedCount, DisplayName) VALUES
                (N'u-lead', N'lead@example.com', N'LEAD@EXAMPLE.COM', N'lead@example.com', N'LEAD@EXAMPLE.COM', 1, 0, 0, 1, 0, N'Demo Lead'),
                (N'u-dev', N'developer@example.com', N'DEVELOPER@EXAMPLE.COM', N'developer@example.com', N'DEVELOPER@EXAMPLE.COM', 1, 0, 0, 1, 0, N'Demo Developer');
            INSERT INTO AspNetUserRoles (UserId, RoleId) VALUES (N'u-lead', N'r-lead'), (N'u-dev', N'r-dev'), (N'u-dev', N'r-org');
            INSERT INTO Apps (Name, CreatedAt) VALUES (N'Field App', SYSDATETIMEOFFSET());
            """);

        await db.GetService<IMigrator>().MigrateAsync();

        Assert.Equal(0, await CountAsync(db, "SELECT COUNT(*) AS Value FROM sys.tables WHERE name IN ('Apps', 'Environments', 'Releases', 'ChecklistItems')"));
        Assert.Equal(["Organizer"], await db.Database.SqlQuery<string>($"SELECT Name AS Value FROM AspNetRoles").ToListAsync());
        Assert.Equal(["developer@example.com"], await db.Database.SqlQuery<string>($"SELECT Email AS Value FROM AspNetUsers").ToListAsync());

        await db.GetService<IMigrator>().MigrateAsync(TrackerSwitch);

        Assert.Equal(4, await CountAsync(db, "SELECT COUNT(*) AS Value FROM sys.tables WHERE name IN ('Apps', 'Environments', 'Releases', 'ChecklistItems')"));
        await db.Database.EnsureDeletedAsync();
    }

    private static Task<int> CountAsync(DoorlistDbContext db, string sql) =>
        db.Database.SqlQueryRaw<int>(sql).SingleAsync();

    private DoorlistDbContext CreateFreshDatabase()
    {
        var connection = new SqlConnectionStringBuilder(factory.ConnectionString)
        {
            InitialCatalog = $"MigrationTest_{Guid.NewGuid():N}",
        };

        return new DoorlistDbContext(new DbContextOptionsBuilder<DoorlistDbContext>()
            .UseSqlServer(connection.ConnectionString)
            .Options);
    }

    private sealed class VersionRow
    {
        public string? Version { get; init; }

        public string? VersionName { get; init; }

        public int? BuildNumber { get; init; }
    }
}
