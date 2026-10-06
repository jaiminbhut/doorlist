using System.Security.Claims;
using Doorlist.Api.Auth;
using Doorlist.Api.Data;
using Doorlist.Api.Events;
using Doorlist.Api.Tickets;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace Doorlist.Api.CheckIns;

public sealed record ScanRequest(Guid ScanId, string? Code, DateTimeOffset ScannedAt);

/// <summary>One scan when the device is online; everything it queued when it comes back.</summary>
public sealed record CheckInRequest(string? DeviceId, string? DeviceLabel, ScanRequest[]? Scans);

/// <summary>
/// What happened to one scan. For Admitted and AlreadyAdmitted, AdmittedAt and
/// AdmittedAtDoor describe the ticket's first admission.
/// </summary>
public sealed record ScanResult(
    Guid ScanId,
    CheckInOutcome Outcome,
    Guid? TicketId,
    string? HolderName,
    string? TicketTypeName,
    DateTimeOffset? AdmittedAt,
    string? AdmittedAtDoor);

public sealed record CheckInResponse(ScanResult[] Results);

public sealed record FlaggedScan(
    Guid TicketId,
    string HolderName,
    string TicketTypeName,
    DateTimeOffset? FirstAdmittedAt,
    string? FirstAdmittedAtDoor,
    DateTimeOffset ScannedAt,
    string ScannedAtDoor);

public sealed record CheckInSummary(
    int Issued,
    int Admitted,
    int Duplicates,
    int Invalid,
    int WrongEvent,
    FlaggedScan[] RecentDuplicates);

public static class CheckInEndpoints
{
    public const int MaxScansPerBatch = 200;
    private const int MaxCodeLength = 500;

    public static void MapCheckInEndpoints(this IEndpointRouteBuilder routes)
    {
        var checkIns = routes.MapGroup("/api/events/{id:int}/checkins")
            .WithTags("Check-in")
            .RequireAuthorization(Policies.CheckIn);

        checkIns.MapPost("/", Record);
        checkIns.MapGet("/summary", Summary);
    }

