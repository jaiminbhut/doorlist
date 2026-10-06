using System.Net;
using System.Net.Http.Json;
using Doorlist.Api.Apps;
using Doorlist.Api.Auth;
using Doorlist.Api.Environments;
using static Doorlist.Api.Tests.DoorlistApiFactory;

namespace Doorlist.Api.Tests;

[Collection(ApiTests.Name)]
public sealed class AppEndpointsTests(DoorlistApiFactory factory)
{
    [Fact]
    public async Task LeadCreatesAnAppAndEveryoneCanSeeIt()
    {
        var lead = await factory.CreateClientAsAsync(Roles.Lead);
        var name = Unique("Field App");

        var created = await lead.PostAsJsonAsync("/api/apps", new CreateAppRequest($"  {name}  "));

        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var app = await created.Content.ReadFromJsonAsync<AppResponse>(Json);
        Assert.Equal(name, app!.Name);

        var viewer = await factory.CreateClientAsAsync(Roles.Viewer);
        var list = await viewer.GetFromJsonAsync<AppResponse[]>("/api/apps", Json);
        Assert.Contains(app, list!);
    }

    [Theory]
    [InlineData(Roles.Developer)]
    [InlineData(Roles.Viewer)]
    public async Task OnlyALeadCanCreateApps(string role)
    {
        var client = await factory.CreateClientAsAsync(role);

        var response = await client.PostAsJsonAsync("/api/apps", new CreateAppRequest(Unique("Not allowed")));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task DuplicateNameIsAConflict()
    {
        var lead = await factory.CreateClientAsAsync(Roles.Lead);
        var name = Unique("Lab App");
        await lead.PostAsJsonAsync("/api/apps", new CreateAppRequest(name));

        var duplicate = await lead.PostAsJsonAsync("/api/apps", new CreateAppRequest(name));

        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("   ")]
    public async Task MissingNameIsAValidationProblem(string? name)
    {
        var lead = await factory.CreateClientAsAsync(Roles.Lead);

        var response = await lead.PostAsJsonAsync("/api/apps", new CreateAppRequest(name));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task UnknownAppIsNotFound()
    {
        var viewer = await factory.CreateClientAsAsync(Roles.Viewer);

        var response = await viewer.GetAsync(new Uri("/api/apps/999999", UriKind.Relative));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task EnvironmentsAreListedOnTheAppWithProductionLast()
    {
        var lead = await factory.CreateClientAsAsync(Roles.Lead);
        var app = await CreateAppAsync(lead);

        var production = await lead.PostAsJsonAsync(
            $"/api/apps/{app.Id}/environments", new CreateEnvironmentRequest("production", "https://api.example.com", IsProduction: true));
        var staging = await lead.PostAsJsonAsync(
            $"/api/apps/{app.Id}/environments", new CreateEnvironmentRequest("staging", "https://staging-api.example.com", IsProduction: false));

        Assert.Equal(HttpStatusCode.Created, production.StatusCode);
        Assert.Equal(HttpStatusCode.Created, staging.StatusCode);

        var detail = await lead.GetFromJsonAsync<AppDetailResponse>($"/api/apps/{app.Id}", Json);
        Assert.Equal(["staging", "production"], detail!.Environments.Select(e => e.Name));
        Assert.True(detail.Environments[1].IsProduction);
    }

    [Theory]
    [InlineData("staging", "not a url")]
    [InlineData("staging", "ftp://files.example.com")]
    [InlineData("", "https://api.example.com")]
    public async Task EnvironmentNeedsANameAndAnHttpApiUrl(string name, string apiUrl)
    {
        var lead = await factory.CreateClientAsAsync(Roles.Lead);
        var app = await CreateAppAsync(lead);

        var response = await lead.PostAsJsonAsync(
            $"/api/apps/{app.Id}/environments", new CreateEnvironmentRequest(name, apiUrl, IsProduction: false));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task DuplicateEnvironmentNameIsAConflict()
    {
        var lead = await factory.CreateClientAsAsync(Roles.Lead);
        var app = await CreateAppAsync(lead);
        var request = new CreateEnvironmentRequest("staging", "https://staging-api.example.com", IsProduction: false);
        await lead.PostAsJsonAsync($"/api/apps/{app.Id}/environments", request);

        var duplicate = await lead.PostAsJsonAsync($"/api/apps/{app.Id}/environments", request);

        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);
    }

    [Fact]
    public async Task OnlyALeadCanAddEnvironments()
    {
        var lead = await factory.CreateClientAsAsync(Roles.Lead);
        var app = await CreateAppAsync(lead);
        var developer = await factory.CreateClientAsAsync(Roles.Developer);

        var response = await developer.PostAsJsonAsync(
            $"/api/apps/{app.Id}/environments", new CreateEnvironmentRequest("staging", "https://staging-api.example.com", false));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    private static async Task<AppResponse> CreateAppAsync(HttpClient lead)
    {
        var response = await lead.PostAsJsonAsync("/api/apps", new CreateAppRequest(Unique("App")));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<AppResponse>(Json))!;
    }
}
