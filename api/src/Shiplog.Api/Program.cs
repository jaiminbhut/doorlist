using Microsoft.EntityFrameworkCore;
using Shiplog.Api.Apps;
using Shiplog.Api.Data;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();
builder.Services.AddProblemDetails();
builder.Services.AddSingleton(TimeProvider.System);

// The API never migrates the database itself. Migrations run as their own
// step before the API starts (docs/adr/0003-run-migrations-as-a-separate-step.md).
builder.Services.AddDbContext<ShiplogDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("Shiplog")));

builder.Services.AddHealthChecks().AddDbContextCheck<ShiplogDbContext>("database");

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.MapHealthChecks("/api/health");
app.MapAppEndpoints();

app.Run();
