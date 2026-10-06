using System.Buffers.Text;
using System.Numerics;
using System.Text.Json;
using Doorlist.Api.Tickets;
using Microsoft.Extensions.Options;

namespace Doorlist.Api.Tests;

/// <summary>
/// The shared ticket-code test vectors (test-vectors/ticket-codes.json, ADR 9),
/// checked with the server's own TicketSigner. The web and mobile tests check
/// the same file with WebCrypto and with noble, so the three can't disagree.
/// </summary>
public sealed class TicketCodeVectorTests : IDisposable
{
    private static readonly Vectors Shared = Load();

    private readonly TicketSigner _signer =
        new(Options.Create(new TicketOptions { SigningKey = Shared.PrivateKey }));

    public static TheoryData<string> ValidNames => [.. Shared.Valid.Select(code => code.Name)];

    public static TheoryData<string> InvalidNames => [.. Shared.Invalid.Select(code => code.Name)];

    [Fact]
    public void TheVectorsCarryThePublicKeyTheyWereSignedWith()
    {
        Assert.Equal(_signer.PublicKey, Shared.PublicKey);
        Assert.Equal(_signer.KeyId, Shared.KeyId);
    }

    /// <summary>
    /// Libraries from the Bitcoin world reject a high s by default. About half of
    /// the API's signatures have one, so the vectors must keep including one.
    /// </summary>
    [Fact]
    public void OneValidCodeHasASignatureWithAHighS()
    {
        var n = BigInteger.Parse(
            "0FFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551",
            System.Globalization.NumberStyles.HexNumber,
            System.Globalization.CultureInfo.InvariantCulture);

        Assert.Contains(Shared.Valid, code =>
            new BigInteger(Base64Url.DecodeFromChars(code.Code.Split('.')[2]).AsSpan(32), isUnsigned: true, isBigEndian: true) > n / 2);
    }

    [Theory]
    [MemberData(nameof(ValidNames))]
    public void AValidCodeVerifiesWithItsTicketAndEvent(string name)
    {
        var code = Shared.Valid.Single(vector => vector.Name == name);

        Assert.True(_signer.TryVerify(code.Code, out var ticketId, out var eventId));
        Assert.Equal((code.TicketId, code.EventId), (ticketId, eventId));
    }

    [Theory]
    [MemberData(nameof(InvalidNames))]
    public void AnInvalidCodeIsRejected(string name)
    {
        var code = Shared.Invalid.Single(vector => vector.Name == name);

        Assert.False(_signer.TryVerify(code.Code, out _, out _));
    }

    public void Dispose() => _signer.Dispose();

    private static Vectors Load()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
        {
            var path = Path.Combine(directory.FullName, "test-vectors", "ticket-codes.json");
            if (File.Exists(path))
            {
                return JsonSerializer.Deserialize<Vectors>(File.ReadAllText(path), JsonSerializerOptions.Web)
                    ?? throw new InvalidOperationException($"{path} is empty.");
            }
        }

        throw new FileNotFoundException($"No test-vectors/ticket-codes.json above {AppContext.BaseDirectory}.");
    }

    private sealed record Vectors(string PrivateKey, string PublicKey, string KeyId, ValidCode[] Valid, InvalidCode[] Invalid);

    private sealed record ValidCode(string Name, string Code, Guid TicketId, int EventId);

    private sealed record InvalidCode(string Name, string Code);
}
