# 4. Authentication with ASP.NET Core Identity and short-lived JWTs

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

Shiplog needs signed-in users with three levels of access: viewers who read, developers who work on releases, and leads who also manage apps and environments and are the only ones who can ship to production. There is no public sign-up. The first client is the Angular app, served from the same origin as the API. Later clients (a CLI, a CI step that records a release, a mobile app) should be able to use the same API.

## Decision

- **Users, passwords and roles:** ASP.NET Core Identity, stored in SQL Server through EF Core. It handles password hashing, lockout after repeated failures, and role membership. Passwords must be at least 12 characters.
- **Tokens:** `POST /api/auth/login` checks the password (counting failures toward lockout) and returns a signed JWT (HMAC-SHA256) that lasts 60 minutes. It carries `sub`, `email`, `name` and `role` claims. The API validates issuer, audience, lifetime and signature, with one minute of clock skew. The signing key is a per-environment secret.
- **Authorization:** a fallback policy requires a signed-in user on every endpoint. Only `/api/health` and the login are anonymous. Two policies map roles to actions: `ManageApps` (Lead) and `WorkOnReleases` (Lead, Developer). Shipping to a production environment additionally checks for Lead inside the handler, because it depends on the release's environment.
- **Login errors:** every failure gets the same 401 message, so the response doesn't reveal which emails exist.
- **Accounts:** no registration endpoint. Demo users are created by `dotnet Shiplog.Api.dll seed-demo-users`, run as a step after migrations (as in ADR 3), never on API startup.
- **In the browser:** the Angular app keeps the token in `sessionStorage`, which is scoped to the tab and cleared when it closes. It sends the token as a bearer header and signs out on any 401.

## Consequences

- One token format works for the web app now and for non-browser clients later.
- A token in `sessionStorage` can be read by any script running on the page, so an XSS bug would expose it. This is mitigated by the short lifetime, no third-party scripts, and Angular's template escaping. A strict Content-Security-Policy is planned for the deploy milestone.
- There are no refresh tokens yet, so users sign in again after 60 minutes. Revoking a token before it expires isn't possible. Rotating the signing key invalidates all of them.
- If either of these becomes a problem, the next step is a refresh token in an `HttpOnly` cookie, or moving the web app to cookie authentication, recorded in a new ADR.
