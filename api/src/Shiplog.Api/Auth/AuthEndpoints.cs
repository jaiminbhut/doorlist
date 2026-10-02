using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Identity;

namespace Shiplog.Api.Auth;

public sealed record LoginRequest(string? Email, string? Password);

public sealed record UserResponse(string Email, string DisplayName, string[] Roles);

public sealed record LoginResponse(string AccessToken, DateTimeOffset ExpiresAt, UserResponse User);

public static class AuthEndpoints
{
    public static RouteGroupBuilder MapAuthEndpoints(this IEndpointRouteBuilder routes)
    {
        var auth = routes.MapGroup("/api/auth").WithTags("Auth");

        auth.MapPost("/login", Login).AllowAnonymous();
        auth.MapGet("/me", Me);

        return auth;
    }

    private static async Task<Results<Ok<LoginResponse>, ProblemHttpResult>> Login(
        LoginRequest request, UserManager<ShiplogUser> users, SignInManager<ShiplogUser> signIn, TokenService tokens)
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

    private static Ok<UserResponse> Me(ClaimsPrincipal user) =>
        TypedResults.Ok(new UserResponse(
            user.Email(),
            user.FindFirstValue(TokenService.NameClaim) ?? "",
            [.. user.FindAll(TokenService.RoleClaim).Select(claim => claim.Value)]));

    // One message for every failure, so the response doesn't reveal which emails exist.
    private static ProblemHttpResult InvalidCredentials() =>
        TypedResults.Problem(title: "Email or password is incorrect.", statusCode: StatusCodes.Status401Unauthorized);
}
