using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Shiplog.Api.Auth;
using Shiplog.Api.Data;

namespace Shiplog.Api.Releases;

public sealed record ReleaseSummary(
    int Id,
    int AppId,
    string AppName,
    int EnvironmentId,
    string EnvironmentName,
    bool IsProduction,
    string Version,
    Platform Platform,
    ReleaseStatus Status,
    int ChecklistDone,
    int ChecklistTotal,
    DateTimeOffset CreatedAt,
    DateTimeOffset? ShippedAt);

public sealed record ChecklistItemResponse(int Id, int Position, string Title, bool IsDone, string? DoneBy, DateTimeOffset? DoneAt)
{
    public static ChecklistItemResponse From(ChecklistItem item) =>
        new(item.Id, item.Position, item.Title, item.IsDone, item.DoneBy, item.DoneAt);
}

public sealed record ReleaseDetail(
    int Id,
    int AppId,
    string AppName,
    int EnvironmentId,
    string EnvironmentName,
    bool IsProduction,
    Uri EnvironmentApiUrl,
    string Version,
    Platform Platform,
    string? Notes,
    ReleaseStatus Status,
    DateTimeOffset CreatedAt,
    string CreatedBy,
    DateTimeOffset? ShippedAt,
    string? ShippedBy,
    ChecklistItemResponse[] Checklist)
{
    /// <summary>Needs <see cref="Release.App"/>, <see cref="Release.Environment"/> and the checklist loaded.</summary>
    public static ReleaseDetail From(Release release) => new(
        release.Id,
        release.AppId,
        release.App.Name,
        release.EnvironmentId,
        release.Environment.Name,
        release.Environment.IsProduction,
        release.Environment.ApiUrl,
        release.Version,
        release.Platform,
        release.Notes,
        release.Status,
        release.CreatedAt,
        release.CreatedBy,
        release.ShippedAt,
        release.ShippedBy,
        [.. release.Checklist.OrderBy(i => i.Position).Select(ChecklistItemResponse.From)]);
}

public sealed record CreateReleaseRequest(int AppId, int EnvironmentId, Platform? Platform, string? Version, string? Notes);

public sealed record UpdateChecklistItemRequest(bool IsDone);

public static class ReleaseEndpoints
{
    public static RouteGroupBuilder MapReleaseEndpoints(this IEndpointRouteBuilder routes)
    {
        var releases = routes.MapGroup("/api/releases").WithTags("Releases");

        releases.MapGet("/", ListReleases);
        releases.MapGet("/{id:int}", GetRelease).WithName(nameof(GetRelease));
        releases.MapPost("/", CreateRelease).RequireAuthorization(Policies.WorkOnReleases);
        releases.MapPut("/{id:int}/checklist/{itemId:int}", UpdateChecklistItem).RequireAuthorization(Policies.WorkOnReleases);
        releases.MapPost("/{id:int}/ship", Ship).RequireAuthorization(Policies.WorkOnReleases);

        return releases;
    }

    private static async Task<Ok<ReleaseSummary[]>> ListReleases(int? appId, ShiplogDbContext db, CancellationToken ct)
    {
        var query = db.Releases.AsNoTracking();
        if (appId is not null)
        {
            query = query.Where(r => r.AppId == appId);
        }

        var releases = await query
            .OrderByDescending(r => r.CreatedAt)
            .ThenByDescending(r => r.Id)
            .Select(r => new ReleaseSummary(
                r.Id,
                r.AppId,
                r.App.Name,
                r.EnvironmentId,
                r.Environment.Name,
                r.Environment.IsProduction,
                r.Version,
                r.Platform,
                r.Status,
                r.Checklist.Count(i => i.IsDone),
                r.Checklist.Count,
                r.CreatedAt,
                r.ShippedAt))
            .ToArrayAsync(ct);

        return TypedResults.Ok(releases);
    }

    private static async Task<Results<Ok<ReleaseDetail>, NotFound>> GetRelease(int id, ShiplogDbContext db, CancellationToken ct)
    {
        var release = await LoadRelease(db, id, tracking: false, ct);

        return release is null ? TypedResults.NotFound() : TypedResults.Ok(ReleaseDetail.From(release));
    }

