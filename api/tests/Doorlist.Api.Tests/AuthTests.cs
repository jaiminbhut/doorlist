using System.Net;
using System.Net.Http.Json;
using Doorlist.Api.Auth;

namespace Doorlist.Api.Tests;

[Collection(ApiTests.Name)]
public sealed class AuthTests(DoorlistApiFactory factory)
{
    [Fact]
    public async Task HealthCheckNeedsNoSignIn()
    {
        var response = await factory.CreateClient().GetAsync(new Uri("/api/health", UriKind.Relative));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Healthy", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task EverythingElseNeedsSignIn()
    {
        var response = await factory.CreateClient().GetAsync(new Uri("/api/tickets/mine", UriKind.Relative));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task LoginReturnsATokenWithTheUsersRoles()
    {
        var response = await factory.CreateClient().PostAsJsonAsync(
            "/api/auth/login", new LoginRequest("organizer@example.com", DoorlistApiFactory.DemoPassword));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var login = await response.Content.ReadFromJsonAsync<LoginResponse>(DoorlistApiFactory.Json);
        Assert.False(string.IsNullOrEmpty(login!.AccessToken));
        Assert.Equal(["Organizer"], login.User.Roles);
        Assert.True(login.ExpiresAt > DateTimeOffset.UtcNow);
    }

    [Theory]
    [InlineData("organizer@example.com", "wrong-password")]
    [InlineData("nobody@example.com", DoorlistApiFactory.DemoPassword)]
    public async Task BadCredentialsGetTheSameAnswer(string email, string password)
    {
        var response = await factory.CreateClient().PostAsJsonAsync("/api/auth/login", new LoginRequest(email, password));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Contains("Email or password is incorrect.", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task MeDescribesTheSignedInUser()
    {
        var client = await factory.CreateClientAsAsync(Roles.DoorStaff);

        var me = await client.GetFromJsonAsync<UserResponse>("/api/auth/me", DoorlistApiFactory.Json);

        Assert.Equal("door@example.com", me!.Email);
        Assert.Equal("Demo Door Staff", me.DisplayName);
        Assert.Equal(["DoorStaff"], me.Roles);
    }

    [Fact]
    public async Task ATokenSignedWithAnotherKeyIsRejected()
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer",
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ4Iiwicm9sZSI6IkxlYWQifQ.c2lnbmVkLXdpdGgtYW5vdGhlci1rZXk");

        var response = await client.GetAsync(new Uri("/api/tickets/mine", UriKind.Relative));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
