using System.Net;
using System.Net.Http.Json;
using Shiplog.Api.Apps;

namespace Shiplog.Api.Tests;

public sealed class AppEndpointsTests(ShiplogApiFactory factory) : IClassFixture<ShiplogApiFactory>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task HealthCheckReportsHealthyWhenTheDatabaseIsReachable()
    {
        var response = await _client.GetAsync(new Uri("/api/health", UriKind.Relative));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Healthy", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task CreatedAppIsReturnedByIdAndInTheList()
    {
        var created = await _client.PostAsJsonAsync("/api/apps", new CreateAppRequest("  Field App  "));

        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var app = await created.Content.ReadFromJsonAsync<AppResponse>();
        Assert.NotNull(app);
        Assert.Equal("Field App", app.Name);

        var byId = await _client.GetFromJsonAsync<AppResponse>(created.Headers.Location);
        Assert.Equal(app, byId);

        var list = await _client.GetFromJsonAsync<AppResponse[]>("/api/apps");
        Assert.Contains(app, list!);
    }

    [Fact]
    public async Task DuplicateNameIsAConflict()
    {
        await _client.PostAsJsonAsync("/api/apps", new CreateAppRequest("Lab App"));

        var duplicate = await _client.PostAsJsonAsync("/api/apps", new CreateAppRequest("Lab App"));

        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("   ")]
    public async Task MissingNameIsAValidationProblem(string? name)
    {
        var response = await _client.PostAsJsonAsync("/api/apps", new CreateAppRequest(name));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task UnknownAppIsNotFound()
    {
        var response = await _client.GetAsync(new Uri("/api/apps/999999", UriKind.Relative));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
