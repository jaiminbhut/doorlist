namespace Doorlist.Api.Events;

public enum EventStatus
{
    Draft,
    Published,
}

/// <summary>
/// An event people can get tickets for. Drafts are visible only to
/// organizers; once published, anyone can see it and attendees can claim
/// tickets until it starts.
/// </summary>
public sealed class Event
{
    public const int NameMaxLength = 150;
    public const int VenueMaxLength = 200;
    public const int DescriptionMaxLength = 2000;
    public const int UserMaxLength = 256;

    public int Id { get; set; }

    public required string Name { get; set; }

    public required string Venue { get; set; }

    public string? Description { get; set; }

    public DateTimeOffset StartsAt { get; set; }

    public DateTimeOffset EndsAt { get; set; }

    public EventStatus Status { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    /// <summary>The organizer's email. Kept as text so history survives user changes.</summary>
    public required string CreatedBy { get; set; }

    public DateTimeOffset? PublishedAt { get; set; }

    public ICollection<TicketType> TicketTypes { get; } = new List<TicketType>();
}

/// <summary>
/// A kind of ticket for an event ("General admission", "Speaker") with a
/// fixed capacity. <see cref="Remaining"/> is decremented atomically when
/// tickets are claimed, and a database check keeps it between 0 and
/// <see cref="Capacity"/>, so an event can never issue more than it has
/// (ADR 7).
/// </summary>
public sealed class TicketType
{
    public const int NameMaxLength = 100;
    public const int MaxCapacity = 100_000;

    public int Id { get; set; }

    public int EventId { get; set; }

    public Event Event { get; set; } = null!;

    public required string Name { get; set; }

    public int Capacity { get; set; }

    public int Remaining { get; set; }
}
