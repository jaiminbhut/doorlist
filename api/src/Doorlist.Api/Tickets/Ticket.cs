using Doorlist.Api.Auth;
using Doorlist.Api.Events;

namespace Doorlist.Api.Tickets;

/// <summary>One admission, held by one attendee, shown as a signed QR code.</summary>
public sealed class Ticket
{
    public const int CodeMaxLength = 200;

    public Guid Id { get; set; }

    public int EventId { get; set; }

    public Event Event { get; set; } = null!;

    public int TicketTypeId { get; set; }

    public TicketType TicketType { get; set; } = null!;

    public required string HolderId { get; set; }

    public DoorlistUser Holder { get; set; } = null!;

    public DateTimeOffset IssuedAt { get; set; }

    /// <summary>The signed code the QR shows (ADR 7). Stored, because each signature is randomised.</summary>
    public required string Code { get; set; }
}
