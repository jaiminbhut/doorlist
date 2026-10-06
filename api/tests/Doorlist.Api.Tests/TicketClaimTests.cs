using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using Doorlist.Api.Auth;
using Doorlist.Api.Events;
using Doorlist.Api.Tickets;
using static Doorlist.Api.Tests.DoorlistApiFactory;

namespace Doorlist.Api.Tests;

[Collection(ApiTests.Name)]
public sealed class TicketClaimTests(DoorlistApiFactory factory)
{
    [Fact]
    public async Task AnAttendeeClaimsTicketsWhoseCodesVerifyWithThePublicKey()
    {
        var (eventId, typeId) = await factory.PublishEventAsync(capacity: 10);
        var (attendee, _) = await factory.SignUpAttendeeAsync();

        var response = await attendee.PostAsJsonAsync($"/api/events/{eventId}/tickets", new ClaimTicketsRequest(typeId, 2), Json);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var tickets = (await response.Content.ReadFromJsonAsync<TicketResponse[]>(Json))!;
        Assert.Equal(2, tickets.Length);

        // Exactly what a door device does offline: check the signature with the public key.
        var key = await factory.CreateClient().GetFromJsonAsync<SigningKeyResponse>("/api/tickets/signing-key", Json);
        using var publicKey = ECDsa.Create();
        publicKey.ImportSubjectPublicKeyInfo(Convert.FromBase64String(key!.PublicKey), out _);
        Assert.All(tickets, ticket =>
        {
            var parts = ticket.Code.Split('.');
            var signature = System.Buffers.Text.Base64Url.DecodeFromChars(parts[2]);
            Assert.True(publicKey.VerifyData(
                Encoding.ASCII.GetBytes($"{parts[0]}.{parts[1]}"), signature, HashAlgorithmName.SHA256,
                DSASignatureFormat.IeeeP1363FixedFieldConcatenation));
        });

        var mine = await attendee.GetFromJsonAsync<TicketResponse[]>("/api/tickets/mine", Json);
        Assert.Equal(tickets.Select(t => t.Id).Order(), mine!.Select(t => t.Id).Order());
        Assert.Equal(8, await RemainingAsync(eventId));
    }

    [Fact]
    public async Task NoMoreThanCapacityIsIssuedHoweverManyClaimAtOnce()
    {
        const int capacity = 10;
        const int claimants = 30;
        var (eventId, typeId) = await factory.PublishEventAsync(capacity);
        var attendees = await Task.WhenAll(Enumerable.Range(0, claimants).Select(_ => factory.SignUpAttendeeAsync()));

        var responses = await Task.WhenAll(attendees.Select(a =>
            a.Client.PostAsJsonAsync($"/api/events/{eventId}/tickets", new ClaimTicketsRequest(typeId, 1), Json)));

        Assert.Equal(capacity, responses.Count(r => r.StatusCode == HttpStatusCode.Created));
        Assert.Equal(claimants - capacity, responses.Count(r => r.StatusCode == HttpStatusCode.Conflict));
        Assert.Equal(0, await RemainingAsync(eventId));
    }

    [Fact]
    public async Task OneAttendeeCannotGoOverTheLimitEvenWithParallelClaims()
    {
        var (eventId, typeId) = await factory.PublishEventAsync(capacity: 100);
        var (attendee, _) = await factory.SignUpAttendeeAsync();

        var responses = await Task.WhenAll(Enumerable.Range(0, 8).Select(_ =>
            attendee.PostAsJsonAsync($"/api/events/{eventId}/tickets", new ClaimTicketsRequest(typeId, 1), Json)));

        Assert.Equal(TicketEndpoints.MaxTicketsPerAttendee, responses.Count(r => r.StatusCode == HttpStatusCode.Created));
        var mine = await attendee.GetFromJsonAsync<TicketResponse[]>("/api/tickets/mine", Json);
        Assert.Equal(TicketEndpoints.MaxTicketsPerAttendee, mine!.Count(t => t.EventId == eventId));
        Assert.Equal(100 - TicketEndpoints.MaxTicketsPerAttendee, await RemainingAsync(eventId));
    }

    [Fact]
    public async Task ClaimingMoreThanIsLeftIsAConflictAndTakesNothing()
    {
        var (eventId, typeId) = await factory.PublishEventAsync(capacity: 3);
        var (attendee, _) = await factory.SignUpAttendeeAsync();

        var response = await attendee.PostAsJsonAsync($"/api/events/{eventId}/tickets", new ClaimTicketsRequest(typeId, 4), Json);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(3, await RemainingAsync(eventId));
    }

    [Theory]
    [InlineData(Roles.Organizer)]
    [InlineData(Roles.DoorStaff)]
    public async Task OnlyAttendeesClaimTickets(string role)
    {
        var (eventId, typeId) = await factory.PublishEventAsync();
        var client = await factory.CreateClientAsAsync(role);

        var response = await client.PostAsJsonAsync($"/api/events/{eventId}/tickets", new ClaimTicketsRequest(typeId, 1), Json);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task ADraftEventHasNoTicketsToClaim()
    {
        var organizer = await factory.CreateClientAsAsync(Roles.Organizer);
        var startsAt = DateTimeOffset.UtcNow.AddDays(5);
        var created = await organizer.PostAsJsonAsync("/api/events", new CreateEventRequest(Unique("Draft"), "Hall", null, startsAt, startsAt.AddHours(1)), Json);
        var e = (await created.Content.ReadFromJsonAsync<EventResponse>(Json))!;
        var typed = await organizer.PostAsJsonAsync($"/api/events/{e.Id}/ticket-types", new CreateTicketTypeRequest("GA", 5), Json);
        var type = (await typed.Content.ReadFromJsonAsync<TicketTypeResponse>(Json))!;
        var (attendee, _) = await factory.SignUpAttendeeAsync();

        var response = await attendee.PostAsJsonAsync($"/api/events/{e.Id}/tickets", new ClaimTicketsRequest(type.Id, 1), Json);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task TicketsStopOnceTheEventStarts()
    {
        var (eventId, typeId) = await factory.PublishEventAsync(capacity: 5, startsIn: TimeSpan.FromSeconds(2));
        var (attendee, _) = await factory.SignUpAttendeeAsync();
        await Task.Delay(TimeSpan.FromSeconds(3));

        var response = await attendee.PostAsJsonAsync($"/api/events/{eventId}/tickets", new ClaimTicketsRequest(typeId, 1), Json);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    private async Task<int> RemainingAsync(int eventId)
    {
        var organizer = await factory.CreateClientAsAsync(Roles.Organizer);
        var events = await organizer.GetFromJsonAsync<EventResponse[]>("/api/organizer/events", Json);
        return events!.Single(e => e.Id == eventId).TicketTypes.Single().Remaining;
    }
}
