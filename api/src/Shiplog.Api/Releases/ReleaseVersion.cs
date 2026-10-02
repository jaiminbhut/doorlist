using System.Globalization;

namespace Shiplog.Api.Releases;

/// <summary>A release's version is a name ("2.4.0") and an optional build number (118), shown as "2.4.0 (118)".</summary>
public static class ReleaseVersion
{
    public static string Format(string name, int? buildNumber) =>
        buildNumber is null ? name : string.Create(CultureInfo.InvariantCulture, $"{name} ({buildNumber})");
}
