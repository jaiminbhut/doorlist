using Shiplog.Api.Apps;

namespace Shiplog.Api.Environments;

/// <summary>
/// Somewhere an app's builds go, such as staging or production, with the API
/// address a build for it must point at. The release checklist is built from
/// these two facts, because a build aimed at the wrong environment is the
/// mistake the checklist exists to catch.
/// </summary>
public sealed class AppEnvironment
{
    public const int NameMaxLength = 50;
    public const int ApiUrlMaxLength = 300;

    public int Id { get; set; }

    public int AppId { get; set; }

    public App App { get; set; } = null!;

    public required string Name { get; set; }

    public required Uri ApiUrl { get; set; }

    public bool IsProduction { get; set; }
}
