namespace Doorlist.Api.Auth;

/// <summary>
/// Organizer runs events; DoorStaff checks tickets at the door; Attendee
/// signs up and claims tickets. (The release tracker's Lead, Developer and
/// Viewer roles were retired with it, ADR 6.)
/// </summary>
public static class Roles
{
    public const string Organizer = "Organizer";
    public const string DoorStaff = "DoorStaff";
    public const string Attendee = "Attendee";

    public static IReadOnlyList<string> All { get; } = [Organizer, DoorStaff, Attendee];
}

public static class Policies
{
    public const string ManageEvents = nameof(ManageEvents);
    public const string ClaimTickets = nameof(ClaimTickets);
    public const string CheckIn = nameof(CheckIn);
}
