using System.Globalization;
using System.Text.RegularExpressions;

namespace Doorlist.Api.Tests;

/// <summary>
/// How the old single-string Version ("2.4.0 (118)") splits into a name and
/// a build number. The API no longer reads that form, but the expand and
/// switch migrations still split it with SQL on any database they run on,
/// and MigrationTests checks that SQL against this.
/// </summary>
public static partial class LegacyVersion
{
    public static (string Name, int? BuildNumber) Parse(string version)
    {
        var trimmed = version.Trim();
        var match = NameAndBuild().Match(trimmed);

        return match.Success && int.TryParse(match.Groups["build"].Value, NumberStyles.None, CultureInfo.InvariantCulture, out var build)
            ? (match.Groups["name"].Value, build)
            : (trimmed, null);
    }

    [GeneratedRegex(@"^(?<name>.*\S)\s*\((?<build>[0-9]+)\)$")]
    private static partial Regex NameAndBuild();
}
