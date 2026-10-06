using System.Net;
using System.Net.Http.Json;
using Doorlist.Api.Auth;
using Doorlist.Api.CheckIns;
using Doorlist.Api.Tickets;
using Microsoft.Extensions.Options;
using static Doorlist.Api.Tests.DoorlistApiFactory;

namespace Doorlist.Api.Tests;

[Collection(ApiTests.Name)]
public sealed class CheckInTests(DoorlistApiFactory factory)
{
    [Fact]
    public async Task TheFirstScanAdmitsAndALaterOneIsRefusedWithWhenAndWhere()
    {
        var (eventId, tickets) = await EventWithTicketsAsync();
        var door = await factory.CreateClientAsAsync(Roles.DoorStaff);

        var first = (await SendAsync(door, eventId, "North door", Scan(tickets[0].Code))).Single();
        var second = (await SendAsync(door, eventId, "South door", Scan(tickets[0].Code))).Single();

        Assert.Equal(CheckInOutcome.Admitted, first.Outcome);
        Assert.Equal(("Test Attendee", "General admission"), (first.HolderName, first.TicketTypeName));
        Assert.Equal(CheckInOutcome.AlreadyAdmitted, second.Outcome);
        Assert.Equal("North door", second.AdmittedAtDoor);
        Assert.Equal(first.AdmittedAt, second.AdmittedAt);
    }

    [Fact]
    public async Task ARetriedBatchIsRecordedOnceAndAnsweredTheSameWay()
    {
        var (eventId, tickets) = await EventWithTicketsAsync(count: 2);
        var door = await factory.CreateClientAsAsync(Roles.DoorStaff);
        var batch = tickets.Select(t => Scan(t.Code)).ToArray();

        var firstTime = await SendAsync(door, eventId, "North door", batch);
        var retried = await SendAsync(door, eventId, "North door", batch);

        Assert.Equal(firstTime, retried);
        Assert.All(retried, result => Assert.Equal(CheckInOutcome.Admitted, result.Outcome));
        var summary = await SummaryAsync(eventId);
        Assert.Equal((2, 0), (summary.Admitted, summary.Duplicates));
    }

    [Fact]
    public async Task OfflineDevicesSyncingLaterGetTheFirstRecordedAdmissionAndTheDuplicateIsFlagged()
    {
        var (eventId, tickets) = await EventWithTicketsAsync();
        var door = await factory.CreateClientAsAsync(Roles.DoorStaff);
        var doorsOpen = DateTimeOffset.UtcNow.AddMinutes(-30);

        // Both doors were offline and both let the ticket in. The south door
        // scanned it first by its own clock, but the north door synced first.
        var north = (await SendAsync(door, eventId, "North door", Scan(tickets[0].Code, doorsOpen.AddMinutes(5)))).Single();
        var south = (await SendAsync(door, eventId, "South door", Scan(tickets[0].Code, doorsOpen.AddMinutes(1)))).Single();

        Assert.Equal(CheckInOutcome.Admitted, north.Outcome);
        Assert.Equal(CheckInOutcome.AlreadyAdmitted, south.Outcome);
        var flagged = Assert.Single((await SummaryAsync(eventId)).RecentDuplicates);
        Assert.Equal(("North door", "South door"), (flagged.FirstAdmittedAtDoor, flagged.ScannedAtDoor));
        Assert.Equal(doorsOpen.AddMinutes(5), flagged.FirstAdmittedAt);
        Assert.Equal(doorsOpen.AddMinutes(1), flagged.ScannedAt);
    }

    [Fact]
    public async Task TenDevicesSyncingTheSameTicketAtOnceAdmitItExactlyOnce()
    {
        var (eventId, tickets) = await EventWithTicketsAsync();
        var door = await factory.CreateClientAsAsync(Roles.DoorStaff);

        var results = await Task.WhenAll(Enumerable.Range(1, 10).Select(n =>
            SendAsync(door, eventId, $"Door {n}", Scan(tickets[0].Code))));

        var outcomes = results.Select(r => r.Single().Outcome).ToArray();
        Assert.Equal(1, outcomes.Count(o => o == CheckInOutcome.Admitted));
        Assert.Equal(9, outcomes.Count(o => o == CheckInOutcome.AlreadyAdmitted));
        Assert.Equal(1, (await SummaryAsync(eventId)).Admitted);
    }

