using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Shiplog.Api.Auth;

public sealed record IssuedToken(string AccessToken, DateTimeOffset ExpiresAt);

/// <summary>Issues the short-lived access tokens described in ADR 4.</summary>
public sealed class TokenService(IOptions<JwtOptions> options, TimeProvider clock)
{
    public const string RoleClaim = "role";
    public const string NameClaim = "name";
    public const string EmailClaim = "email";

    public static SymmetricSecurityKey SigningKey(JwtOptions jwt) => new(Encoding.UTF8.GetBytes(jwt.SigningKey));

    public IssuedToken Issue(ShiplogUser user, IEnumerable<string> roles)
    {
        var jwt = options.Value;
        var now = clock.GetUtcNow();
        var expiresAt = now.AddMinutes(jwt.LifetimeMinutes);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id),
            new(EmailClaim, user.Email ?? ""),
            new(NameClaim, user.DisplayName),
        };
        claims.AddRange(roles.Select(role => new Claim(RoleClaim, role)));

        var token = new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = jwt.Issuer,
            Audience = jwt.Audience,
            Subject = new ClaimsIdentity(claims),
            IssuedAt = now.UtcDateTime,
            NotBefore = now.UtcDateTime,
            Expires = expiresAt.UtcDateTime,
            SigningCredentials = new SigningCredentials(SigningKey(jwt), SecurityAlgorithms.HmacSha256),
        });

        return new IssuedToken(token, expiresAt);
    }
}

public static class ClaimsPrincipalExtensions
{
    public static string Email(this ClaimsPrincipal user) =>
        user.FindFirstValue(TokenService.EmailClaim) ?? throw new InvalidOperationException("The token has no email claim.");
}
