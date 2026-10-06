# 8. Door check-in: offline first, the first recorded admission wins

- **Status:** Accepted
- **Date:** 2026-10-06

## Context

Door staff check tickets as people arrive, often at several doors at once, and often where the venue's network is unreliable. ADR 7 made every ticket's code checkable offline: a device with the public key can tell a real ticket from a forged or edited one. What a device can't know offline is whether another door has already let that ticket in.

Two things must hold anyway:

- A ticket admits one person. Online, the second scan of a ticket must be refused on the spot.
- Nothing a device does offline is lost. When it reconnects, every scan it made is recorded once, even if the upload is retried.

## Decision

- **Scans are sent in batches** to `POST /api/events/{id}/checkins`: one scan at a time when the device is online, everything it queued when it comes back. Each scan carries:
  - a **scan id** chosen by the device
  - the code
  - the device's own time of the scan
- **Every scan is recorded exactly once.** A unique index on the scan id makes a retried batch a no-op, and it gets back exactly the answers it got the first time.
- **The first admission recorded by the server wins**, enforced by the database. A filtered unique index allows only one `Admitted` row per ticket. Every later scan of that ticket is recorded as `AlreadyAdmitted`, with when and at which door the first admission happened. If ten devices sync the same ticket at once, exactly one admits it.
- **Other outcomes:** a valid ticket for another event is `WrongEvent`. A forged, edited or unknown code is `Invalid`. Every scan is kept, refused ones included, for the record.
- **The server's order decides, not the devices' clocks.** Device clocks can be wrong. More to the point, by the time an offline scan syncs, its person is already inside, so "winning" can't change who got in. It only changes which scan the record calls the duplicate.
- `GET /api/events/{id}/checkins/summary` reports issued, admitted, duplicate, invalid and wrong-event counts, and the latest duplicates with both doors and times.
- Door staff and organizers can check in; attendees can't.

## Consequences

- **Online, a copied ticket gets one person in.** Offline, it can get one person in per door that hasn't synced: each device stops repeats of a ticket it has seen itself, but not ones another door saw. The server then **flags** every such duplicate, with both doors and times. That's the honest limit of offline check-in, and the summary makes it visible instead of hiding it.
- Devices should sync as soon as they can, and keep scanning when they can't.
- A device must keep its queued scans until the server has answered them. The scan id makes resending safe.
- The web door page (next) and the mobile app (later) use the same API and the same rules.
