using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Doorlist.Api.Apps;
using Doorlist.Api.Auth;
using Doorlist.Api.CheckIns;
using Doorlist.Api.Data;
using Doorlist.Api.Events;
using Doorlist.Api.Releases;
using Doorlist.Api.Tickets;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();
builder.Services.AddProblemDetails();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase)));

// The API never migrates the database itself. Migrations run as their own
// step before the API starts (docs/adr/0003-run-migrations-as-a-separate-step.md).
builder.Services.AddDbContext<DoorlistDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("Doorlist")));

builder.Services.AddHealthChecks().AddDbContextCheck<DoorlistDbContext>("database");

// Identity stores users, password hashes, roles and lockout. The API issues
// its own short-lived JWTs (docs/adr/0004-authentication-with-identity-and-jwt.md).
builder.Services
    .AddIdentityCore<DoorlistUser>(options =>
    {
        options.User.RequireUniqueEmail = true;
        options.Password.RequiredLength = 12;
    })
    .AddRoles<IdentityRole>()
    .AddEntityFrameworkStores<DoorlistDbContext>()
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
    .AddPolicy(Policies.ManageEvents, policy => policy.RequireRole(Roles.Organizer))
    .AddPolicy(Policies.ClaimTickets, policy => policy.RequireRole(Roles.Attendee))
    .AddPolicy(Policies.CheckIn, policy => policy.RequireRole(Roles.DoorStaff, Roles.Organizer))
    .AddPolicy(Policies.ManageApps, policy => policy.RequireRole(Roles.Lead))
    .AddPolicy(Policies.WorkOnReleases, policy => policy.RequireRole(Roles.Lead, Roles.Developer));

// Ticket codes are signed so door devices can check them offline (ADR 7).
builder.Services.AddOptions<TicketOptions>()
    .BindConfiguration(TicketOptions.Section)
    .ValidateDataAnnotations()
    .Validate(options => TicketSigner.IsValidKey(options.SigningKey), "Tickets:SigningKey must be a base64 PKCS#8 ECDSA P-256 private key.")
    .ValidateOnStart();
builder.Services.AddSingleton<TicketSigner>();

// Sign-in and sign-up are open to anyone, so they're limited per client.
builder.Services.AddOptions<RateLimits>()
    .BindConfiguration(RateLimits.Section)
    .ValidateDataAnnotations()
    .ValidateOnStart();
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy(RateLimits.Auth, context =>
    {
        var limits = context.RequestServices.GetRequiredService<IOptions<RateLimits>>().Value;
        return RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions { PermitLimit = limits.AuthPerMinute, Window = TimeSpan.FromMinutes(1) });
    });
});

// The API is reachable only through nginx, behind Caddy (ADR 5), so the
// client's address arrives in X-Forwarded-For. Caddy replaces any value a
// client sends, so the last two entries can be trusted.
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.ForwardLimit = 2;
    options.KnownIPNetworks.Clear();
    options.KnownProxies.Clear();
});

var app = builder.Build();

// `dotnet Doorlist.Api.dll seed-demo-users` creates the roles and demo users,
// then exits. It runs as a step after migrations, not on API startup.
if (args is [DemoUsers.Command])
{
    await DemoUsers.EnsureAsync(app.Services, app.Configuration["Demo:Password"]);
    return;
}

app.UseForwardedHeaders();
app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi().AllowAnonymous();
}

app.MapHealthChecks("/api/health").AllowAnonymous();
app.MapAuthEndpoints();
app.MapEventEndpoints();
app.MapTicketEndpoints();
app.MapCheckInEndpoints();
app.MapAppEndpoints();
app.MapReleaseEndpoints();

await app.RunAsync();
