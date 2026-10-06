using Doorlist.Api.Environments;

namespace Doorlist.Api.Apps;

/// <summary>
/// An application a team ships: a mobile app, a web front end, or a service.
/// It has the environments it deploys to, and releases go to one of them.
/// </summary>
public sealed class App
{
    public const int NameMaxLength = 100;

    public int Id { get; set; }

    public required string Name { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public ICollection<AppEnvironment> Environments { get; } = new List<AppEnvironment>();
}
