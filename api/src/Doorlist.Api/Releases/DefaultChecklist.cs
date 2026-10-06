using Doorlist.Api.Environments;

namespace Doorlist.Api.Releases;

/// <summary>
/// The checks every new release starts with. The first two name the target
/// environment and its API address explicitly, so whoever ticks them has to
/// look at what the build is actually pointed at.
/// </summary>
public static class DefaultChecklist
{
    public static IEnumerable<ChecklistItem> For(AppEnvironment environment) =>
    [
        new() { Position = 1, Title = $"Build is configured for the {environment.Name} environment" },
        new() { Position = 2, Title = $"Build points at {environment.ApiUrl}" },
        new() { Position = 3, Title = "Release notes are written" },
        new()
        {
            Position = 4,
            Title = environment.IsProduction
                ? "Tested in staging and on a real device"
                : "Smoke-tested on a real device",
        },
    ];
}