    private static async Task<Results<CreatedAtRoute<ReleaseDetail>, ValidationProblem, Conflict<ProblemDetails>>> CreateRelease(
        CreateReleaseRequest request, ShiplogDbContext db, ClaimsPrincipal user, TimeProvider clock, CancellationToken ct)
    {
        var version = request.Version?.Trim() ?? "";
        var notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        var errors = new Dictionary<string, string[]>();

        if (version.Length == 0 || version.Length > Release.VersionMaxLength)
        {
            errors["version"] = [$"Version is required and must be at most {Release.VersionMaxLength} characters."];
        }

        if (request.Platform is null)
        {
            errors["platform"] = ["Platform is required: android, ios or web."];
        }

        if (notes?.Length > Release.NotesMaxLength)
        {
            errors["notes"] = [$"Notes must be at most {Release.NotesMaxLength} characters."];
        }

        var environment = await db.Environments
            .Include(e => e.App)
            .FirstOrDefaultAsync(e => e.Id == request.EnvironmentId && e.AppId == request.AppId, ct);

        if (environment is null)
        {
            errors["environmentId"] = ["Pick one of this app's environments."];
        }

        if (errors.Count > 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        var platform = request.Platform!.Value;
        if (await db.Releases.AnyAsync(
                r => r.AppId == request.AppId && r.EnvironmentId == request.EnvironmentId && r.Platform == platform && r.Version == version,
                ct))
        {
            return TypedResults.Conflict(Problems.Conflict("This version already has a release for that platform and environment."));
        }

        var release = new Release
        {
            App = environment!.App,
            Environment = environment,
            Version = version,
            Platform = platform,
            Notes = notes,
            Status = ReleaseStatus.InProgress,
            CreatedAt = clock.GetUtcNow(),
            CreatedBy = user.Email(),
        };
        foreach (var item in DefaultChecklist.For(environment))
        {
            release.Checklist.Add(item);
        }

        db.Releases.Add(release);
        await db.SaveChangesAsync(ct);

        return TypedResults.CreatedAtRoute(ReleaseDetail.From(release), nameof(GetRelease), new { id = release.Id });
    }

    private static async Task<Results<Ok<ChecklistItemResponse>, NotFound, Conflict<ProblemDetails>>> UpdateChecklistItem(
        int id, int itemId, UpdateChecklistItemRequest request, ShiplogDbContext db, ClaimsPrincipal user, TimeProvider clock, CancellationToken ct)
    {
        var item = await db.ChecklistItems
            .Include(i => i.Release)
            .FirstOrDefaultAsync(i => i.Id == itemId && i.ReleaseId == id, ct);

        if (item is null)
        {
            return TypedResults.NotFound();
        }

        if (item.Release.Status == ReleaseStatus.Shipped)
        {
            return TypedResults.Conflict(Problems.Conflict("This release has shipped, so its checklist is closed."));
        }

        item.IsDone = request.IsDone;
        item.DoneBy = request.IsDone ? user.Email() : null;
        item.DoneAt = request.IsDone ? clock.GetUtcNow() : null;
        await db.SaveChangesAsync(ct);

        return TypedResults.Ok(ChecklistItemResponse.From(item));
    }

    private static async Task<Results<Ok<ReleaseDetail>, NotFound, ForbidHttpResult, Conflict<ProblemDetails>>> Ship(
        int id, ShiplogDbContext db, ClaimsPrincipal user, TimeProvider clock, CancellationToken ct)
    {
        var release = await LoadRelease(db, id, tracking: true, ct);

        if (release is null)
        {
            return TypedResults.NotFound();
        }

        if (release.Environment.IsProduction && !user.IsInRole(Roles.Lead))
        {
            return TypedResults.Forbid();
        }

        if (release.Status == ReleaseStatus.Shipped)
        {
            return TypedResults.Conflict(Problems.Conflict("This release has already shipped."));
        }

        if (release.Checklist.Any(i => !i.IsDone))
        {
            return TypedResults.Conflict(Problems.Conflict("Every checklist item must be done before the release can ship."));
        }

        release.Status = ReleaseStatus.Shipped;
        release.ShippedAt = clock.GetUtcNow();
        release.ShippedBy = user.Email();
        await db.SaveChangesAsync(ct);

        return TypedResults.Ok(ReleaseDetail.From(release));
    }

    private static Task<Release?> LoadRelease(ShiplogDbContext db, int id, bool tracking, CancellationToken ct)
    {
        var releases = tracking ? db.Releases : db.Releases.AsNoTracking();

        return releases
            .Include(r => r.App)
            .Include(r => r.Environment)
            .Include(r => r.Checklist)
            .FirstOrDefaultAsync(r => r.Id == id, ct);
    }
}
