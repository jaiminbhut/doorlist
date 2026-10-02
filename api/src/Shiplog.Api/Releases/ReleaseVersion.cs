using System.Globalization;
using System.Text.RegularExpressions;

namespace Shiplog.Api.Releases;

/// <summary>
/// A release's version is a name ("2.4.0") and an optional build number
/// (118), shown together as "2.4.0 (118)". Until the split, both lived in one
/// Version string; see docs/migrations.md.
/// </summary>
public static partial class ReleaseVersion
{
    public static string Format(string name, int? buildNumber) =>
        buildNumber is null ? name : string.Create(CultureInfo.InvariantCulture, $"{name} ({buildNumber})");

    /// <summary>
    /// Splits the old single-string form. "2.4.0 (118)" becomes ("2.4.0", 118). Anything
    /// that doesn't end in a parenthesised whole number stays a name with no build.
    /// Must agree with the backfill SQL in the SplitReleaseVersionExpand migration.
    /// </summary>
    public static (string Name, int? BuildNumber) Parse(string version)
    {
        var trimmed = version.Trim();
        var match = NameAndBuild().Match(trimmed);

        return match.Success && int.TryParse(match.Groups["build"].Value, NumberStyles.None, CultureInfo.InvariantCulture, out var build)
            ? (match.Groups["name"].Value, build)
            : (trimmed, null);
    }

    /// <summary>
    /// A row's version from whichever shape it has: the split fields, or only the
    /// old <c>Version</c> string if the previous API version wrote it during a deploy.
    /// </summary>
    public static (string Name, int? BuildNumber) Resolve(string? version, string? versionName, int? buildNumber) =>
        versionName is not null ? (versionName, buildNumber)
        : version is not null ? Parse(version)
        : throw new InvalidOperationException("A release has neither a version name nor a version.");

    [GeneratedRegex(@"^(?<name>.*\S)\s*\((?<build>[0-9]+)\)$")]
    private static partial Regex NameAndBuild();
}
