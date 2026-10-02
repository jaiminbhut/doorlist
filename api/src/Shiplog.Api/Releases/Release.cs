using Shiplog.Api.Apps;
using Shiplog.Api.Environments;

namespace Shiplog.Api.Releases;

public enum Platform
{
    Android,
    Ios,
    Web,
}

public enum ReleaseStatus
{
    InProgress,
    Shipped,
}

/// <summary>One version of an app, on one platform, going to one environment.</summary>
public sealed class Release
{
    public const int VersionMaxLength = 50;
    public const int NotesMaxLength = 2000;
    public const int UserMaxLength = 256;

    public int Id { get; set; }

    public int AppId { get; set; }

    public App App { get; set; } = null!;

    public int EnvironmentId { get; set; }

    public AppEnvironment Environment { get; set; } = null!;

    /// <summary>
    /// The old single-string form, e.g. "2.4.0 (118)". Still written in the expand
    /// step so the previous API version keeps working; replaced by
    /// <see cref="VersionName"/> and <see cref="BuildNumber"/>. Nullable from
    /// this step on, so the next step can stop writing it while this version
    /// may still be running.
    /// </summary>
    public string? Version { get; set; }

    /// <summary>"2.4.0". Null only on rows the previous API version wrote during a deploy.</summary>
    public string? VersionName { get; set; }

    public int? BuildNumber { get; set; }

    public Platform Platform { get; set; }

    public string? Notes { get; set; }

    public ReleaseStatus Status { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    /// <summary>The email of the user who created it. Kept as text so history survives user changes.</summary>
    public required string CreatedBy { get; set; }

    public DateTimeOffset? ShippedAt { get; set; }

    public string? ShippedBy { get; set; }

    public ICollection<ChecklistItem> Checklist { get; } = new List<ChecklistItem>();
}

public sealed class ChecklistItem
{
    public const int TitleMaxLength = 200;

    public int Id { get; set; }

    public int ReleaseId { get; set; }

    public Release Release { get; set; } = null!;

    public int Position { get; set; }

    public required string Title { get; set; }

    public bool IsDone { get; set; }

    public string? DoneBy { get; set; }

    public DateTimeOffset? DoneAt { get; set; }
}
