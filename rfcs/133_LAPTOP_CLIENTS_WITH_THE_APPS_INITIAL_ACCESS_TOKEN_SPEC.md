# 133 Laptop clients with the app's initial access token

## Document Control

- Status: Proposal
- Owner: Nicu Chiciuc
- Created: 2026-11-05
- Base: `origin/main` at v2265 (RFC 129, 130, and 131 shipped; PR 1896, the one admin table, open).
- Decided on 2026-11-05: option (b) of `reports/hub-explained-2026-11-05.md` section 7. Options (a)
  a samebase.com approval, (c) a GitHub login on the laptop, and (d) no proof were set aside there.

## Summary

A stranger's app gets its hub client in GitHub Actions with GitHub's OIDC token
(`POST /hub-clients`, RFC 130). On a laptop there is no such token, so `pnpm run dev` has no proof,
and the app has guest sign-in only. The team's own apps do get a laptop client, because the team's
Convex login is their proof.

After this RFC, the production registration of an app also answers an **initial access token** for
the app (RFC 7591 section 1.2 and 3). The stack saves it in its Alchemy state, next to the client
secret. On a laptop, `pnpm run dev` reads the token from the state of stage `prod`, which the person
can do because they have the Convex login of the app's team, and asks `POST /hub-clients` with it.
The hub answers a `development` client on the laptop's return address. No Samebase account, no page,
no new key anywhere, and the same rule as in CI: you hold what only this repository's run was given.

What this means for a real person:

- Someone creates a repository from `samebase/base`, pushes once, and the production deploy has Sign
  in with Google. They clone it, run `npx convex login` and `pnpm run dev`, and the laptop has Sign
  in with Google too. Google sees only the hub, never the laptop.
- Before that first push to main there is no token, so a laptop has guest sign-in only.
- Nicu's admin page shows the laptop client in the one table, with "laptop" and the repository in
  place of a GitHub run.

## Facts

Verified in the code on 2026-11-05.

1. `POST /hub-clients` takes GitHub's OIDC token as the Bearer, derives the stage `prod` or `pr-<n>`
   from its claims, checks blocks and limits, fetches `/samebase-verification.json` at the origin of
   the return address, and creates the client and its `registrations` row in one transaction
   (`apps/identity-hub/convex/hubClients.ts:479`). It refuses a return address on an IP address or
   `localhost` (`hubClients.ts:179`): a file cannot prove a laptop.
2. The broker's `registration.register` takes `deploymentType: production | preview` only
   (`packages/identity-broker/src/component/registration.ts:20`), gives a preview a `removeAt` 14
   days ahead (`registration.ts:154`), and evicts a preview before a production client at the cap
   (`registration.ts:38`). `clients.create`, the team path, already takes `development`.
3. The broker's redirect URI rule accepts https, or http on `localhost`, `127.0.0.1`, or `[::1]`
   (`packages/identity-broker/src/client/protocol.ts:36`). Google never sees an app's return
   address: its callback is the hub's own (`apps/identity-hub/convex/connectors.ts:27`).
4. The broker has an RFC 7591 endpoint `POST /register` behind one global initial access token, not
   served since RFC 130 (`packages/identity-broker/src/client/registration.ts:12`,
   `registration.ts:310`). This RFC does not switch it on: `/hub-clients` stays the one create step.
5. `Convex.SharedHubClient` saves the client, its secret, and its RFC 7592 registration access token
   in Alchemy state (`packages/alchemy-convex/src/SharedHubClient.ts:45`). A later deploy renews
   with `GET /register/<client>` and that token (`SharedHubClient.ts:252`). On a laptop it logs that
   the run has no GitHub token and gives the off values (`SharedHubClient.ts:231`).
6. Alchemy state is in the `alchemy-state-store` project of the app's Convex team, and a run with
   the team's credential or the Convex CLI login reads any stage's rows, secrets included
   (`packages/alchemy-convex/src/State.ts:4`, `src/StackComment.ts:9`). A preview stage already
   reads the project from the state of `prod` (`base/alchemy.run.ts:80` in the starter).
7. A `Convex.Deployment` row sets the variables in its `env` and removes only a name that leaves its
   own `env` (`packages/alchemy-convex/src/Deployment.ts:19`). The starter's "Deployment" row pushes
   with `source`, "Site" writes the three `HUB_` variables with no source (`base/alchemy.run.ts:86`
   and `:107`).
8. The starter's `pnpm run dev` in the main checkout runs `convex dev` against the cloud development
   deployment, whose site URL is `https://<name>.convex.site`
   (`base/scripts/run-primary-dev.ts:16`). In a linked worktree it runs an anonymous local backend
   on `http://127.0.0.1:<port>` (`base/scripts/run-worktree-dev.ts:6`). So a laptop's return address
   is https on a cloud host or http on loopback.
9. The starter's build writes `samebase-verification.json` into `dist/client` from
   `GITHUB_REPOSITORY_ID` (`base/scripts/write-samebase-verification.ts:18`); a laptop has that
   variable set nowhere, so the development deployment serves no file.