    /// <summary>
    /// Records a batch of scans in the order the device sent them (ADR 8). Each
    /// scan is recorded once, by its ScanId. The first admission of a ticket
    /// wins: the database allows only one Admitted row per ticket, so whichever
    /// device's scan is recorded first admits it, and later scans come back as
    /// AlreadyAdmitted with when and where the first admission happened.
    /// </summary>
    private static async Task<Results<Ok<CheckInResponse>, NotFound, ValidationProblem>> Record(
        int id,
        CheckInRequest request,
        DoorlistDbContext db,
        TicketSigner signer,
        ClaimsPrincipal user,
        TimeProvider clock,
        CancellationToken ct)
    {
        var deviceId = request.DeviceId?.Trim() ?? "";
        var deviceLabel = string.IsNullOrWhiteSpace(request.DeviceLabel) ? null : request.DeviceLabel.Trim();
        var scans = request.Scans ?? [];
        var errors = new Dictionary<string, string[]>();

        if (deviceId.Length == 0 || deviceId.Length > CheckIn.DeviceIdMaxLength)
        {
            errors["deviceId"] = [$"Device id is required and must be at most {CheckIn.DeviceIdMaxLength} characters."];
        }

        if (deviceLabel?.Length > CheckIn.DeviceLabelMaxLength)
        {
            errors["deviceLabel"] = [$"Door name must be at most {CheckIn.DeviceLabelMaxLength} characters."];
        }

        if (scans.Length is 0 or > MaxScansPerBatch)
        {
            errors["scans"] = [$"Send between 1 and {MaxScansPerBatch} scans."];
        }
        else if (scans.Any(scan => scan.ScanId == Guid.Empty))
        {
            errors["scans"] = ["Every scan needs its own scan id."];
        }

        if (errors.Count > 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        if (!await db.Events.AnyAsync(e => e.Id == id && e.Status == EventStatus.Published, ct))
        {
            return TypedResults.NotFound();
        }

        var door = new Door(deviceId, deviceLabel, user.Email(), clock.GetUtcNow());
        var results = new List<ScanResult>(scans.Length);
        foreach (var scan in scans)
        {
            results.Add(await RecordScanAsync(db, signer, id, scan, door, ct));
        }

        return TypedResults.Ok(new CheckInResponse([.. results]));
    }

    private sealed record Door(string DeviceId, string? DeviceLabel, string StaffEmail, DateTimeOffset ReceivedAt);

    private static async Task<ScanResult> RecordScanAsync(
        DoorlistDbContext db, TicketSigner signer, int eventId, ScanRequest scan, Door door, CancellationToken ct)
    {
        // A retried batch: answer exactly as the first time.
        if (await RecordedResultAsync(db, scan.ScanId, ct) is { } recorded)
        {
            return recorded;
        }

        Ticket? ticket = null;
        if (scan.Code?.Length <= MaxCodeLength && signer.TryVerify(scan.Code, out var ticketId, out _))
        {
            ticket = await db.Tickets.AsNoTracking().FirstOrDefaultAsync(t => t.Id == ticketId, ct);
        }

        var outcome = ticket is null ? CheckInOutcome.Invalid
            : ticket.EventId != eventId ? CheckInOutcome.WrongEvent
            : CheckInOutcome.Admitted;

        if (!await TryRecordAsync(db, scan, eventId, ticket?.Id, outcome, door, ct))
        {
            // Either this same scan was recorded by a concurrent retry, or
            // another scan admitted the ticket first.
            if (await RecordedResultAsync(db, scan.ScanId, ct) is { } raced)
            {
                return raced;
            }

            await TryRecordAsync(db, scan, eventId, ticket?.Id, CheckInOutcome.AlreadyAdmitted, door, ct);
        }

        return await RecordedResultAsync(db, scan.ScanId, ct)
            ?? throw new InvalidOperationException($"Scan {scan.ScanId} was not recorded.");
    }

    private static async Task<bool> TryRecordAsync(
        DoorlistDbContext db, ScanRequest scan, int eventId, Guid? ticketId, CheckInOutcome outcome, Door door, CancellationToken ct)
    {
        db.CheckIns.Add(new CheckIn
        {
            ScanId = scan.ScanId,
            EventId = eventId,
            TicketId = ticketId,
            Outcome = outcome,
            ScannedAt = scan.ScannedAt,
            ReceivedAt = door.ReceivedAt,
            DeviceId = door.DeviceId,
            DeviceLabel = door.DeviceLabel,
            ScannedBy = door.StaffEmail,
        });

        try
        {
            await db.SaveChangesAsync(ct);
            return true;
        }
        catch (DbUpdateException exception) when (exception.InnerException is SqlException { Number: 2601 or 2627 })
        {
            // A unique index said no: the scan id, or the one-admission-per-ticket rule.
            db.ChangeTracker.Clear();
            return false;
        }
    }

    private static async Task<ScanResult?> RecordedResultAsync(DoorlistDbContext db, Guid scanId, CancellationToken ct)
    {
        var recorded = await db.CheckIns
            .AsNoTracking()
            .Where(c => c.ScanId == scanId)
            .Select(c => new
            {
                c.ScanId,
                c.Outcome,
                c.TicketId,
                HolderName = c.Ticket != null ? c.Ticket.Holder.DisplayName : null,
                TicketTypeName = c.Ticket != null ? c.Ticket.TicketType.Name : null,
                FirstAdmission = db.CheckIns
                    .Where(a => a.TicketId != null && a.TicketId == c.TicketId && a.Outcome == CheckInOutcome.Admitted)
                    .Select(a => new { a.ScannedAt, Door = a.DeviceLabel ?? a.DeviceId })
                    .FirstOrDefault(),
            })
            .FirstOrDefaultAsync(ct);

        if (recorded is null)
        {
            return null;
        }

        var admitted = recorded.Outcome is CheckInOutcome.Admitted or CheckInOutcome.AlreadyAdmitted;
        return new ScanResult(
            recorded.ScanId,
            recorded.Outcome,
            recorded.TicketId,
            recorded.HolderName,
            recorded.TicketTypeName,
            admitted ? recorded.FirstAdmission?.ScannedAt : null,
            admitted ? recorded.FirstAdmission?.Door : null);
    }

    private static async Task<Results<Ok<CheckInSummary>, NotFound>> Summary(int id, DoorlistDbContext db, CancellationToken ct)
    {
        if (!await db.Events.AnyAsync(e => e.Id == id, ct))
        {
            return TypedResults.NotFound();
        }

        var issued = await db.Tickets.CountAsync(t => t.EventId == id, ct);
        var counts = await db.CheckIns
            .Where(c => c.EventId == id)
            .GroupBy(c => c.Outcome)
            .Select(group => new { Outcome = group.Key, Count = group.Count() })
            .ToDictionaryAsync(row => row.Outcome, row => row.Count, ct);

        var duplicates = await db.CheckIns
            .AsNoTracking()
            .Where(c => c.EventId == id && c.Outcome == CheckInOutcome.AlreadyAdmitted && c.Ticket != null)
            .OrderByDescending(c => c.ReceivedAt)
            .Take(20)
            .Select(c => new FlaggedScan(
                c.TicketId!.Value,
                c.Ticket!.Holder.DisplayName,
                c.Ticket.TicketType.Name,
                db.CheckIns.Where(a => a.TicketId == c.TicketId && a.Outcome == CheckInOutcome.Admitted).Select(a => (DateTimeOffset?)a.ScannedAt).FirstOrDefault(),
                db.CheckIns.Where(a => a.TicketId == c.TicketId && a.Outcome == CheckInOutcome.Admitted).Select(a => a.DeviceLabel ?? a.DeviceId).FirstOrDefault(),
                c.ScannedAt,
                c.DeviceLabel ?? c.DeviceId))
            .ToArrayAsync(ct);

        return TypedResults.Ok(new CheckInSummary(
            issued,
            counts.GetValueOrDefault(CheckInOutcome.Admitted),
            counts.GetValueOrDefault(CheckInOutcome.AlreadyAdmitted),
            counts.GetValueOrDefault(CheckInOutcome.Invalid),
            counts.GetValueOrDefault(CheckInOutcome.WrongEvent),
            duplicates));
    }
}
