using System.Collections.Concurrent;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Doorlist.Api.Auth;
using Doorlist.Api.Data;
using Doorlist.Api.Events;
using Doorlist.Api.Tickets;
using Testcontainers.MsSql;

namespace Doorlist.Api.Tests;

/// <summary>
/// Boots the real API against a throwaway SQL Server container, applies the
/// committed migrations, and seeds the demo users, so the tests exercise the
/// same schema and steps a deploy would. One container serves every test
/// class in the "api" collection.
/// </summary>
public sealed class DoorlistApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const string DemoPassword = "Doorlist-test-password-1";

    public static string TicketSigningKey { get; } = TicketSigner.GenerateKey();

    public static JsonSerializerOptions Json { get; } = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    private readonly MsSqlContainer _database =
        new MsSqlBuilder("mcr.microsoft.com/mssql/server:2022-latest").Build();

    private readonly ConcurrentDictionary<string, string> _tokens = new();

    /// <summary>The test SQL Server, for tests that need their own database on it.</summary>
    public string ConnectionString => _database.GetConnectionString();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("ConnectionStrings:Doorlist", _database.GetConnectionString());
        builder.UseSetting("Auth:Jwt:SigningKey", "test-signing-key-that-is-long-enough-for-hs256");
        builder.UseSetting("Tickets:SigningKey", TicketSigningKey);
        // Tests sign up many attendees from one address; RateLimitTests checks the limit itself.
        builder.UseSetting("RateLimits:AuthPerMinute", "100000");
    }

    public async Task InitializeAsync()
    {
        await _database.StartAsync();

        using (var scope = Services.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<DoorlistDbContext>().Database.MigrateAsync();
        }

        await DemoUsers.EnsureAsync(Services, DemoPassword);
    }

    /// <summary>A client signed in as the demo user for <paramref name="role"/>.</summary>
    public async Task<HttpClient> CreateClientAsAsync(string role)
    {
        var client = CreateClient();

        if (!_tokens.TryGetValue(role, out var token))
        {
            var email = DemoUsers.All.Single(user => user.Role == role).Email;
            var response = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(email, DemoPassword));
            response.EnsureSuccessStatusCode();
            token = (await response.Content.ReadFromJsonAsync<LoginResponse>(Json))!.AccessToken;
            _tokens[role] = token;
        }

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    /// <summary>A brand-new attendee, signed up through the API, and a client signed in as them.</summary>
    public async Task<(HttpClient Client, string Email)> SignUpAttendeeAsync()
    {
        var email = $"attendee-{Guid.NewGuid():N}@example.com";
        var client = CreateClient();
        var response = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(email, DemoPassword, "Test Attendee"));
        response.EnsureSuccessStatusCode();
        var login = (await response.Content.ReadFromJsonAsync<LoginResponse>(Json))!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", login.AccessToken);
        return (client, email);
    }

    /// <summary>A published event a week away, with one ticket type of the given capacity.</summary>
    public async Task<(int EventId, int TicketTypeId)> PublishEventAsync(int capacity = 100, TimeSpan? startsIn = null)
    {
        var organizer = await CreateClientAsAsync(Roles.Organizer);
        var startsAt = DateTimeOffset.UtcNow + (startsIn ?? TimeSpan.FromDays(7));

        var created = await organizer.PostAsJsonAsync("/api/events",
            new CreateEventRequest(Unique("Event"), "Main Hall", null, startsAt, startsAt.AddHours(3)), Json);
        created.EnsureSuccessStatusCode();
        var e = (await created.Content.ReadFromJsonAsync<EventResponse>(Json))!;

        var typed = await organizer.PostAsJsonAsync($"/api/events/{e.Id}/ticket-types", new CreateTicketTypeRequest("General admission", capacity), Json);
        typed.EnsureSuccessStatusCode();
        var type = (await typed.Content.ReadFromJsonAsync<TicketTypeResponse>(Json))!;

        (await organizer.PostAsync(new Uri($"/api/events/{e.Id}/publish", UriKind.Relative), null)).EnsureSuccessStatusCode();
        return (e.Id, type.Id);
    }

    /// <summary>Names that can't collide between tests sharing one database.</summary>
    public static string Unique(string name) => $"{name} {Guid.NewGuid().ToString("N")[..8]}";

    async Task IAsyncLifetime.DisposeAsync()
    {
        await base.DisposeAsync();
        await _database.DisposeAsync();
    }
}

[CollectionDefinition(Name)]
public sealed class ApiTests : ICollectionFixture<DoorlistApiFactory>
{
    public const string Name = "api";
}
