using System.Collections.Concurrent;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Shiplog.Api.Auth;
using Shiplog.Api.Data;
using Testcontainers.MsSql;

namespace Shiplog.Api.Tests;

/// <summary>
/// Boots the real API against a throwaway SQL Server container, applies the
/// committed migrations, and seeds the demo users, so the tests exercise the
/// same schema and steps a deploy would. One container serves every test
/// class in the "api" collection.
/// </summary>
public sealed class ShiplogApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const string DemoPassword = "Shiplog-test-password-1";

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
        builder.UseSetting("ConnectionStrings:Shiplog", _database.GetConnectionString());
        builder.UseSetting("Auth:Jwt:SigningKey", "test-signing-key-that-is-long-enough-for-hs256");
    }

    public async Task InitializeAsync()
    {
        await _database.StartAsync();

        using (var scope = Services.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<ShiplogDbContext>().Database.MigrateAsync();
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

    /// <summary>Names that can't collide between tests sharing one database.</summary>
    public static string Unique(string name) => $"{name} {Guid.NewGuid().ToString("N")[..8]}";

    async Task IAsyncLifetime.DisposeAsync()
    {
        await base.DisposeAsync();
        await _database.DisposeAsync();
    }
}

[CollectionDefinition(Name)]
public sealed class ApiTests : ICollectionFixture<ShiplogApiFactory>
{
    public const string Name = "api";
}
