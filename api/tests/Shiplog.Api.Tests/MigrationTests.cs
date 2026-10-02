using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Shiplog.Api.Data;
using Shiplog.Api.Releases;

namespace Shiplog.Api.Tests;

/// <summary>
/// Tests a migration's data handling, not just its schema: migrate a fresh
/// database to the version before the migration, write rows the way the API
/// at that version did, then apply the migration and check the rows.
/// </summary>
[Collection(ApiTests.Name)]
public sealed class MigrationTests(ShiplogApiFactory factory)
{
    private const string BeforeVersionSplit = "20261002121352_AddIdentityEnvironmentsAndReleases";

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

        await db.GetService<IMigrator>().MigrateAsync();

        var rows = await db.Database
            .SqlQuery<VersionRow>($"SELECT Version, VersionName, BuildNumber FROM Releases")
            .ToListAsync();

        Assert.Equal(OldVersions.Count, rows.Count);
        Assert.All(rows, row => Assert.Equal(ReleaseVersion.Parse(row.Version), (row.VersionName!, row.BuildNumber)));
        await db.Database.EnsureDeletedAsync();
    }

    [Fact]
    public async Task RollingBackTheExpandStepRestoresVersionFromTheSplitFields()
    {
        await using var db = CreateFreshDatabase();
        await db.GetService<IMigrator>().MigrateAsync();

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

    private ShiplogDbContext CreateFreshDatabase()
    {
        var connection = new SqlConnectionStringBuilder(factory.ConnectionString)
        {
            InitialCatalog = $"MigrationTest_{Guid.NewGuid():N}",
        };

        return new ShiplogDbContext(new DbContextOptionsBuilder<ShiplogDbContext>()
            .UseSqlServer(connection.ConnectionString)
            .Options);
    }

    private sealed class VersionRow
    {
        public required string Version { get; init; }

        public string? VersionName { get; init; }

        public int? BuildNumber { get; init; }
    }
}
