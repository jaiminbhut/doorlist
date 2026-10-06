using Doorlist.Api.Tickets;
using Microsoft.Extensions.Options;

namespace Doorlist.Api.Tests;

public sealed class TicketSignerTests
{
    private static TicketSigner NewSigner() =>
        new(Options.Create(new TicketOptions { SigningKey = TicketSigner.GenerateKey() }));

    [Fact]
    public void ASignedCodeVerifiesAndCarriesTheTicketAndEvent()
    {
        using var signer = NewSigner();
        var ticketId = Guid.CreateVersion7();

        var code = signer.Sign(ticketId, 42);

        Assert.StartsWith("DL1.", code, StringComparison.Ordinal);
        Assert.True(code.Length <= Ticket.CodeMaxLength);
        Assert.True(signer.TryVerify(code, out var verifiedTicket, out var verifiedEvent));
        Assert.Equal((ticketId, 42), (verifiedTicket, verifiedEvent));
    }

    [Fact]
    public void ACodeFromAnotherKeyIsRejected()
    {
        using var ours = NewSigner();
        using var theirs = NewSigner();

        Assert.False(ours.TryVerify(theirs.Sign(Guid.NewGuid(), 1), out _, out _));
    }

    [Fact]
    public void ChangingAnyPartOfTheCodeBreaksIt()
    {
        using var signer = NewSigner();
        var code = signer.Sign(Guid.NewGuid(), 7);
        var parts = code.Split('.');
        var forgedPayload = signer.Sign(Guid.NewGuid(), 8).Split('.')[1];

        // Someone else's ticket id under this ticket's signature.
        Assert.False(signer.TryVerify($"{parts[0]}.{forgedPayload}.{parts[2]}", out _, out _));
        // A flipped character in the signature.
        var flipped = parts[2][0] == 'A' ? 'B' + parts[2][1..] : 'A' + parts[2][1..];
        Assert.False(signer.TryVerify($"{parts[0]}.{parts[1]}.{flipped}", out _, out _));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("not a ticket")]
    [InlineData("DL1.abc")]
    [InlineData("DL2.AAAAAAAAAAAAAAAAAAAAAAAAAAA.AAAA")]
    [InlineData("DL1.!!!.###")]
    public void GarbageIsRejected(string? code)
    {
        using var signer = NewSigner();

        Assert.False(signer.TryVerify(code, out _, out _));
    }

    [Theory]
    [InlineData(null, false)]
    [InlineData("", false)]
    [InlineData("bm90IGEga2V5", false)]
    public void OnlyARealP256KeyIsAccepted(string? key, bool valid) =>
        Assert.Equal(valid, TicketSigner.IsValidKey(key));

    [Fact]
    public void AGeneratedKeyIsAccepted() =>
        Assert.True(TicketSigner.IsValidKey(TicketSigner.GenerateKey()));
}