    [Fact]
    public async Task ForgedEditedAndForeignCodesAreNotAdmitted()
    {
        var (eventId, tickets) = await EventWithTicketsAsync();
        var (otherEventId, otherTickets) = await EventWithTicketsAsync();
        var door = await factory.CreateClientAsAsync(Roles.DoorStaff);
        var parts = tickets[0].Code.Split('.');
        var someoneElsesPayload = otherTickets[0].Code.Split('.')[1];
        using var otherKey = new TicketSigner(Options.Create(new TicketOptions { SigningKey = TicketSigner.GenerateKey() }));

        var results = await SendAsync(door, eventId, "North door",
            Scan("not a ticket"),
            Scan($"{parts[0]}.{someoneElsesPayload}.{parts[2]}"),
            Scan(otherKey.Sign(Guid.NewGuid(), eventId)),
            Scan(otherTickets[0].Code));

        Assert.Equal(
            [CheckInOutcome.Invalid, CheckInOutcome.Invalid, CheckInOutcome.Invalid, CheckInOutcome.WrongEvent],
            results.Select(r => r.Outcome));
        var summary = await SummaryAsync(eventId);
        Assert.Equal((0, 3, 1), (summary.Admitted, summary.Invalid, summary.WrongEvent));
        Assert.NotEqual(eventId, otherEventId);
    }

    [Fact]
    public async Task OnlyDoorStaffAndOrganizersCheckIn()
    {
        var (eventId, tickets) = await EventWithTicketsAsync();
        var attendee = await factory.CreateClientAsAsync(Roles.Attendee);
        var organizer = await factory.CreateClientAsAsync(Roles.Organizer);
        var request = new CheckInRequest("device-1", "North door", [Scan(tickets[0].Code)]);

        var byAttendee = await attendee.PostAsJsonAsync($"/api/events/{eventId}/checkins", request, Json);
        var byOrganizer = await organizer.PostAsJsonAsync($"/api/events/{eventId}/checkins", request, Json);

        Assert.Equal(HttpStatusCode.Forbidden, byAttendee.StatusCode);
        Assert.Equal(HttpStatusCode.OK, byOrganizer.StatusCode);
    }

    [Theory]
    [InlineData("", 1)]
    [InlineData("device-1", 0)]
    [InlineData("device-1", CheckInEndpoints.MaxScansPerBatch + 1)]
    public async Task ABatchNeedsADeviceAndASensibleNumberOfScans(string deviceId, int scans)
    {
        var (eventId, _) = await EventWithTicketsAsync();
        var door = await factory.CreateClientAsAsync(Roles.DoorStaff);

        var response = await door.PostAsJsonAsync($"/api/events/{eventId}/checkins",
            new CheckInRequest(deviceId, null, [.. Enumerable.Range(0, scans).Select(_ => Scan("x"))]), Json);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task AnUnknownEventIsNotFound()
    {
        var door = await factory.CreateClientAsAsync(Roles.DoorStaff);

        var response = await door.PostAsJsonAsync("/api/events/999999/checkins", new CheckInRequest("device-1", null, [Scan("x")]), Json);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task TheSummaryCountsWhatHappenedAtTheDoor()
    {
        var (eventId, tickets) = await EventWithTicketsAsync(count: 3);
        var door = await factory.CreateClientAsAsync(Roles.DoorStaff);

        await SendAsync(door, eventId, "North door", Scan(tickets[0].Code), Scan(tickets[1].Code), Scan(tickets[0].Code), Scan("junk"));

        var summary = await SummaryAsync(eventId);
        Assert.Equal((3, 2, 1, 1, 0), (summary.Issued, summary.Admitted, summary.Duplicates, summary.Invalid, summary.WrongEvent));
    }

    private static ScanRequest Scan(string code, DateTimeOffset? scannedAt = null) =>
        new(Guid.NewGuid(), code, scannedAt ?? DateTimeOffset.UtcNow);

    private async Task<(int EventId, TicketResponse[] Tickets)> EventWithTicketsAsync(int count = 1)
    {
        var (eventId, typeId) = await factory.PublishEventAsync(capacity: 100);
        var (attendee, _) = await factory.SignUpAttendeeAsync();
        var response = await attendee.PostAsJsonAsync($"/api/events/{eventId}/tickets", new ClaimTicketsRequest(typeId, count), Json);
        response.EnsureSuccessStatusCode();
        return (eventId, (await response.Content.ReadFromJsonAsync<TicketResponse[]>(Json))!);
    }

    private static async Task<ScanResult[]> SendAsync(HttpClient door, int eventId, string doorName, params ScanRequest[] scans)
    {
        var response = await door.PostAsJsonAsync(
            $"/api/events/{eventId}/checkins", new CheckInRequest($"device-{doorName}", doorName, scans), Json);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<CheckInResponse>(Json))!.Results;
    }

    private async Task<CheckInSummary> SummaryAsync(int eventId)
    {
        var organizer = await factory.CreateClientAsAsync(Roles.Organizer);
        return (await organizer.GetFromJsonAsync<CheckInSummary>($"/api/events/{eventId}/checkins/summary", Json))!;
    }
}
