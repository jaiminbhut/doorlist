using System.Security.Claims;
using Doorlist.Api.Auth;
using Doorlist.Api.Data;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Doorlist.Api.Events;

public sealed record TicketTypeResponse(int Id, string Name, int Capacity, int Remaining);

public sealed record EventResponse(
    int Id,
    string Name,
    string Venue,
    string? Description,
    DateTimeOffset StartsAt,
    DateTimeOffset EndsAt,
    EventStatus Status,
    TicketTypeResponse[] TicketTypes)
{
    /// <summary>Needs <see cref="Event.TicketTypes"/> loaded.</summary>
    public static EventResponse From(Event e) => new(
        e.Id,
        e.Name,
        e.Venue,
        e.Description,
        e.StartsAt,
        e.EndsAt,
        e.Status,
        [.. e.TicketTypes.OrderBy(t => t.Id).Select(t => new TicketTypeResponse(t.Id, t.Name, t.Capacity, t.Remaining))]);
}

public sealed record CreateEventRequest(string? Name, string? Venue, string? Description, DateTimeOffset? StartsAt, DateTimeOffset? EndsAt);

public sealed record CreateTicketTypeRequest(string? Name, int Capacity);

public static class EventEndpoints
{
    public static void MapEventEndpoints(this IEndpointRouteBuilder routes)
    {
        var events = routes.MapGroup("/api/events").WithTags("Events");

        // Anyone can browse published events, signed in or not.
        events.MapGet("/", ListPublished).AllowAnonymous();
        events.MapGet("/{id:int}", GetEvent).AllowAnonymous().WithName(nameof(GetEvent));

        events.MapPost("/", CreateEvent).RequireAuthorization(Policies.ManageEvents);
        events.MapPost("/{id:int}/ticket-types", AddTicketType).RequireAuthorization(Policies.ManageEvents);
        events.MapPost("/{id:int}/publish", Publish).RequireAuthorization(Policies.ManageEvents);

        routes.MapGroup("/api/organizer/events")
            .WithTags("Events")
            .RequireAuthorization(Policies.ManageEvents)
            .MapGet("/", ListForOrganizers);
    }

    private static async Task<Ok<EventResponse[]>> ListPublished(DoorlistDbContext db, TimeProvider clock, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var events = await db.Events
            .AsNoTracking()
            .Include(e => e.TicketTypes)
            .Where(e => e.Status == EventStatus.Published && e.EndsAt > now)
            .OrderBy(e => e.StartsAt)
            .ToListAsync(ct);

        return TypedResults.Ok(events.Select(EventResponse.From).ToArray());
    }

    private static async Task<Ok<EventResponse[]>> ListForOrganizers(DoorlistDbContext db, CancellationToken ct)
    {
        var events = await db.Events
            .AsNoTracking()
            .Include(e => e.TicketTypes)
            .OrderByDescending(e => e.StartsAt)
            .ToListAsync(ct);

        return TypedResults.Ok(events.Select(EventResponse.From).ToArray());
    }

    private static async Task<Results<Ok<EventResponse>, NotFound>> GetEvent(
        int id, DoorlistDbContext db, ClaimsPrincipal user, CancellationToken ct)
    {
        var e = await db.Events.AsNoTracking().Include(e => e.TicketTypes).FirstOrDefaultAsync(e => e.Id == id, ct);

        // A draft doesn't exist for anyone but organizers.
        if (e is null || (e.Status == EventStatus.Draft && !user.IsInRole(Roles.Organizer)))
        {
            return TypedResults.NotFound();
        }

        return TypedResults.Ok(EventResponse.From(e));
    }

