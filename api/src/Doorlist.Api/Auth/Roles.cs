namespace Doorlist.Api.Auth;

/// <summary>
/// Viewer reads. Developer works on releases and ships them to non-production
/// environments. Lead does everything, including managing apps and
/// environments and shipping to production.
/// </summary>
public static class Roles
{
    public const string Lead = "Lead";
    public const string Developer = "Developer";
    public const string Viewer = "Viewer";

    public static IReadOnlyList<string> All { get; } = [Lead, Developer, Viewer];
}

public static class Policies
{
    public const string ManageApps = nameof(ManageApps);
    public const string WorkOnReleases = nameof(WorkOnReleases);
}
