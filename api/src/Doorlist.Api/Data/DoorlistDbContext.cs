using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Doorlist.Api.Apps;
using Doorlist.Api.Auth;
using Doorlist.Api.CheckIns;
using Doorlist.Api.Environments;
using Doorlist.Api.Events;
using Doorlist.Api.Releases;
using Doorlist.Api.Tickets;

namespace Doorlist.Api.Data;

public sealed class DoorlistDbContext(DbContextOptions<DoorlistDbContext> options)
    : IdentityDbContext<DoorlistUser>(options)
{
    public DbSet<App> Apps => Set<App>();

    public DbSet<AppEnvironment> Environments => Set<AppEnvironment>();

    public DbSet<Release> Releases => Set<Release>();

    public DbSet<ChecklistItem> ChecklistItems => Set<ChecklistItem>();

    public DbSet<Event> Events => Set<Event>();

    public DbSet<TicketType> TicketTypes => Set<TicketType>();

    public DbSet<Ticket> Tickets => Set<Ticket>();

    public DbSet<CheckIn> CheckIns => Set<CheckIn>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<DoorlistUser>(user => user.Property(u => u.DisplayName).HasMaxLength(DoorlistUser.DisplayNameMaxLength));

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

            // No filter: a release without a build number is still unique per
            // version name (SQL Server treats NULLs as equal in a unique index).
            release.HasIndex(r => new { r.AppId, r.EnvironmentId, r.Platform, r.VersionName, r.BuildNumber })
                .IsUnique()
                .HasFilter(null);
            release.HasMany(r => r.Checklist).WithOne(i => i.Release).HasForeignKey(i => i.ReleaseId);
        });

        builder.Entity<Event>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(Event.NameMaxLength);
            e.Property(x => x.Venue).HasMaxLength(Event.VenueMaxLength);
            e.Property(x => x.Description).HasMaxLength(Event.DescriptionMaxLength);
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.CreatedBy).HasMaxLength(Event.UserMaxLength);
            e.HasIndex(x => new { x.Status, x.StartsAt });
            e.HasMany(x => x.TicketTypes).WithOne(t => t.Event).HasForeignKey(t => t.EventId);
            e.ToTable(t => t.HasCheckConstraint("CK_Events_EndsAfterStart", "[EndsAt] > [StartsAt]"));
        });

        builder.Entity<TicketType>(type =>
        {
            type.Property(t => t.Name).HasMaxLength(TicketType.NameMaxLength);
            type.HasIndex(t => new { t.EventId, t.Name }).IsUnique();
            // The last line of defence against overselling: whatever the code
            // does, the database refuses a count below zero or above capacity.
            type.ToTable(t => t.HasCheckConstraint("CK_TicketTypes_Remaining", "[Remaining] >= 0 AND [Remaining] <= [Capacity]"));
        });

        builder.Entity<Ticket>(ticket =>
        {
            ticket.Property(t => t.Code).HasMaxLength(Ticket.CodeMaxLength);
            ticket.HasIndex(t => new { t.EventId, t.HolderId });
            ticket.HasIndex(t => t.HolderId);
            // Tickets are history: their event, type and holder can't be deleted
            // out from under them (and two cascade paths to Events would be
            // rejected by SQL Server).
            ticket.HasOne(t => t.Event).WithMany().HasForeignKey(t => t.EventId).OnDelete(DeleteBehavior.Restrict);
            ticket.HasOne(t => t.TicketType).WithMany().HasForeignKey(t => t.TicketTypeId).OnDelete(DeleteBehavior.Restrict);
            ticket.HasOne(t => t.Holder).WithMany().HasForeignKey(t => t.HolderId).OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<CheckIn>(checkIn =>
        {
            checkIn.Property(c => c.Outcome).HasConversion<string>().HasMaxLength(20);
            checkIn.Property(c => c.DeviceId).HasMaxLength(CheckIn.DeviceIdMaxLength);
            checkIn.Property(c => c.DeviceLabel).HasMaxLength(CheckIn.DeviceLabelMaxLength);
            checkIn.Property(c => c.ScannedBy).HasMaxLength(CheckIn.UserMaxLength);

            // A scan sent twice (a retried batch) is recorded once.
            checkIn.HasIndex(c => c.ScanId).IsUnique();
            // The first admission wins, enforced by the database: at most one
            // Admitted row per ticket, however many devices sync it at once (ADR 8).
            checkIn.HasIndex(c => c.TicketId).IsUnique().HasFilter("[Outcome] = N'Admitted'").HasDatabaseName("IX_CheckIns_OneAdmissionPerTicket");
            checkIn.HasIndex(c => new { c.EventId, c.Outcome });

            checkIn.HasOne(c => c.Event).WithMany().HasForeignKey(c => c.EventId).OnDelete(DeleteBehavior.Restrict);
            checkIn.HasOne(c => c.Ticket).WithMany().HasForeignKey(c => c.TicketId).OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<ChecklistItem>(item =>
        {
            item.Property(i => i.Title).HasMaxLength(ChecklistItem.TitleMaxLength);
            item.Property(i => i.DoneBy).HasMaxLength(Release.UserMaxLength);
            item.HasIndex(i => new { i.ReleaseId, i.Position }).IsUnique();
        });
    }
}
