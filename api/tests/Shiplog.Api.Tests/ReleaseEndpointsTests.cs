using System.Net;
using System.Net.Http.Json;
using Shiplog.Api.Apps;
using Shiplog.Api.Auth;
using Shiplog.Api.Environments;
using Shiplog.Api.Releases;
using static Shiplog.Api.Tests.ShiplogApiFactory;

namespace Shiplog.Api.Tests;

[Collection(ApiTests.Name)]
public sealed class ReleaseEndpointsTests(ShiplogApiFactory factory)
{
    [Fact]
    public async Task NewReleaseStartsWithAChecklistNamingTheEnvironmentAndApiUrl()
    {
        var (app, staging, _) = await CreateAppWithEnvironmentsAsync();
        var developer = await factory.CreateClientAsAsync(Roles.Developer);

        var response = await developer.PostAsJsonAsync(
            "/api/releases", new CreateReleaseRequest(app.Id, staging.Id, Platform.Android, "2.4.0", 118, "Fixes sign-in."), Json);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var release = (await response.Content.ReadFromJsonAsync<ReleaseDetail>(Json))!;
        Assert.Equal(ReleaseStatus.InProgress, release.Status);
        Assert.Equal(("2.4.0 (118)", "2.4.0", 118), (release.Version, release.VersionName, release.BuildNumber));
        Assert.Equal("developer@example.com", release.CreatedBy);
        Assert.Equal(4, release.Checklist.Length);
        Assert.Contains("staging", release.Checklist[0].Title, StringComparison.Ordinal);
        Assert.Contains("https://staging-api.example.com", release.Checklist[1].Title, StringComparison.Ordinal);
        Assert.All(release.Checklist, item => Assert.False(item.IsDone));
    }

