using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Doorlist.Api.Auth;
using Doorlist.Api.Data;
using Doorlist.Api.Environments;

namespace Doorlist.Api.Apps;

public sealed record AppResponse(int Id, string Name, DateTimeOffset CreatedAt)
{
    public static AppResponse From(App app) => new(app.Id, app.Name, app.CreatedAt);
}

public sealed record AppDetailResponse(int Id, string Name, DateTimeOffset CreatedAt, EnvironmentResponse[] Environments);

public sealed record CreateAppRequest(string? Name);

public static class AppEndpoints
{
    public static RouteGroupBuilder MapAppEndpoints(this IEndpointRouteBuilder routes)
    {
        var apps = routes.MapGroup("/api/apps").WithTags("Apps");

        apps.MapGet("/", ListApps);
        apps.MapGet("/{id:int}", GetApp).WithName(nameof(GetApp));
        apps.MapPost("/", CreateApp).RequireAuthorization(Policies.ManageApps);
        apps.MapEnvironmentEndpoints();

        return apps;
    }

    private static async Task<Ok<AppResponse[]>> ListApps(DoorlistDbContext db, CancellationToken ct)
    {
        var apps = await db.Apps
            .AsNoTracking()
            .OrderBy(a => a.Name)
            .Select(a => new AppResponse(a.Id, a.Name, a.CreatedAt))
            .ToArrayAsync(ct);

        return TypedResults.Ok(apps);
    }

    private static async Task<Results<Ok<AppDetailResponse>, NotFound>> GetApp(
        int id, DoorlistDbContext db, CancellationToken ct)
    {
        var app = await db.Apps
            .AsNoTracking()
            .Include(a => a.Environments)
            .FirstOrDefaultAsync(a => a.Id == id, ct);

        if (app is null)
        {
            return TypedResults.NotFound();
        }

        var environments = app.Environments
            .OrderBy(e => e.IsProduction)
            .ThenBy(e => e.Name, StringComparer.OrdinalIgnoreCase)
            .Select(EnvironmentResponse.From)
            .ToArray();

        return TypedResults.Ok(new AppDetailResponse(app.Id, app.Name, app.CreatedAt, environments));
    }

    private static async Task<Results<CreatedAtRoute<AppResponse>, ValidationProblem, Conflict<ProblemDetails>>> CreateApp(
        CreateAppRequest request, DoorlistDbContext db, TimeProvider clock, CancellationToken ct)
    {
        var name = request.Name?.Trim() ?? "";

        if (name.Length == 0 || name.Length > App.NameMaxLength)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                ["name"] = [$"Name is required and must be at most {App.NameMaxLength} characters."],
            });
        }

        // The unique index is the real guard; this check just turns the common
        // case into a clear 409 instead of a database exception.
        if (await db.Apps.AnyAsync(a => a.Name == name, ct))
        {
            return TypedResults.Conflict(Problems.Conflict("An app with that name already exists."));
        }

        var app = new App { Name = name, CreatedAt = clock.GetUtcNow() };
        db.Apps.Add(app);
        await db.SaveChangesAsync(ct);

        return TypedResults.CreatedAtRoute(AppResponse.From(app), nameof(GetApp), new { id = app.Id });
    }
}