10. `alchemy-convex hub-client` registers a development client of a team app with the Convex login:
    it renews the client that the three variables name, or registers a new one on the dev
    deployment's `CONVEX_SITE_URL` and writes the variables in one `env set --force`
    (`packages/alchemy-convex/src/HubClient.ts:272`).
11. The hub's `registrations` row holds `githubActorId`, `githubActorLogin`, `commitSha`, and
    `stage` of the run that asked (`apps/identity-hub/convex/schema.ts:16`). There are 11 rows.
12. Nobody outside Samebase has registered an app: every public app on the hub is from one of Nicu's
    repositories (`reports/hub-explained-2026-11-05.md` section 6).

## Target

### The token

- `POST /hub-clients` with GitHub's token for stage `prod` also answers `initial_access_token`, a
  32-byte random token, and `repository`, the numeric repository id from the claims. A preview
  registration answers neither.
- The hub keeps one row per repository and app name in a new table `initialAccessTokens`: the
  SHA-256 of the token, `githubRepositoryDatabaseId`, `githubOwnerId`, `app`, `issuedAt`, and the
  production client id that the same request created. A production registration replaces the row, so
  the previous token stops. It is written in the same transaction as the client.
- The token has no expiry of its own. It stops when it is replaced, when its repository or owner is
  blocked, or when an admin deletes its row in the dashboard.
- `Convex.SharedHubClient` saves `initialAccessToken` (redacted) and `repository` in its attributes,
  empty for a preview and for the off values.

### The laptop request

`POST /hub-clients` with the initial access token as the Bearer. The hub tells the two proofs apart
by shape: GitHub's token is a JWT of three parts, the initial access token is not.

1. `THIRD_PARTY_PAUSED` refuses it, as today.
2. The token's hash names the row, or 401 `invalid_token`. The row's repository and owner go through
   the blocks and the hourly windows of the repository and the owner (`admitRequest`), not the
   new-owners window: an owner with a token has a registration.
3. The body is `{ app, redirectUri, softwareVersion }` as today. `app` must equal the row's `app`,
   else 403 `not_allowed` with reason `app_mismatch`.
4. The return address is https on a DNS name with the verification file, exactly as today, or http
   on a loopback host as the broker's rule names them (`localhost`, `127.0.0.1`, `[::1]`), any port,
   any path, with no file: the token is the proof, and a loopback address cannot be reached by the
   hub nor by anyone else.
5. The client is created with `deploymentType: development`, in the app's preview namespace
   `gh-<repository id>-<hash>-preview`, with `clientName: development`, `removeAt` 14 days ahead,
   and a registration access token (RFC 7592) for its renewals. The `registrations` row records the
   proof. The answer has the shape of today's 201, with no initial access token.

The broker's `registration.register` takes `development`, gives it `removeAt` like a preview, and
evicts it like a preview. Nothing else in the broker changes.

### The registrations row

`registrations` gets `proof`, a union:
`{ kind: "github", githubActorId, githubActorLogin, commitSha }` or
`{ kind: "initial_access_token", issuedAt }`. The three GitHub fields move into it; `stage` stays at
the top, `development` for a laptop. The 11 rows move in two steps, the Convex way: the first pull
request adds `proof` as optional with a one-off internal mutation that fills `github` from the three
fields, run once after the deploy; the second pull request makes `proof` required and removes the
three fields and the one-off.

The admin page's "Registered by" gets a fourth value next to the GitHub run, "Team login", and "No
record": the repository with its id, "laptop", and when the token was issued.

### The command

`alchemy-convex hub-client --shared --team <team> --stack <owner/name> --app <app> --callback-path /auth/hub/callback`,
run by the starter's `pnpm run dev` in both checkouts after `ensureHubVariables`:

1. Reads the dev deployment's variables. With `HUB_CLIENT_ID`, `HUB_CLIENT_SECRET`, and
   `HUB_REGISTRATION_TOKEN` present and not the off values, it reads the client on the hub with
   `GET /register/<client>` and that token: 200 renews it and the command ends; 401 means it is
   gone; 403 means it is suspended, so the values stay and the command warns.
2. Reads the `HubClient` row of stage `prod` of stack `<owner/name>` from the team's state store. No
   row, or no token in it: one line, "deploy to main once for Google sign-in on this laptop", and
   the off values stay.
3. Reads the dev deployment's `CONVEX_SITE_URL`, as the team command does.
4. For an https site URL, sets `SAMEBASE_REPOSITORY_ID` on the dev deployment to the row's
   `repository`, so the site serves the verification file (next section).
5. Posts to `/hub-clients` with the token, and writes `HUB_ISSUER`, `HUB_CLIENT_ID`,
   `HUB_CLIENT_SECRET`, and `HUB_REGISTRATION_TOKEN` in one `env set --force`. A refusal prints the
   hub's reason and keeps the off values, so `pnpm run dev` never stops for the hub.

`--team` comes from `CONVEX_TEAM_ID`, as the stack already requires. `--stack` is the repository
`owner/name`, which the starter already derives from the origin remote.

### The starter

