namespace Doorlist.Api.Auth;

/// <summary>
/// Doorlist's roles: Organizer runs events; DoorStaff checks tickets at the
/// door; Attendee signs up and claims tickets. Lead, Developer and Viewer
/// belong to the retired release tracker and are removed with it (ADR 6).
/// </summary>
public static class Roles
{
    public const string Organizer = "Organizer";
    public const string DoorStaff = "DoorStaff";
    public const string Attendee = "Attendee";

    public const string Lead = "Lead";
    public const string Developer = "Developer";
    public const string Viewer = "Viewer";

    public static IReadOnlyList<string> All { get; } = [Organizer, DoorStaff, Attendee, Lead, Developer, Viewer];
}

public static class Policies
{
    public const string ManageEvents = nameof(ManageEvents);
    public const string ClaimTickets = nameof(ClaimTickets);

    public const string ManageApps = nameof(ManageApps);
    public const string WorkOnReleases = nameof(WorkOnReleases);
}
