# 6. From release tracking to event ticketing (Shiplog becomes Doorlist)

- **Status:** Accepted
- **Date:** 2026-10-06

## Context

The project started as Shiplog, a release tracker: apps, environments, and a checklist that must be complete before a release ships, built to catch a staging build going to production.

For the teams it was aimed at, that job is already done well by the tools they ship with. Expo's EAS Environments keep each build's variables per environment, and EAS Workflows run the build, submit and update pipeline. A separate tracker would duplicate them. A product whose reason to exist is weak is also a weak reference project: "why not use EAS?" has no good answer.

The engineering underneath has no such problem:

- an Angular app with role-based screens
- an ASP.NET Core API with Identity and JWTs
- SQL Server with EF Core migrations, run as their own step
- a CI check that the running API survives every migration (docs/migrations.md)
- a rehearsed deploy pipeline (ADR 5)
- these decision records

None of that depends on the release-tracking domain.

## Decision

- **Keep the repository, its history and its platform. Replace the product** with Doorlist: free event tickets with door check-in.
  - Organizers create events with ticket types and capacities.
  - Attendees sign up and claim tickets. Each ticket is a QR code signed by the server, so it can be verified without a connection.
  - Door staff scan tickets, offline if need be. Scans sync later; the first scan of a ticket wins, and later ones are flagged.
- **Rename everything from Shiplog to Doorlist first**, as its own change with no change in behaviour.
- **Retire the release tracker the same way any breaking schema change is shipped**, in steps that each pass the compatibility check:
  1. Add the events domain alongside the release tracker.
  2. Remove the release tracker's code, keeping its tables.
  3. Drop its tables.
- **Attendees can sign up for themselves.** This supersedes ADR 4's "no public sign-up" for the attendee role only. Organizers and door staff are still created by an operator, never by sign-up.

ADRs 1–5 are left as written, as ADR 1 requires. Where they say "Shiplog", or name `Shiplog.Api` paths, they mean what is now Doorlist and `Doorlist.Api`.

## Consequences

- The hard problems move to ones a ticketing product really has:
  - never issuing more tickets than capacity when many people claim at once
  - ticket codes that can't be forged and can be checked offline
  - reconciling check-ins from devices that were offline
- Public sign-up brings abuse risks the release tracker didn't have. Sign-up and sign-in need rate limits.
- The version-split walkthrough in docs/migrations.md stays as history, although the `Releases` table it changed is retired.
- The React Native app follows naturally: an attendee's tickets, and a door scanner that works offline.
