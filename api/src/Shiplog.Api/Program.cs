using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Shiplog.Api.Apps;
using Shiplog.Api.Auth;
using Shiplog.Api.Data;
using Shiplog.Api.Releases;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();
builder.Services.AddProblemDetails();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase)));

// The API never migrates the database itself. Migrations run as their own
// step before the API starts (docs/adr/0003-run-migrations-as-a-separate-step.md).
builder.Services.AddDbContext<ShiplogDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("Shiplog")));

builder.Services.AddHealthChecks().AddDbContextCheck<ShiplogDbContext>("database");

// Identity stores users, password hashes, roles and lockout. The API issues
// its own short-lived JWTs (docs/adr/0004-authentication-with-identity-and-jwt.md).
builder.Services
    .AddIdentityCore<ShiplogUser>(options =>
    {
        options.User.RequireUniqueEmail = true;
        options.Password.RequiredLength = 12;
    })
    .AddRoles<IdentityRole>()
    .AddEntityFrameworkStores<ShiplogDbContext>()
    .AddSignInManager();

builder.Services.AddOptions<JwtOptions>()
    .BindConfiguration(JwtOptions.Section)
    .ValidateDataAnnotations()
    .ValidateOnStart();
builder.Services.AddSingleton<TokenService>();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer();
builder.Services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
    .Configure<IOptions<JwtOptions>>((bearer, jwtOptions) =>
    {
        var jwt = jwtOptions.Value;
        bearer.MapInboundClaims = false;
        bearer.TokenValidationParameters = new TokenValidationParameters
        {
            ValidIssuer = jwt.Issuer,
            ValidAudience = jwt.Audience,
            IssuerSigningKey = TokenService.SigningKey(jwt),
            NameClaimType = TokenService.NameClaim,
            RoleClaimType = TokenService.RoleClaim,
            ClockSkew = TimeSpan.FromMinutes(1),
        };
    });

// Every endpoint needs a signed-in user unless it opts out with AllowAnonymous.
builder.Services.AddAuthorizationBuilder()
    .SetFallbackPolicy(new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build())
    .AddPolicy(Policies.ManageApps, policy => policy.RequireRole(Roles.Lead))
    .AddPolicy(Policies.WorkOnReleases, policy => policy.RequireRole(Roles.Lead, Roles.Developer));

var app = builder.Build();

// `dotnet Shiplog.Api.dll seed-demo-users` creates the roles and demo users,
// then exits. It runs as a step after migrations, not on API startup.
if (args is [DemoUsers.Command])
{
    await DemoUsers.EnsureAsync(app.Services, app.Configuration["Demo:Password"]);
    return;
}

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseAuthentication();
app.UseAuthorization();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi().AllowAnonymous();
}

app.MapHealthChecks("/api/health").AllowAnonymous();
app.MapAuthEndpoints();
app.MapAppEndpoints();
app.MapReleaseEndpoints();

await app.RunAsync();
