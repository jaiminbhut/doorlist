using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Doorlist.Api.Auth;
using Doorlist.Api.Data;

namespace Doorlist.Api.Environments;

public sealed record EnvironmentResponse(int Id, string Name, Uri ApiUrl, bool IsProduction)
{
    public static EnvironmentResponse From(AppEnvironment environment) =>
        new(environment.Id, environment.Name, environment.ApiUrl, environment.IsProduction);
}

public sealed record CreateEnvironmentRequest(string? Name, string? ApiUrl, bool IsProduction);

public static class EnvironmentEndpoints
{
    /// <summary>Mapped under <c>/api/apps</c>: an environment always belongs to an app.</summary>
    public static void MapEnvironmentEndpoints(this RouteGroupBuilder apps) =>
        apps.MapPost("/{appId:int}/environments", CreateEnvironment)
            .WithTags("Environments")
            .RequireAuthorization(Policies.ManageApps);

    private static async Task<Results<Created<EnvironmentResponse>, NotFound, ValidationProblem, Conflict<ProblemDetails>>> CreateEnvironment(
        int appId, CreateEnvironmentRequest request, DoorlistDbContext db, CancellationToken ct)
    {
        var name = request.Name?.Trim() ?? "";
        var errors = new Dictionary<string, string[]>();

        if (name.Length == 0 || name.Length > AppEnvironment.NameMaxLength)
        {
            errors["name"] = [$"Name is required and must be at most {AppEnvironment.NameMaxLength} characters."];
        }

        if (!Uri.TryCreate(request.ApiUrl?.Trim(), UriKind.Absolute, out var apiUrl)
            || apiUrl.Scheme is not ("http" or "https")
            || apiUrl.OriginalString.Length > AppEnvironment.ApiUrlMaxLength)
        {
            errors["apiUrl"] = ["API URL must be an absolute http or https address."];
        }

        if (errors.Count > 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        if (!await db.Apps.AnyAsync(a => a.Id == appId, ct))
        {
            return TypedResults.NotFound();
        }

        if (await db.Environments.AnyAsync(e => e.AppId == appId && e.Name == name, ct))
        {
            return TypedResults.Conflict(Problems.Conflict("This app already has an environment with that name."));
        }

        var environment = new AppEnvironment { AppId = appId, Name = name, ApiUrl = apiUrl!, IsProduction = request.IsProduction };
        db.Environments.Add(environment);
        await db.SaveChangesAsync(ct);

        return TypedResults.Created($"/api/apps/{appId}", EnvironmentResponse.From(environment));
    }
}