- `convex/http.ts` serves `GET /samebase-verification.json` as
  `{ "repository": <SAMEBASE_REPOSITORY_ID> }` and 404 while the variable is unset. The "Deployment"
  row sets `SAMEBASE_REPOSITORY_ID` from `GITHUB_REPOSITORY_ID` in its `env`, and the laptop command
  sets it on the dev deployment. The script `write-samebase-verification.ts` and its test go: one
  mechanism for production, previews, and laptops. convex-hosting serves an uploaded file before a
  route, so an older build with the static file still works during the change.
- `convex/convex.config.ts` declares `HUB_REGISTRATION_TOKEN` and `SAMEBASE_REPOSITORY_ID` as
  optional. Nothing in the app reads the first; it belongs to the client on that deployment, like
  the other three.
- `scripts/run-primary-dev.ts` and `scripts/run-worktree-dev.ts` run the command after
  `ensureHubVariables`, and go on when it fails, as they do for the variables.
- README, Google sign-in: three sentences on the laptop.

### What does not change

- The team's apps and `Convex.HubClient`: the Convex login stays their proof, on laptops too.
- Production and preview clients of strangers' apps: the GitHub token and the file, as today.
- App ids, salts, connectors, the issuer. A laptop's users are the preview namespace's users.
- Expiry: a development client lives 14 days after its last dev start or sign-in (RFC 131).
- Blocks and the pause stop a laptop client where they stop a preview: at registration, renewal,
  sign-in start, and code exchange, through the tenant and owner switches.
- The broker's `/register` stays off. The admin page's key still cannot create anything.

## What a leaked token can do

The token reaches one place, the Alchemy state of the app's `prod` stage, where the client secret
already is. Whoever reads it can register development clients of that app, on loopback addresses or
on https hosts that serve the repository's id, inside the repository's 30 requests an hour and the
owner's 100. That is what the repository's own CI run can do today with GitHub's proof. It cannot
reach another app, a team app, a team connector, or a provider login. A block on the repository or
the owner stops it at once, and a production redeploy after deleting the production client replaces
it.

## Order of work

1. **PR 1, hub, broker, package.** Broker: `development` in `registration.register`, version bump.
   Hub: `initialAccessTokens`, the token in the production answer, the token proof in
   `/hub-clients`, `proof` optional on `registrations` with the one-off, the admin page's fourth
   value. Package: `Convex.SharedHubClient` saves the token and the repository id;
   `alchemy-convex hub-client --shared`; release. After the deploy, run the one-off.
2. **PR 2, starter** (`samebase/base`): the route, the two variables, the dev scripts, the README,
   the package pin, the manifest.
3. **PR 3, hub.** `proof` required, the three fields and the one-off removed.
4. Existing public apps: a token comes with the next production registration, and a renewal is not
   one. The five production clients of Nicu's test repositories can be deleted by hand and
   redeployed; users keep their ids, which do not depend on the client.

## Validation

- Hub tests: a production registration answers a token and writes its row, a preview answers none; a
  second production registration replaces the row and the first token answers 401; the token
  registers a development client on `http://127.0.0.1:3211/auth/hub/callback` with no fetch, and on
  an https host only with the file; `app_mismatch`; a blocked repository, a blocked owner, and the
  pause refuse it; it counts in the repository and owner windows; the `registrations` row has
  `proof.kind: initial_access_token` and `stage: development`; no answer and no log line holds the
  token.
- Broker tests: `development` gets `removeAt` and is evicted before production; cleanup deletes it
  after its date.
- alchemy-convex tests: the resource saves the token and the repository id from a recorded answer;
  the command renews with the saved values, registers with the state's token when they are gone,
  prints the one line without a token, and keeps the off values on a refusal; the stack test keeps
  the order push, client, variables.
- Starter: the route answers the id and 404 without it.
- Live, on a fork of `samebase/base` under a second GitHub account with no Samebase account: push to
  main; clone; `npx convex login`; `pnpm run dev`; Sign in with Google works on the laptop; the
  admin page shows the laptop row; after a block on the owner, the next `pnpm run dev` prints the
  hub's reason and the laptop has guest sign-in only.

## Decisions

Taken on 2026-11-05:

1. The laptop's proof is the app's own initial access token (RFC 7591), issued only with a
   production registration and saved in the stack's state. No Samebase account, no GitHub login on
   the laptop, no open endpoint.
2. One create step: `/hub-clients` takes both proofs. The broker's `/register` stays off.
3. A loopback return address needs no file; an https one keeps the file. The starter serves the file
   from a variable through one route, in every stage.
4. The token is replaced by each production registration and has no expiry of its own.
5. The laptop's registration access token lives on the dev deployment as `HUB_REGISTRATION_TOKEN`,
   next to the three variables of its client.
6. `registrations` gets a `proof` union, moved in two pull requests. No invented actor or commit on
   a laptop row.
7. The laptop's client is in the app's preview namespace, as a development client with the 14-day
   lease.

## Not in this RFC

- The team's own apps on this path, and the bindings that would keep their app ids and salt mode.
- A list of sign-in methods per app, and a public GitHub OAuth App.
- A token with the GitHub proof for an existing production client without a registration.
- The page before Google that names the repository and the return site.