    [Fact]
    public async Task ViewersCannotCreateReleases()
    {
        var (app, staging, _) = await CreateAppWithEnvironmentsAsync();
        var viewer = await factory.CreateClientAsAsync(Roles.Viewer);

        var response = await viewer.PostAsJsonAsync(
            "/api/releases", new CreateReleaseRequest(app.Id, staging.Id, Platform.Ios, "1.0.0", null, null), Json);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task EnvironmentMustBelongToTheApp()
    {
        var (app, _, _) = await CreateAppWithEnvironmentsAsync();
        var (_, otherAppsStaging, _) = await CreateAppWithEnvironmentsAsync();
        var developer = await factory.CreateClientAsAsync(Roles.Developer);

        var response = await developer.PostAsJsonAsync(
            "/api/releases", new CreateReleaseRequest(app.Id, otherAppsStaging.Id, Platform.Web, "1.0.0", null, null), Json);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task SameVersionPlatformAndEnvironmentIsAConflict()
    {
        var (app, staging, _) = await CreateAppWithEnvironmentsAsync();
        var developer = await factory.CreateClientAsAsync(Roles.Developer);
        var request = new CreateReleaseRequest(app.Id, staging.Id, Platform.Android, "3.0.0", null, null);
        await developer.PostAsJsonAsync("/api/releases", request, Json);

        var duplicate = await developer.PostAsJsonAsync("/api/releases", request, Json);

        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);
    }

    [Fact]
    public async Task CannotShipUntilEveryChecklistItemIsDone()
    {
        var developer = await factory.CreateClientAsAsync(Roles.Developer);
        var release = await CreateStagingReleaseAsync(developer);
        await TickAsync(developer, release, release.Checklist[..^1]);

        var response = await developer.PostAsync(new Uri($"/api/releases/{release.Id}/ship", UriKind.Relative), null);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task DeveloperShipsToStagingOnceTheChecklistIsDone()
    {
        var developer = await factory.CreateClientAsAsync(Roles.Developer);
        var release = await CreateStagingReleaseAsync(developer);
        await TickAsync(developer, release, release.Checklist);

        var response = await developer.PostAsync(new Uri($"/api/releases/{release.Id}/ship", UriKind.Relative), null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var shipped = (await response.Content.ReadFromJsonAsync<ReleaseDetail>(Json))!;
        Assert.Equal(ReleaseStatus.Shipped, shipped.Status);
        Assert.Equal("developer@example.com", shipped.ShippedBy);
        Assert.NotNull(shipped.ShippedAt);
        Assert.All(shipped.Checklist, item => Assert.Equal("developer@example.com", item.DoneBy));
    }

    [Fact]
    public async Task OnlyALeadShipsToProduction()
    {
        var (app, _, production) = await CreateAppWithEnvironmentsAsync();
        var developer = await factory.CreateClientAsAsync(Roles.Developer);
        var created = await developer.PostAsJsonAsync(
            "/api/releases", new CreateReleaseRequest(app.Id, production.Id, Platform.Ios, "5.1.0", null, null), Json);
        var release = (await created.Content.ReadFromJsonAsync<ReleaseDetail>(Json))!;
        await TickAsync(developer, release, release.Checklist);

        var byDeveloper = await developer.PostAsync(new Uri($"/api/releases/{release.Id}/ship", UriKind.Relative), null);
        var lead = await factory.CreateClientAsAsync(Roles.Lead);
        var byLead = await lead.PostAsync(new Uri($"/api/releases/{release.Id}/ship", UriKind.Relative), null);

        Assert.Equal(HttpStatusCode.Forbidden, byDeveloper.StatusCode);
        Assert.Equal(HttpStatusCode.OK, byLead.StatusCode);
    }

    [Fact]
    public async Task AShippedReleaseIsClosed()
    {
        var developer = await factory.CreateClientAsAsync(Roles.Developer);
        var release = await CreateStagingReleaseAsync(developer);
        await TickAsync(developer, release, release.Checklist);
        await developer.PostAsync(new Uri($"/api/releases/{release.Id}/ship", UriKind.Relative), null);

        var untick = await developer.PutAsJsonAsync(
            $"/api/releases/{release.Id}/checklist/{release.Checklist[0].Id}", new UpdateChecklistItemRequest(false));
        var shipAgain = await developer.PostAsync(new Uri($"/api/releases/{release.Id}/ship", UriKind.Relative), null);

        Assert.Equal(HttpStatusCode.Conflict, untick.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, shipAgain.StatusCode);
    }

    [Fact]
    public async Task BoardListsReleasesWithChecklistProgress()
    {
        var developer = await factory.CreateClientAsAsync(Roles.Developer);
        var release = await CreateStagingReleaseAsync(developer);
        await TickAsync(developer, release, release.Checklist[..2]);

        var viewer = await factory.CreateClientAsAsync(Roles.Viewer);
        var board = await viewer.GetFromJsonAsync<ReleaseSummary[]>($"/api/releases?appId={release.AppId}", Json);

        var summary = Assert.Single(board!);
        Assert.Equal(release.Id, summary.Id);
        Assert.Equal(2, summary.ChecklistDone);
        Assert.Equal(4, summary.ChecklistTotal);
        Assert.False(summary.IsProduction);
    }

    [Fact]
    public async Task NegativeBuildNumberIsAValidationProblem()
    {
        var (app, staging, _) = await CreateAppWithEnvironmentsAsync();
        var developer = await factory.CreateClientAsAsync(Roles.Developer);

        var response = await developer.PostAsJsonAsync(
            "/api/releases", new CreateReleaseRequest(app.Id, staging.Id, Platform.Web, "1.0.0", -1, null), Json);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task DuplicatesAreJudgedOnVersionNameAndBuildNumber()
    {
        var (app, staging, _) = await CreateAppWithEnvironmentsAsync();
        var developer = await factory.CreateClientAsAsync(Roles.Developer);
        var request = new CreateReleaseRequest(app.Id, staging.Id, Platform.Ios, "6.0.0", 3, null);
        var release = await ReadAsync<ReleaseDetail>(await developer.PostAsJsonAsync("/api/releases", request, Json));

        var duplicate = await developer.PostAsJsonAsync("/api/releases", request, Json);
        var sameNameOtherBuild = await developer.PostAsJsonAsync("/api/releases", request with { BuildNumber = 4 }, Json);
        var sameNameNoBuild = await developer.PostAsJsonAsync("/api/releases", request with { BuildNumber = null }, Json);
        var sameNameNoBuildAgain = await developer.PostAsJsonAsync("/api/releases", request with { BuildNumber = null }, Json);

        Assert.Equal("6.0.0 (3)", release.Version);
        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);
        Assert.Equal(HttpStatusCode.Created, sameNameOtherBuild.StatusCode);
        Assert.Equal(HttpStatusCode.Created, sameNameNoBuild.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, sameNameNoBuildAgain.StatusCode);
    }

    private async Task<(AppResponse App, EnvironmentResponse Staging, EnvironmentResponse Production)> CreateAppWithEnvironmentsAsync()
    {
        var lead = await factory.CreateClientAsAsync(Roles.Lead);

        var app = await ReadAsync<AppResponse>(await lead.PostAsJsonAsync("/api/apps", new CreateAppRequest(Unique("App"))));
        var staging = await ReadAsync<EnvironmentResponse>(await lead.PostAsJsonAsync(
            $"/api/apps/{app.Id}/environments", new CreateEnvironmentRequest("staging", "https://staging-api.example.com", false)));
        var production = await ReadAsync<EnvironmentResponse>(await lead.PostAsJsonAsync(
            $"/api/apps/{app.Id}/environments", new CreateEnvironmentRequest("production", "https://api.example.com", true)));

        return (app, staging, production);
    }

    private async Task<ReleaseDetail> CreateStagingReleaseAsync(HttpClient developer, string versionName = "1.2.0", int? buildNumber = null)
    {
        var (app, staging, _) = await CreateAppWithEnvironmentsAsync();

        return await ReadAsync<ReleaseDetail>(await developer.PostAsJsonAsync(
            "/api/releases", new CreateReleaseRequest(app.Id, staging.Id, Platform.Android, versionName, buildNumber, null), Json));
    }

    private static async Task TickAsync(HttpClient client, ReleaseDetail release, IEnumerable<ChecklistItemResponse> items)
    {
        foreach (var item in items)
        {
            var response = await client.PutAsJsonAsync(
                $"/api/releases/{release.Id}/checklist/{item.Id}", new UpdateChecklistItemRequest(true));
            response.EnsureSuccessStatusCode();
        }
    }

    private static async Task<T> ReadAsync<T>(HttpResponseMessage response)
    {
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<T>(Json))!;
    }
}
