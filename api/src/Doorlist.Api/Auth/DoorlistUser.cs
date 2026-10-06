using Microsoft.AspNetCore.Identity;

namespace Doorlist.Api.Auth;

public sealed class DoorlistUser : IdentityUser
{
    public const int DisplayNameMaxLength = 100;

    public required string DisplayName { get; set; }
}
