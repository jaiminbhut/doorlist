namespace Shiplog.Api.Apps;

/// <summary>
/// An application a team ships: a mobile app, a web front end, or a service.
/// Releases will hang off it from milestone 2 on.
/// </summary>
public sealed class App
{
    public const int NameMaxLength = 100;

    public int Id { get; set; }

    public required string Name { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}
