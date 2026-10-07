# Contributing

## Workflow

- `main` is protected. Every change goes through a pull request with passing CI and a review.
- Branch names: `feat/…`, `fix/…`, `chore/…`, `docs/…`.
- Commit messages use [Conventional Commits](https://www.conventionalcommits.org/): `feat(api): add release checklist endpoint`.
- Keep pull requests small enough to review in one sitting. Fill in the PR template.
- Work is planned in GitHub milestones. Each issue carries an estimate, and the actual time is noted when it closes.

## Running locally

Prerequisites: .NET 10 SDK, Node 24, and Docker with Compose.

```sh
docker compose up --build      # SQL Server, migrations, demo users, API, web
open http://localhost:8080      # web; the API is also on http://localhost:5080
```

Sign in as `organizer@example.com`, `door@example.com` or `attendee@example.com`, password `Doorlist-demo-2026`. The [README](README.md#run-it) says what each one can do.

To run the API from your IDE instead, start the database and the one-shot steps, then `dotnet run`:

```sh
docker compose up -d db migrate seed
cd api && dotnet run --project src/Doorlist.Api
```

The Development settings hold a local JWT signing key and demo password; other environments must set `Auth__Jwt__SigningKey` and `Demo__Password` as secrets.

### The mobile app

The Expo app in `mobile/` runs as a development build ([ADR 9](docs/adr/0009-mobile-app-navigation-storage-and-offline-signatures.md)). You need Xcode for the iOS Simulator, or Android Studio for the emulator.

```sh
docker compose up --build      # the API the app talks to
cd mobile
npm install
npm run ios                    # or: npm run android
```

A development build finds the API by itself: port 5080 on the computer that runs Metro. That works from the simulator, the emulator, and a phone on the same network. To use another API, set `EXPO_PUBLIC_API_URL`, for example in `mobile/.env.local`. Preview and production builds take the address from their profile in `mobile/eas.json`, and never guess.

To retake the app screenshots in `docs/screenshots`, boot an iPhone 17 Pro simulator, install [Maestro](https://maestro.dev), and run `scripts/app-screenshots.sh`. It builds the production variant in a copy of `mobile/` and runs it against a throwaway stack on port 5090, so your development build is left alone. It takes about 15 minutes. With `--no-build`, it reuses the app the last run installed.

### Apple Silicon

The SQL Server image is linux/amd64 only. With Colima, start the VM with Rosetta:

```sh
colima start --vm-type vz --vz-rosetta --cpu 4 --memory 6
```

Testcontainers also needs to find Colima's Docker socket:

```sh
export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"
export TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock
```

## Code standards

- **.NET:** warnings fail the build, the recommended analyzers run on every build, and code style is enforced from `.editorconfig`.
- **Angular:** ESLint must pass (`npm run lint`).
- **Mobile:** Prettier, ESLint and the type check must pass (`npm run format:check`, `npm run lint`, `npm run typecheck`), and so must `npx expo-doctor`.
- **Tests:** API behaviour is covered by integration tests against a real SQL Server (Testcontainers), not an in-memory fake.

## Database migrations

- Every schema change is an EF Core migration, committed with the code that needs it:
  ```sh
  cd api && dotnet ef migrations add <Name> --project src/Doorlist.Api --output-dir Data/Migrations
  ```
- Read the SQL before you merge. CI attaches the idempotent script as the `migrations-sql` artifact, or run `dotnet ef migrations script --idempotent --project src/Doorlist.Api` locally.
- Never edit or delete a migration that is on `main`. Fix forward with a new one.
- Breaking changes (rename, split, type change, drop) use expand/contract, so the API that is running during a deploy never meets a schema it can't read. See [docs/migrations.md](docs/migrations.md).
- CI checks this on every pull request: it starts the API from `main`, runs the PR's migrations underneath it, and checks the API still reads and writes. Run it locally with `scripts/check-schema-compat.sh main`.
- The API never migrates the database on startup ([ADR 3](docs/adr/0003-run-migrations-as-a-separate-step.md)).

## Deploys

Merging to `main` deploys to staging, then to production once a reviewer approves. Before changing anything in `deploy/` or the deploy workflows, rehearse the whole deploy locally, including its failure paths:

```sh
scripts/rehearse-deploy.sh
```

See [deploy/README.md](deploy/README.md) for how it works, first-time setup and operating the server.

## Architecture decisions

Significant decisions are recorded in [`docs/adr/`](docs/adr/) ([ADR 1](docs/adr/0001-record-architecture-decisions.md)). If your PR makes one, add an ADR to it.
