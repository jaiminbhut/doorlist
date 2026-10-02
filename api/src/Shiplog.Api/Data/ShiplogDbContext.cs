using Microsoft.EntityFrameworkCore;
using Shiplog.Api.Apps;

namespace Shiplog.Api.Data;

public sealed class ShiplogDbContext(DbContextOptions<ShiplogDbContext> options) : DbContext(options)
{
    public DbSet<App> Apps => Set<App>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<App>(app =>
        {
            app.Property(a => a.Name).HasMaxLength(App.NameMaxLength);
            app.HasIndex(a => a.Name).IsUnique();
        });
    }
}
