using Doorlist.Api.Events;
using Doorlist.Api.Tickets;

namespace Doorlist.Api.CheckIns;

public enum CheckInOutcome
{
    /// <summary>The first recorded admission of this ticket.</summary>
    Admitted,

    /// <summary>The ticket had already been admitted: refuse entry, or flag it if a device admitted it offline.</summary>
    AlreadyAdmitted,

    /// <summary>A genuine ticket, but for another event.</summary>
    WrongEvent,

    /// <summary>Not a code Doorlist issued, or one that's been changed.</summary>
    Invalid,
}

/// <summary>
/// One scan at a door, as recorded by the server (ADR 8). Every scan is kept,
/// including refused and invalid ones. At most one per ticket is Admitted;
/// the database enforces that, whatever order devices sync in.
/// </summary>
public sealed class CheckIn
{
    public const int DeviceIdMaxLength = 100;
    public const int DeviceLabelMaxLength = 50;
    public const int UserMaxLength = 256;

    public long Id { get; set; }

    /// <summary>Chosen by the device, so a batch sent twice is recorded once.</summary>
    public Guid ScanId { get; set; }

    /// <summary>The event the door was checking in for.</summary>
    public int EventId { get; set; }

    public Event Event { get; set; } = null!;

    /// <summary>Null when the code wasn't a valid ticket.</summary>
    public Guid? TicketId { get; set; }

    public Ticket? Ticket { get; set; }

    public CheckInOutcome Outcome { get; set; }

    /// <summary>When the device scanned it, by the device's clock. Offline scans arrive later.</summary>
    public DateTimeOffset ScannedAt { get; set; }

    /// <summary>When the server recorded it.</summary>
    public DateTimeOffset ReceivedAt { get; set; }

    public required string DeviceId { get; set; }

    public string? DeviceLabel { get; set; }

    /// <summary>The door staff member's email.</summary>
    public required string ScannedBy { get; set; }
}
