using Microsoft.AspNetCore.Identity;

namespace Shiplog.Api.Auth;

public sealed class ShiplogUser : IdentityUser
{
    public const int DisplayNameMaxLength = 100;

    public required string DisplayName { get; set; }
}
