# 7. Signed ticket codes, and claiming without overselling

- **Status:** Accepted
- **Date:** 2026-10-06

## Context

Doorlist's tickets (ADR 6) have two properties that matter more than any other.

1. **Capacity is a promise.** Popular events get claimed by many people at once. Reading "8 left" and then writing "7 left" from two requests at the same moment issues tickets that don't exist. An attendee is also limited to 4 tickets per event, and that limit has the same race.
2. **A ticket must be checkable at a door with no connection.** Venue networks fail exactly when a queue forms. A door device has to tell a real ticket from a made-up or edited one without asking the server, and must not be able to make tickets itself.

## Decision

### Claiming

One database transaction per claim:

1. **Per-attendee lock.** `sp_getapplock` on `claim:<event>:<attendee>` serialises one attendee's concurrent claims for one event, so "at most 4 each" holds. Different attendees don't wait for each other.
2. **Atomic reservation.** A single conditional update, `UPDATE TicketTypes SET Remaining = Remaining - @n WHERE Id = @id AND Remaining >= @n`, either takes the tickets or touches nothing. Zero rows changed means sold out. There's no read-then-write window.
3. **Issue the tickets** in the same transaction, then commit.
4. **A check constraint**, `0 <= Remaining <= Capacity`, is the last line of defence if the code above is ever wrong.

### Ticket codes

Each ticket's QR code is `DL1.<payload>.<signature>`:

- **Payload:** the ticket id (16 bytes) and event id (4 bytes), big-endian.
- **Signature:** ECDSA P-256 with SHA-256 over the ASCII of `DL1.` plus the payload, in IEEE P1363 form.
- **Encoding:** every part is base64url. A code is about 120 characters, a small QR.
- **Keys:** the private key (`Tickets:SigningKey`) exists only on the API. The public key is served at `GET /api/tickets/signing-key`, with a short key id, and door devices cache it.
- **Offline checks:** a door device can prove a code was issued by Doorlist for this event without a connection. Whether that ticket has already been scanned is decided when scans sync; the first scan wins (step 3 of ADR 6's plan).
- **Storage:** codes are stored with their tickets, because each ECDSA signature is randomised and a ticket's QR should never change.
- **Startup:** the API refuses to start without a valid P-256 key.

## Consequences

- Tests prove both properties against a real SQL Server:
  - 30 attendees claiming at once from 10 tickets get exactly 10.
  - One attendee firing 8 parallel claims gets exactly 4.
  - Edited, foreign-key and malformed codes are rejected.
- **The signing key can't be rotated casually.** Rotating it invalidates every issued ticket's signature for devices that only know the new key. Rotation would mean a new code version (`DL2`) or devices that accept several key ids; that's future work, recorded here.
- **A stolen code works until it's scanned once.** Signatures stop forgery, not copying. The first-scan-wins rule limits a copied ticket to one entry.
- The per-attendee lock is per event and per attendee, so it costs nothing across attendees. The reservation update is one indexed row update.
