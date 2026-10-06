using System.Buffers.Binary;
using System.Buffers.Text;
using System.ComponentModel.DataAnnotations;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;

namespace Doorlist.Api.Tickets;

/// <summary>Bound from <c>Tickets</c>. The signing key is a secret, set per environment.</summary>
public sealed class TicketOptions
{
    public const string Section = "Tickets";

    /// <summary>An ECDSA P-256 private key: PKCS#8 (or SEC1), DER, base64.</summary>
    [Required]
    public string SigningKey { get; init; } = "";
}

/// <summary>
/// Signs and verifies ticket codes (ADR 7). A code is
/// <c>DL1.&lt;payload&gt;.&lt;signature&gt;</c>: the payload is the ticket id
/// (16 bytes, big-endian) and the event id (4 bytes, big-endian); the
/// signature is ECDSA P-256 with SHA-256 over the ASCII of "DL1." plus the
/// payload, in IEEE P1363 form. All parts are base64url. Anyone with the
/// public key, such as a door device with no connection, can check a code;
/// only the API can make one.
/// </summary>
public sealed class TicketSigner : IDisposable
{
    private const string Version = "DL1";
    private const int PayloadLength = 20;
    private const int SignatureLength = 64;
    private const string P256Oid = "1.2.840.10045.3.1.7";

    private readonly ECDsa _key;

    public TicketSigner(IOptions<TicketOptions> options)
    {
        _key = Load(options.Value.SigningKey)
            ?? throw new InvalidOperationException("Tickets:SigningKey must be a base64 PKCS#8 ECDSA P-256 private key.");
        var publicKey = _key.ExportSubjectPublicKeyInfo();
        PublicKey = Convert.ToBase64String(publicKey);
        KeyId = Base64Url.EncodeToString(SHA256.HashData(publicKey).AsSpan(0, 8));
    }

    /// <summary>The public key as base64 SubjectPublicKeyInfo (DER).</summary>
    public string PublicKey { get; }

    /// <summary>A short fingerprint of the public key, so devices can tell when it changes.</summary>
    public string KeyId { get; }

    public string Sign(Guid ticketId, int eventId)
    {
        Span<byte> payload = stackalloc byte[PayloadLength];
        ticketId.TryWriteBytes(payload[..16], bigEndian: true, out _);
        BinaryPrimitives.WriteInt32BigEndian(payload[16..], eventId);

        var signed = $"{Version}.{Base64Url.EncodeToString(payload)}";
        var signature = _key.SignData(
            Encoding.ASCII.GetBytes(signed), HashAlgorithmName.SHA256, DSASignatureFormat.IeeeP1363FixedFieldConcatenation);

        return $"{signed}.{Base64Url.EncodeToString(signature)}";
    }

    public bool TryVerify(string? code, out Guid ticketId, out int eventId)
    {
        ticketId = Guid.Empty;
        eventId = 0;

        var parts = code?.Split('.');
        if (parts is not [Version, var payloadText, var signatureText])
        {
            return false;
        }

        // Check the text first: TryDecodeFromChars returns false only for a too-small
        // buffer, and throws on characters that aren't base64url, which a damaged
        // or made-up QR code can easily contain.
        if (!Base64Url.IsValid(payloadText, out var payloadLength) || payloadLength != PayloadLength
            || !Base64Url.IsValid(signatureText, out var signatureLength) || signatureLength != SignatureLength)
        {
            return false;
        }

        var payload = Base64Url.DecodeFromChars(payloadText);
        var signature = Base64Url.DecodeFromChars(signatureText);

        var signed = Encoding.ASCII.GetBytes($"{Version}.{payloadText}");
        if (!_key.VerifyData(signed, signature, HashAlgorithmName.SHA256, DSASignatureFormat.IeeeP1363FixedFieldConcatenation))
        {
            return false;
        }

        ticketId = new Guid(payload.AsSpan(0, 16), bigEndian: true);
        eventId = BinaryPrimitives.ReadInt32BigEndian(payload.AsSpan(16));
        return true;
    }

    /// <summary>A new key in the form <see cref="TicketOptions.SigningKey"/> expects.</summary>
    public static string GenerateKey()
    {
        using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        return Convert.ToBase64String(key.ExportPkcs8PrivateKey());
    }

    public static bool IsValidKey(string? signingKey)
    {
        using var key = Load(signingKey);
        return key is not null;
    }

    public void Dispose() => _key.Dispose();

    private static ECDsa? Load(string? signingKey)
    {
        if (string.IsNullOrWhiteSpace(signingKey))
        {
            return null;
        }

        var key = ECDsa.Create();
        try
        {
            // PKCS#8 is the documented form; SEC1 ("EC PRIVATE KEY") is what some
            // OpenSSL commands write for EC keys, so it's accepted too.
            var der = Convert.FromBase64String(signingKey);
            try
            {
                key.ImportPkcs8PrivateKey(der, out _);
            }
            catch (CryptographicException)
            {
                key.ImportECPrivateKey(der, out _);
            }

            if (key.ExportParameters(includePrivateParameters: false).Curve.Oid.Value == P256Oid)
            {
                return key;
            }
        }
        catch (Exception exception) when (exception is FormatException or CryptographicException)
        {
            // Falls through: not a usable key.
        }

        key.Dispose();
        return null;
    }
}
