using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Shiplog.Api.Data;

/// <summary>
/// Used only by the EF Core tools (<c>dotnet ef migrations add</c>, <c>script</c>
/// and <c>bundle</c>), so they never have to boot the API or know a connection
/// string. The migration bundle is given its connection at run time with
/// <c>--connection</c>; see docs/adr/0003-run-migrations-as-a-separate-step.md.
/// </summary>
public sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<ShiplogDbContext>
{
    public ShiplogDbContext CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<ShiplogDbContext>().UseSqlServer().Options);
}