    private static async Task<Results<CreatedAtRoute<EventResponse>, ValidationProblem>> CreateEvent(
        CreateEventRequest request, DoorlistDbContext db, ClaimsPrincipal user, TimeProvider clock, CancellationToken ct)
    {
        var name = request.Name?.Trim() ?? "";
        var venue = request.Venue?.Trim() ?? "";
        var description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        var errors = new Dictionary<string, string[]>();

        if (name.Length == 0 || name.Length > Event.NameMaxLength)
        {
            errors["name"] = [$"Name is required and must be at most {Event.NameMaxLength} characters."];
        }

        if (venue.Length == 0 || venue.Length > Event.VenueMaxLength)
        {
            errors["venue"] = [$"Venue is required and must be at most {Event.VenueMaxLength} characters."];
        }

        if (description?.Length > Event.DescriptionMaxLength)
        {
            errors["description"] = [$"Description must be at most {Event.DescriptionMaxLength} characters."];
        }

        if (request.StartsAt is null || request.EndsAt is null || request.EndsAt <= request.StartsAt)
        {
            errors["endsAt"] = ["An event needs a start and an end, and must end after it starts."];
        }

        if (errors.Count > 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        var e = new Event
        {
            Name = name,
            Venue = venue,
            Description = description,
            StartsAt = request.StartsAt!.Value,
            EndsAt = request.EndsAt!.Value,
            Status = EventStatus.Draft,
            CreatedAt = clock.GetUtcNow(),
            CreatedBy = user.Email(),
        };
        db.Events.Add(e);
        await db.SaveChangesAsync(ct);

        return TypedResults.CreatedAtRoute(EventResponse.From(e), nameof(GetEvent), new { id = e.Id });
    }

    private static async Task<Results<Created<TicketTypeResponse>, NotFound, ValidationProblem, Conflict<ProblemDetails>>> AddTicketType(
        int id, CreateTicketTypeRequest request, DoorlistDbContext db, CancellationToken ct)
    {
        var name = request.Name?.Trim() ?? "";
        var errors = new Dictionary<string, string[]>();

        if (name.Length == 0 || name.Length > TicketType.NameMaxLength)
        {
            errors["name"] = [$"Name is required and must be at most {TicketType.NameMaxLength} characters."];
        }

        if (request.Capacity is < 1 or > TicketType.MaxCapacity)
        {
            errors["capacity"] = [$"Capacity must be between 1 and {TicketType.MaxCapacity}."];
        }

        if (errors.Count > 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        if (!await db.Events.AnyAsync(e => e.Id == id, ct))
        {
            return TypedResults.NotFound();
        }

        if (await db.TicketTypes.AnyAsync(t => t.EventId == id && t.Name == name, ct))
        {
            return TypedResults.Conflict(Problems.Conflict("This event already has a ticket type with that name."));
        }

        var type = new TicketType { EventId = id, Name = name, Capacity = request.Capacity, Remaining = request.Capacity };
        db.TicketTypes.Add(type);
        await db.SaveChangesAsync(ct);

        return TypedResults.Created($"/api/events/{id}", new TicketTypeResponse(type.Id, type.Name, type.Capacity, type.Remaining));
    }

    private static async Task<Results<Ok<EventResponse>, NotFound, Conflict<ProblemDetails>>> Publish(
        int id, DoorlistDbContext db, TimeProvider clock, CancellationToken ct)
    {
        var e = await db.Events.Include(e => e.TicketTypes).FirstOrDefaultAsync(e => e.Id == id, ct);

        if (e is null)
        {
            return TypedResults.NotFound();
        }

        if (e.Status == EventStatus.Published)
        {
            return TypedResults.Conflict(Problems.Conflict("This event is already published."));
        }

        if (e.TicketTypes.Count == 0)
        {
            return TypedResults.Conflict(Problems.Conflict("Add at least one ticket type before publishing."));
        }

        var now = clock.GetUtcNow();
        if (e.StartsAt <= now)
        {
            return TypedResults.Conflict(Problems.Conflict("This event has already started, so it can't be published."));
        }

        e.Status = EventStatus.Published;
        e.PublishedAt = now;
        await db.SaveChangesAsync(ct);

        return TypedResults.Ok(EventResponse.From(e));
    }
}
