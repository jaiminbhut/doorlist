using System.ComponentModel.DataAnnotations;

namespace Shiplog.Api.Auth;

/// <summary>Bound from <c>Auth:Jwt</c>. The signing key is a secret, set per environment.</summary>
public sealed class JwtOptions
{
    public const string Section = "Auth:Jwt";

    [Required]
    public string Issuer { get; init; } = "";

    [Required]
    public string Audience { get; init; } = "";

    /// <summary>HMAC-SHA256 key: at least 32 characters.</summary>
    [Required, MinLength(32)]
    public string SigningKey { get; init; } = "";

    [Range(1, 1440)]
    public int LifetimeMinutes { get; init; } = 60;
}
