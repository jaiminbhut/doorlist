#:project ../api/src/Doorlist.Api/Doorlist.Api.csproj
#:property PublishAot=false

// Writes test-vectors/ticket-codes.json: ticket codes made by the API's own
// TicketSigner (ADR 7), which the API, web and mobile tests all check, so the
// three implementations of the code format can't drift apart (ADR 9).
//
// Run it from the repository root, only when the format changes:
//   dotnet run scripts/make-ticket-code-vectors.cs
//
// The private key in the file exists for these vectors and nothing else.

using System.Buffers.Text;
using System.Numerics;
using System.Text.Encodings.Web;
using System.Text.Json;
using Doorlist.Api.Tickets;
using Microsoft.Extensions.Options;

// The order of the P-256 group. ECDSA on P-256 accepts s and n - s alike;
// Bitcoin-style libraries reject the upper half ("high s") unless told not to.
var n = BigInteger.Parse("0FFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551", System.Globalization.NumberStyles.HexNumber);

var privateKey = TicketSigner.GenerateKey();
using var signer = new TicketSigner(Options.Create(new TicketOptions { SigningKey = privateKey }));
using var stranger = new TicketSigner(Options.Create(new TicketOptions { SigningKey = TicketSigner.GenerateKey() }));

var ticket = Guid.Parse("0199b3c4-5d6e-7f80-9123-456789abcdef");
var otherTicket = Guid.Parse("0199b3c4-5d6e-7f80-9123-456789abcd00");
const int Event = 12;
const int OtherEvent = 99;

// Signatures are random: sign until s is in the lower half, then mirror it.
var lowS = signer.Sign(ticket, Event);
while (IsHighS(lowS))
{
    lowS = signer.Sign(ticket, Event);
}
var highS = WithS(lowS, s => n - s);
var otherEvent = signer.Sign(otherTicket, OtherEvent);

var parts = lowS.Split('.');
var signature = Base64Url.DecodeFromChars(parts[2]);
var editedSignature = (byte[])signature.Clone();
editedSignature[10] ^= 0x01;

var vectors = new
{
    about = "Ticket codes made by the API's TicketSigner (ADR 7) and checked by the API, web and mobile tests (ADR 9). "
        + "Made by scripts/make-ticket-code-vectors.cs. The private key exists for these vectors only.",
    privateKey,
    publicKey = signer.PublicKey,
    keyId = signer.KeyId,
    valid = new[]
    {
        new { name = "signature with a low s", code = lowS, ticketId = ticket, eventId = Event },
        new { name = "the same ticket, signature with a high s", code = highS, ticketId = ticket, eventId = Event },
        new { name = "a ticket for another event", code = otherEvent, ticketId = otherTicket, eventId = OtherEvent },
    },
    invalid = new[]
    {
        new { name = "another ticket under this signature", code = $"DL1.{otherEvent.Split('.')[1]}.{parts[2]}" },
        new { name = "one bit of the signature changed", code = $"DL1.{parts[1]}.{Base64Url.EncodeToString(editedSignature)}" },
        new { name = "signed with another key", code = stranger.Sign(ticket, Event) },
        new { name = "unknown version", code = $"DL2.{parts[1]}.{parts[2]}" },
        new { name = "signature one byte short", code = $"DL1.{parts[1]}.{Base64Url.EncodeToString(signature.AsSpan(0, 63))}" },
        new { name = "standard base64, not base64url", code = $"DL1.{parts[1]}.{Convert.ToBase64String(signature)}" },
        new { name = "an extra part", code = $"{lowS}.x" },
        new { name = "empty", code = "" },
    },
};

var path = Path.Combine("test-vectors", "ticket-codes.json");
File.WriteAllText(path, JsonSerializer.Serialize(vectors, new JsonSerializerOptions
{
    WriteIndented = true,
    // Codes and keys keep their + and / as they are, instead of \u002B.
    Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
}) + "\n");
Console.WriteLine($"Wrote {path}");

bool IsHighS(string code) => S(code) > n / 2;

BigInteger S(string code) =>
    new(Base64Url.DecodeFromChars(code.Split('.')[2]).AsSpan(32), isUnsigned: true, isBigEndian: true);

string WithS(string code, Func<BigInteger, BigInteger> change)
{
    var codeParts = code.Split('.');
    var bytes = Base64Url.DecodeFromChars(codeParts[2]);
    var s = change(S(code)).ToByteArray(isUnsigned: true, isBigEndian: true);
    var newSignature = new byte[64];
    bytes.AsSpan(0, 32).CopyTo(newSignature);
    s.CopyTo(newSignature.AsSpan(64 - s.Length));
    return $"{codeParts[0]}.{codeParts[1]}.{Base64Url.EncodeToString(newSignature)}";
}
