using Shiplog.Api.Releases;

namespace Shiplog.Api.Tests;

public sealed class ReleaseVersionTests
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
        Assert.Equal((name, build), ReleaseVersion.Parse(version));

    [Theory]
    [InlineData("2.4.0", 118, "2.4.0 (118)")]
    [InlineData("2.4.0", null, "2.4.0")]
    public void FormatJoinsThemBackUp(string name, int? build, string expected) =>
        Assert.Equal(expected, ReleaseVersion.Format(name, build));
}
