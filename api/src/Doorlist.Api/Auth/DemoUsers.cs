using Microsoft.AspNetCore.Identity;

namespace Doorlist.Api.Auth;

/// <summary>
/// Creates the roles and one demo user per role. Run as its own step
/// (<c>dotnet Doorlist.Api.dll seed-demo-users</c>) after migrations, never on
/// API startup, the same way migrations are kept out of startup (ADR 3).
/// The password comes from <c>Demo:Password</c>.
/// </summary>
public static class DemoUsers
{
    public const string Command = "seed-demo-users";

    public static IReadOnlyList<(string Email, string DisplayName, string Role)> All { get; } =
    [
        ("organizer@example.com", "Demo Organizer", Roles.Organizer),
        ("door@example.com", "Demo Door Staff", Roles.DoorStaff),
        ("attendee@example.com", "Demo Attendee", Roles.Attendee),
        ("lead@example.com", "Demo Lead", Roles.Lead),
        ("developer@example.com", "Demo Developer", Roles.Developer),
        ("viewer@example.com", "Demo Viewer", Roles.Viewer),
    ];

    public static async Task EnsureAsync(IServiceProvider services, string? password)
    {
        if (string.IsNullOrWhiteSpace(password))
        {
            throw new InvalidOperationException("Set Demo:Password to seed the demo users.");
        }

        using var scope = services.CreateScope();
        var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<DoorlistUser>>();

        foreach (var role in Roles.All)
        {
            if (!await roles.RoleExistsAsync(role))
            {
                Check(await roles.CreateAsync(new IdentityRole(role)), $"create role {role}");
            }
        }

        foreach (var (email, displayName, role) in All)
        {
            var user = await users.FindByEmailAsync(email);
            if (user is null)
            {
                user = new DoorlistUser { UserName = email, Email = email, EmailConfirmed = true, DisplayName = displayName };
                Check(await users.CreateAsync(user, password), $"create {email}");
            }

            if (!await users.IsInRoleAsync(user, role))
            {
                Check(await users.AddToRoleAsync(user, role), $"add {email} to {role}");
            }
        }
    }

    private static void Check(IdentityResult result, string action)
    {
        if (!result.Succeeded)
        {
            throw new InvalidOperationException(
                $"Could not {action}: {string.Join(" ", result.Errors.Select(error => error.Description))}");
        }
    }
}
