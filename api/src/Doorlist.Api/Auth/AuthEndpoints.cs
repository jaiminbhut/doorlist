using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Identity;

namespace Doorlist.Api.Auth;

public sealed record LoginRequest(string? Email, string? Password);

public sealed record RegisterRequest(string? Email, string? Password, string? DisplayName);

public sealed record UserResponse(string Email, string DisplayName, string[] Roles);

public sealed record LoginResponse(string AccessToken, DateTimeOffset ExpiresAt, UserResponse User);

public static class AuthEndpoints
{
    public static RouteGroupBuilder MapAuthEndpoints(this IEndpointRouteBuilder routes)
    {
        var auth = routes.MapGroup("/api/auth").WithTags("Auth");

        // Both are open to anyone, so both are rate limited per client address.
        auth.MapPost("/login", Login).AllowAnonymous().RequireRateLimiting(RateLimits.Auth);
        auth.MapPost("/register", Register).AllowAnonymous().RequireRateLimiting(RateLimits.Auth);
        auth.MapGet("/me", Me);

        return auth;
    }

    private static async Task<Results<Ok<LoginResponse>, ProblemHttpResult>> Login(
        LoginRequest request, UserManager<DoorlistUser> users, SignInManager<DoorlistUser> signIn, TokenService tokens)
    {
        var user = string.IsNullOrWhiteSpace(request.Email) ? null : await users.FindByEmailAsync(request.Email.Trim());
        if (user is null || string.IsNullOrEmpty(request.Password))
        {
            return InvalidCredentials();
        }

        // Counts failures toward Identity's lockout, so the login can't be brute-forced.
        var result = await signIn.CheckPasswordSignInAsync(user, request.Password, lockoutOnFailure: true);
        if (!result.Succeeded)
        {
            return InvalidCredentials();
        }

        var roles = await users.GetRolesAsync(user);
        var token = tokens.Issue(user, roles);

        return TypedResults.Ok(new LoginResponse(
            token.AccessToken, token.ExpiresAt, new UserResponse(user.Email ?? "", user.DisplayName, [.. roles])));
    }

    /// <summary>
    /// Anyone can sign up, always as an attendee (ADR 6). Organizers and door
    /// staff are created by an operator, never through this endpoint.
    /// </summary>
    private static async Task<Results<Ok<LoginResponse>, ValidationProblem>> Register(
        RegisterRequest request, UserManager<DoorlistUser> users, TokenService tokens)
    {
        var email = request.Email?.Trim() ?? "";
        var displayName = request.DisplayName?.Trim() ?? "";

        if (displayName.Length == 0 || displayName.Length > DoorlistUser.DisplayNameMaxLength)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                ["displayName"] = [$"Name is required and must be at most {DoorlistUser.DisplayNameMaxLength} characters."],
            });
        }

        var user = new DoorlistUser { UserName = email, Email = email, DisplayName = displayName };
        var created = await users.CreateAsync(user, request.Password ?? "");
        if (!created.Succeeded)
        {
            return TypedResults.ValidationProblem(ToValidationErrors(created));
        }

        await users.AddToRoleAsync(user, Roles.Attendee);
        var token = tokens.Issue(user, [Roles.Attendee]);

        return TypedResults.Ok(new LoginResponse(
            token.AccessToken, token.ExpiresAt, new UserResponse(email, displayName, [Roles.Attendee])));
    }

    private static Dictionary<string, string[]> ToValidationErrors(IdentityResult result) =>
        result.Errors
            // The user name is the email, so a taken email is reported once, not twice.
            .Where(error => error.Code != nameof(IdentityErrorDescriber.DuplicateUserName))
            .GroupBy(error => error.Code switch
            {
                _ when error.Code.StartsWith("Password", StringComparison.Ordinal) => "password",
                _ when error.Code.Contains("Email", StringComparison.Ordinal) || error.Code.Contains("UserName", StringComparison.Ordinal) => "email",
                _ => "",
            })
            .ToDictionary(group => group.Key, group => group.Select(error => error.Description).Distinct().ToArray());

    private static Ok<UserResponse> Me(ClaimsPrincipal user) =>
        TypedResults.Ok(new UserResponse(
            user.Email(),
            user.FindFirstValue(TokenService.NameClaim) ?? "",
            [.. user.FindAll(TokenService.RoleClaim).Select(claim => claim.Value)]));

    // One message for every failure, so the response doesn't reveal which emails exist.
    private static ProblemHttpResult InvalidCredentials() =>
        TypedResults.Problem(title: "Email or password is incorrect.", statusCode: StatusCodes.Status401Unauthorized);
}
