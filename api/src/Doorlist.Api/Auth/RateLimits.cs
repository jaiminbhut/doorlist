using System.ComponentModel.DataAnnotations;

namespace Doorlist.Api.Auth;

/// <summary>Bound from <c>RateLimits</c>.</summary>
public sealed class RateLimits
{
    public const string Section = "RateLimits";

    /// <summary>The policy on sign-in and sign-up.</summary>
    public const string Auth = "auth";

    /// <summary>Sign-in and sign-up attempts allowed per client address per minute.</summary>
    [Range(1, 100_000)]
    public int AuthPerMinute { get; init; } = 10;
}
