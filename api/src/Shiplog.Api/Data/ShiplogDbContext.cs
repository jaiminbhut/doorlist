using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Shiplog.Api.Apps;
using Shiplog.Api.Auth;
using Shiplog.Api.Environments;
using Shiplog.Api.Releases;

namespace Shiplog.Api.Data;

public sealed class ShiplogDbContext(DbContextOptions<ShiplogDbContext> options)
    : IdentityDbContext<ShiplogUser>(options)
{
    public DbSet<App> Apps => Set<App>();

    public DbSet<AppEnvironment> Environments => Set<AppEnvironment>();

    public DbSet<Release> Releases => Set<Release>();

    public DbSet<ChecklistItem> ChecklistItems => Set<ChecklistItem>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<ShiplogUser>(user => user.Property(u => u.DisplayName).HasMaxLength(ShiplogUser.DisplayNameMaxLength));

        builder.Entity<App>(app =>
        {
            app.Property(a => a.Name).HasMaxLength(App.NameMaxLength);
            app.HasIndex(a => a.Name).IsUnique();
            app.HasMany(a => a.Environments).WithOne(e => e.App).HasForeignKey(e => e.AppId);
        });

        builder.Entity<AppEnvironment>(environment =>
        {
            environment.ToTable("Environments");
            environment.Property(e => e.Name).HasMaxLength(AppEnvironment.NameMaxLength);
            environment.Property(e => e.ApiUrl).HasMaxLength(AppEnvironment.ApiUrlMaxLength);
            environment.HasIndex(e => new { e.AppId, e.Name }).IsUnique();
        });

        builder.Entity<Release>(release =>
        {
            release.Property(r => r.Version).HasMaxLength(Release.VersionMaxLength);
            release.Property(r => r.VersionName).HasMaxLength(Release.VersionMaxLength);
            release.Property(r => r.Notes).HasMaxLength(Release.NotesMaxLength);
            release.Property(r => r.Platform).HasConversion<string>().HasMaxLength(20);
            release.Property(r => r.Status).HasConversion<string>().HasMaxLength(20);
            release.Property(r => r.CreatedBy).HasMaxLength(Release.UserMaxLength);
            release.Property(r => r.ShippedBy).HasMaxLength(Release.UserMaxLength);

            // Releases are history: an app or environment that has them can't be
            // deleted out from under them. (Two cascading paths to Apps would
            // also be rejected by SQL Server.)
            release.HasOne(r => r.App).WithMany().HasForeignKey(r => r.AppId).OnDelete(DeleteBehavior.Restrict);
            release.HasOne(r => r.Environment).WithMany().HasForeignKey(r => r.EnvironmentId).OnDelete(DeleteBehavior.Restrict);

            release.HasIndex(r => new { r.AppId, r.EnvironmentId, r.Platform, r.Version }).IsUnique();
            release.HasMany(r => r.Checklist).WithOne(i => i.Release).HasForeignKey(i => i.ReleaseId);
        });

        builder.Entity<ChecklistItem>(item =>
        {
            item.Property(i => i.Title).HasMaxLength(ChecklistItem.TitleMaxLength);
            item.Property(i => i.DoneBy).HasMaxLength(Release.UserMaxLength);
            item.HasIndex(i => new { i.ReleaseId, i.Position }).IsUnique();
        });
    }
}
