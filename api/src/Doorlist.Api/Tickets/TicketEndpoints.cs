using System.Security.Claims;
using Doorlist.Api.Auth;
using Doorlist.Api.Data;
using Doorlist.Api.Events;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Doorlist.Api.Tickets;

public sealed record ClaimTicketsRequest(int TicketTypeId, int Quantity);

public sealed record TicketResponse(
    Guid Id,
    int EventId,
    string EventName,
    string Venue,
    DateTimeOffset StartsAt,
    string TicketTypeName,
    DateTimeOffset IssuedAt,
    string Code);

/// <summary>What a door device needs to check ticket codes offline (ADR 7).</summary>
public sealed record SigningKeyResponse(string Algorithm, string KeyId, string PublicKey, string CodeFormat);

public static class TicketEndpoints
{
    /// <summary>The most tickets one attendee can hold for one event.</summary>
    public const int MaxTicketsPerAttendee = 4;

    public static void MapTicketEndpoints(this IEndpointRouteBuilder routes)
    {
        routes.MapPost("/api/events/{id:int}/tickets", Claim)
            .WithTags("Tickets")
            .RequireAuthorization(Policies.ClaimTickets);

        var tickets = routes.MapGroup("/api/tickets").WithTags("Tickets");
        tickets.MapGet("/mine", Mine);
        tickets.MapGet("/signing-key", SigningKey).AllowAnonymous();
    }

    /// <summary>
    /// Claims tickets without ever issuing more than a ticket type's capacity,
    /// however many claims arrive at once (ADR 7). Inside one transaction:
    /// take a lock for this attendee and event, so the per-attendee limit holds
    /// under concurrent requests; reserve the quantity with one conditional
    /// UPDATE that succeeds only if enough remain; then issue the tickets.
    /// </summary>
    private static async Task<Results<Created<TicketResponse[]>, NotFound, ValidationProblem, Conflict<ProblemDetails>>> Claim(
        int id,
        ClaimTicketsRequest request,
        DoorlistDbContext db,
        TicketSigner signer,
        ClaimsPrincipal user,
        TimeProvider clock,
        CancellationToken ct)
    {
        if (request.Quantity is < 1 or > MaxTicketsPerAttendee)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                ["quantity"] = [$"Claim between 1 and {MaxTicketsPerAttendee} tickets."],
            });
        }

        var now = clock.GetUtcNow();
        var e = await db.Events.AsNoTracking()
            .Include(e => e.TicketTypes)
            .FirstOrDefaultAsync(e => e.Id == id && e.Status == EventStatus.Published, ct);

        if (e is null)
        {
            return TypedResults.NotFound();
        }

        var type = e.TicketTypes.FirstOrDefault(t => t.Id == request.TicketTypeId);
        if (type is null)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                ["ticketTypeId"] = ["Pick one of this event's ticket types."],
            });
        }

        if (e.StartsAt <= now)
        {
            return TypedResults.Conflict(Problems.Conflict("This event has started, so its tickets are no longer available."));
        }

        var holderId = user.UserId();
        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        var claimLock = $"claim:{id}:{holderId}";
        await db.Database.ExecuteSqlAsync(
            $"""
            DECLARE @result int;
            EXEC @result = sp_getapplock @Resource = {claimLock}, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 10000;
            IF @result < 0 THROW 50001, 'Could not take the claim lock.', 1;
            """,
            ct);

        var held = await db.Tickets.CountAsync(t => t.EventId == id && t.HolderId == holderId, ct);
        if (held + request.Quantity > MaxTicketsPerAttendee)
        {
            return TypedResults.Conflict(Problems.Conflict(
                $"You can hold at most {MaxTicketsPerAttendee} tickets for an event, and you already have {held}."));
        }

        var reserved = await db.TicketTypes
            .Where(t => t.Id == type.Id && t.Remaining >= request.Quantity)
            .ExecuteUpdateAsync(set => set.SetProperty(t => t.Remaining, t => t.Remaining - request.Quantity), ct);

        if (reserved == 0)
        {
            return TypedResults.Conflict(Problems.Conflict("There aren't enough of these tickets left."));
        }

        var tickets = Enumerable.Range(0, request.Quantity).Select(_ =>
        {
            var ticketId = Guid.CreateVersion7();
            return new Ticket
            {
                Id = ticketId,
                EventId = id,
                TicketTypeId = type.Id,
                HolderId = holderId,
                IssuedAt = now,
                Code = signer.Sign(ticketId, id),
            };
        }).ToList();

        db.Tickets.AddRange(tickets);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        return TypedResults.Created(
            "/api/tickets/mine",
            tickets.Select(t => new TicketResponse(t.Id, id, e.Name, e.Venue, e.StartsAt, type.Name, t.IssuedAt, t.Code)).ToArray());
    }

    private static async Task<Ok<TicketResponse[]>> Mine(DoorlistDbContext db, ClaimsPrincipal user, CancellationToken ct)
    {
        var holderId = user.UserId();
        var tickets = await db.Tickets
            .AsNoTracking()
            .Where(t => t.HolderId == holderId)
            .OrderBy(t => t.Event.StartsAt)
            .ThenBy(t => t.IssuedAt)
            .Select(t => new TicketResponse(
                t.Id, t.EventId, t.Event.Name, t.Event.Venue, t.Event.StartsAt, t.TicketType.Name, t.IssuedAt, t.Code))
            .ToArrayAsync(ct);

        return TypedResults.Ok(tickets);
    }

    private static Ok<SigningKeyResponse> SigningKey(TicketSigner signer) =>
        TypedResults.Ok(new SigningKeyResponse(
            "ES256",
            signer.KeyId,
            signer.PublicKey,
            "DL1.<base64url: ticket id (16 bytes, big-endian) + event id (4 bytes, big-endian)>.<base64url: IEEE P1363 signature over the ASCII of 'DL1.' + payload>"));
}
