using System.Net;
using System.Net.Http.Json;
using Doorlist.Api.Auth;
using Doorlist.Api.Events;
using static Doorlist.Api.Tests.DoorlistApiFactory;

namespace Doorlist.Api.Tests;

[Collection(ApiTests.Name)]
public sealed class EventEndpointsTests(DoorlistApiFactory factory)
{
    private static CreateEventRequest NextWeek(string name) =>
        new(name, "Main Hall", "An evening of talks.", DateTimeOffset.UtcNow.AddDays(7), DateTimeOffset.UtcNow.AddDays(7).AddHours(3));

    [Fact]
    public async Task ADraftIsVisibleOnlyToOrganizersUntilItIsPublished()
    {
        var organizer = await factory.CreateClientAsAsync(Roles.Organizer);
        var name = Unique("Launch night");
        var e = await ReadAsync<EventResponse>(await organizer.PostAsJsonAsync("/api/events", NextWeek(name), Json));
        await organizer.PostAsJsonAsync($"/api/events/{e.Id}/ticket-types", new CreateTicketTypeRequest("General admission", 50), Json);

        var anonymous = factory.CreateClient();
        Assert.Equal(EventStatus.Draft, e.Status);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync(new Uri($"/api/events/{e.Id}", UriKind.Relative))).StatusCode);
        Assert.DoesNotContain(await PublicListAsync(anonymous), listed => listed.Id == e.Id);
        Assert.Contains(await organizer.GetFromJsonAsync<EventResponse[]>("/api/organizer/events", Json) ?? [], listed => listed.Id == e.Id);

        var published = await ReadAsync<EventResponse>(await organizer.PostAsync(new Uri($"/api/events/{e.Id}/publish", UriKind.Relative), null));

        Assert.Equal(EventStatus.Published, published.Status);
        var seen = await anonymous.GetFromJsonAsync<EventResponse>($"/api/events/{e.Id}", Json);
        Assert.Equal(name, seen!.Name);
        Assert.Equal(("General admission", 50, 50), (seen.TicketTypes[0].Name, seen.TicketTypes[0].Capacity, seen.TicketTypes[0].Remaining));
        Assert.Contains(await PublicListAsync(anonymous), listed => listed.Id == e.Id);
    }

    [Theory]
    [InlineData(Roles.DoorStaff)]
    [InlineData(Roles.Attendee)]
    public async Task OnlyOrganizersCreateEvents(string role)
    {
        var client = await factory.CreateClientAsAsync(role);

        var response = await client.PostAsJsonAsync("/api/events", NextWeek(Unique("Not allowed")), Json);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task AnEventMustEndAfterItStarts()
    {
        var organizer = await factory.CreateClientAsAsync(Roles.Organizer);
        var startsAt = DateTimeOffset.UtcNow.AddDays(3);

        var response = await organizer.PostAsJsonAsync(
            "/api/events", new CreateEventRequest("Backwards", "Hall", null, startsAt, startsAt.AddHours(-1)), Json);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task PublishingNeedsATicketType()
    {
        var organizer = await factory.CreateClientAsAsync(Roles.Organizer);
        var e = await ReadAsync<EventResponse>(await organizer.PostAsJsonAsync("/api/events", NextWeek(Unique("Empty")), Json));

        var response = await organizer.PostAsync(new Uri($"/api/events/{e.Id}/publish", UriKind.Relative), null);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Theory]
    [InlineData("", 10)]
    [InlineData("VIP", 0)]
    [InlineData("VIP", 100_001)]
    public async Task ATicketTypeNeedsANameAndASensibleCapacity(string name, int capacity)
    {
        var organizer = await factory.CreateClientAsAsync(Roles.Organizer);
        var e = await ReadAsync<EventResponse>(await organizer.PostAsJsonAsync("/api/events", NextWeek(Unique("Typed")), Json));

        var response = await organizer.PostAsJsonAsync($"/api/events/{e.Id}/ticket-types", new CreateTicketTypeRequest(name, capacity), Json);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    private static async Task<EventResponse[]> PublicListAsync(HttpClient client) =>
        await client.GetFromJsonAsync<EventResponse[]>("/api/events", Json) ?? [];

    private static async Task<T> ReadAsync<T>(HttpResponseMessage response)
    {
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<T>(Json))!;
    }
}
