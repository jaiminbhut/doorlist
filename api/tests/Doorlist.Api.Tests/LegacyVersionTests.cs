namespace Doorlist.Api.Tests;

/// <summary>
/// Pins how the retired release tracker's old "2.4.0 (118)" version string
/// splits. MigrationTests uses this to check the historical expand and switch
/// migrations, which still run on every new database.
/// </summary>
public sealed class LegacyVersionTests
{
    public static TheoryData<string, string, int?> Versions { get; } = new()
    {
        { "2.4.0 (118)", "2.4.0", 118 },
        { "2.4.0", "2.4.0", null },
        { "  3.0.0 (7)  ", "3.0.0", 7 },
        { "v2(3)", "v2", 3 },
        { "2.4.0 (1) (2)", "2.4.0 (1)", 2 },
        { "1.0 (beta)", "1.0 (beta)", null },
        { "1.0 ()", "1.0 ()", null },
        { "(7)", "(7)", null },
        { "1.0 (99999999999)", "1.0 (99999999999)", null },
    };

    [Theory]
    [MemberData(nameof(Versions))]
    public void ParseSplitsANameAndATrailingBuildNumber(string version, string name, int? build) =>
        Assert.Equal((name, build), LegacyVersion.Parse(version));
}
