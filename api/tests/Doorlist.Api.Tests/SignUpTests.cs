using System.Net;
using System.Net.Http.Json;
using Doorlist.Api.Auth;
using static Doorlist.Api.Tests.DoorlistApiFactory;

namespace Doorlist.Api.Tests;

[Collection(ApiTests.Name)]
public sealed class SignUpTests(DoorlistApiFactory factory)
{
    [Fact]
    public async Task SigningUpMakesAnAttendeeAndSignsThemIn()
    {
        var email = $"new-{Guid.NewGuid():N}@example.com";

        var response = await factory.CreateClient().PostAsJsonAsync(
            "/api/auth/register", new RegisterRequest(email, DemoPassword, "  Asha  "));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var login = (await response.Content.ReadFromJsonAsync<LoginResponse>(Json))!;
        Assert.Equal((email, "Asha"), (login.User.Email, login.User.DisplayName));
        Assert.Equal(["Attendee"], login.User.Roles);

        var signIn = await factory.CreateClient().PostAsJsonAsync("/api/auth/login", new LoginRequest(email, DemoPassword));
        Assert.Equal(HttpStatusCode.OK, signIn.StatusCode);
    }

    [Fact]
    public async Task AnEmailCanOnlySignUpOnce()
    {
        var email = $"twice-{Guid.NewGuid():N}@example.com";
        await factory.CreateClient().PostAsJsonAsync("/api/auth/register", new RegisterRequest(email, DemoPassword, "First"));

        var again = await factory.CreateClient().PostAsJsonAsync("/api/auth/register", new RegisterRequest(email, DemoPassword, "Second"));

        Assert.Equal(HttpStatusCode.BadRequest, again.StatusCode);
        var problem = await again.Content.ReadFromJsonAsync<Microsoft.AspNetCore.Mvc.ValidationProblemDetails>(Json);
        Assert.Equal([$"Email '{email}' is already taken."], problem!.Errors["email"]);
    }

    [Theory]
    [InlineData("short")]
    [InlineData("alllowercaseandlong")]
    public async Task AWeakPasswordIsRejected(string password)
    {
        var response = await factory.CreateClient().PostAsJsonAsync(
            "/api/auth/register", new RegisterRequest($"weak-{Guid.NewGuid():N}@example.com", password, "Weak"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("\"password\"", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task ANameIsRequired()
    {
        var response = await factory.CreateClient().PostAsJsonAsync(
            "/api/auth/register", new RegisterRequest($"noname-{Guid.NewGuid():N}@example.com", DemoPassword, "  "));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task SignInAndSignUpAreRateLimitedPerClient()
    {
        await using var strict = factory.WithWebHostBuilder(builder => builder.UseSetting("RateLimits:AuthPerMinute", "3"));
        var client = strict.CreateClient();
        var attempt = () => client.PostAsJsonAsync("/api/auth/login", new LoginRequest("nobody@example.com", "wrong-password"));

        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < 4; i++)
        {
            statuses.Add((await attempt()).StatusCode);
        }

        Assert.Equal(
            [HttpStatusCode.Unauthorized, HttpStatusCode.Unauthorized, HttpStatusCode.Unauthorized, HttpStatusCode.TooManyRequests],
            statuses);
    }
}
