# 133 Laptop clients with the app's initial access token

## Document Control

- Status: Superseded by [RFC 137](../rfcs/137_ONE_HUB_MODEL_SPEC.md), which restates what stays.
  Historical: PR 1 shipped as v2267; the laptop side rewritten as a stage of the app's stack on
  2026-11-05
- Owner: Nicu Chiciuc
- Created: 2026-11-05
- Base: `origin/main` at v2265 (RFC 129, 130, and 131 shipped; PR 1896, the one admin table, open).
- Decided on 2026-11-05: option (b) of `reports/hub-explained-2026-11-05.md` section 7. Options (a)
  a samebase.com approval, (c) a GitHub login on the laptop, and (d) no proof were set aside there.
- Reviewed on 2026-11-05 by Codex (`gpt-6-astra`) against the code. Three defects of the first
  version are fixed here: the command ran before the first push could exist, a token could write a
  repository's former owner back after a transfer, and the row migration could not admit a laptop
  row. The smaller findings are folded in where they are named.
- Rewritten on 2026-11-05 after PR 1 shipped. The first starter change (samebase/base PR 42) ran a
  separate command at each dev start and kept five variables on the dev deployment by hand. Nicu
  asked why the laptop is not a stage of the app's own Alchemy stack. Two independent Codex reads
  (`gpt-6.1-sol` and `gpt-6-astra`) confirmed that it can be, and named what it takes: a missing
  `prod` row must give the off values instead of an error, the stack runs before `convex dev`, the
  dev deployment rows keep `retain`, and the token is sealed in two rows of the store. "The
  development stage" and "The starter" below replace the earlier "The command" and "The starter".

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
- The laptop is one more stage of the same stack, `dev-<name>`, with its own cloud development
  deployment: the same three rows as a preview, run from the laptop with the Convex login. No
  separate command, no variable set by hand.
- Before that first push to main there is no token, so a laptop has guest sign-in only.
- Nicu's admin page shows the laptop client in the one table, with "laptop" and the repository in
  place of a GitHub run.

## A sign-in from a laptop, step by step

Nothing in a sign-in needs the hub to reach the laptop. Only the browser does, and the browser is on
the laptop.

1. The person opens the app at `http://localhost:5173` and clicks Sign in with Google. The app's
   backend, the cloud development deployment at `https://<name>.convex.site` (or a local backend at
   `http://127.0.0.1:3211`, which the hub accepts and the starter no longer uses), sends the browser
   to `https://auth.samebase.com/authorize?...&redirect_uri=<backend>/auth/hub/callback`.
2. The hub sends the browser to Google. Google sends it back to the hub, to
   `auth.samebase.com/connectors/google-apps/callback`. Google never sees the laptop's address.
3. The hub sends the browser to the return address with a code, such as
   `http://127.0.0.1:3211/auth/hub/callback?code=...`. The browser reaches it: same machine.
4. The backend posts the code to `https://auth.samebase.com/token`, outbound, which works from
   anywhere, and gets the id_token.

The hub contacts a return address only once, at registration, to read the verification file. That is
the one step a loopback address cannot do, and the token replaces it there. A sandbox or a remote
machine is the https case: its backend is a cloud deployment or a forwarded https address, and the
browser reaches that.

## Facts

Verified in the code on 2026-11-05.

1. `POST /hub-clients` takes GitHub's OIDC token as the Bearer, derives the stage `prod` or `pr-<n>`
   from its claims, checks blocks and limits, fetches `/samebase-verification.json` at the origin of
   the return address, and creates the client and its `registrations` row in one transaction,
   rechecking the blocks inside it (`apps/identity-hub/convex/hubClients.ts:479`, `:405`). It
   refuses a return address on an IP address or `localhost` (`hubClients.ts:179`): a file cannot
   prove a laptop.
2. The broker's `registration.register` takes `deploymentType: production | preview` only
   (`packages/identity-broker/src/component/registration.ts:20`), gives a preview a `removeAt` 14
   days ahead (`registration.ts:154`), and at the cap of 30 clients per app evicts the oldest row
   that the incoming type may evict: any row for a preview, an unused row for production
   (`registration.ts:38`). A tenant may have 10 apps (`registration.ts:18`). `register` checks the
   owner it is given, or the tenant's recorded owner, against the owner switch, and records a given
   owner on the tenant (`registration.ts:94`, `:122`).
3. The broker's redirect URI rule accepts https, or http on `localhost`, `127.0.0.1`, or `[::1]`
   (`packages/identity-broker/src/client/protocol.ts:36`). Google never sees an app's return
   address: its callback is the hub's own (`apps/identity-hub/convex/connectors.ts:27`).
4. The broker has an RFC 7591 endpoint `POST /register` behind one global initial access token, not
   served since RFC 130 (`packages/identity-broker/src/client/registration.ts:12`,
   `registration.ts:310`). This RFC does not switch it on: `/hub-clients` stays the one create step.
5. `Convex.SharedHubClient` saves the client, its secret, its RFC 7592 registration access token,
   and the management URI in Alchemy state (`packages/alchemy-convex/src/SharedHubClient.ts:45`). A
   later deploy renews with `GET <registration_client_uri>` and that token
   (`SharedHubClient.ts:252`); a laptop run with matching saved values renews the same way. A laptop
   run that needs a new client logs that it has no GitHub token and gives the off values
   (`SharedHubClient.ts:231`).
6. Alchemy state is in the `alchemy-state-store` project of the app's Convex team. A run with the
   team's credential or the Convex CLI login reads any stage's rows through the store's `get`,
   secrets included (`packages/alchemy-convex/src/State.ts:221`, `src/StackComment.ts:9`,
   `src/Credentials.ts:69`). Building `Convex.state()` can create or upgrade the store
   (`State.ts:387`), so a reader uses `get` and never that.
7. A `Convex.Deployment` row can have `source` and `env` together, sets the variables in its `env`,
   and removes only a name that leaves its own `env`
   (`packages/alchemy-convex/src/Deployment.ts:19`, `src/Push.ts:530`). The starter's "Deployment"
   row pushes with `source`, "Site" writes the three `HUB_` variables with no source
   (`base/alchemy.run.ts:86` and `:107`).
8. The starter's `pnpm run dev` in the main checkout runs `convex dev` against the selected cloud
   development deployment, whose site URL is `https://<name>.convex.site`
   (`base/scripts/run-primary-dev.ts:16`). In a linked worktree it runs an anonymous local backend
   on `http://127.0.0.1:<port>` (`base/scripts/run-worktree-dev.ts:6`).
   `convex dev --start <command>` runs the command after the first push. A fresh clone has no
   selected deployment and no hosting files until the README's first run (`base/README.md:79`).
9. The starter's production deploy script, not every build, writes `samebase-verification.json` into
   `dist/client` from `GITHUB_REPOSITORY_ID` (`base/package.json:19`,
   `base/scripts/write-samebase-verification.ts:18`). A laptop never has the variable, so a
   development deployment serves no file. convex-hosting answers an exact `http.route` before its
   own handler, and uploaded files only inside that handler
   (`convex-hosting/packages/convex-hosting/src/client/index.ts:32`, `:48`).
10. `alchemy-convex hub-client` registers a development client of a team app with the Convex login:
    it renews the client that the three variables name, or registers a new one on the dev
    deployment's `CONVEX_SITE_URL` and writes the variables in one `env set --force`
    (`packages/alchemy-convex/src/HubClient.ts:272`).
11. The hub's `registrations` row holds `githubRepository`, `githubActorId`, `githubActorLogin`,
    `commitSha`, and `stage` of the run that asked, all required
    (`apps/identity-hub/convex/schema.ts:16`). `admitRequest` reads the table by owner for the
    new-owners window (`hubClients.ts:335`), so the table is not only the admin page's. There were
    11 rows on 2026-11-05.
12. On 2026-11-05 every public app on the hub was from one of Nicu's repositories
    (`reports/hub-explained-2026-11-05.md` section 6). Nobody outside has registered.
13. The Management API's `GET /deployments/{name}` answers the deployment's project
    (`packages/alchemy-convex/src/Deployment.ts:262`), and the Convex CLI finds a deployment's team
    the same way (`base/node_modules/convex/src/cli/envDefault.ts:247`).

## Target

### The token

- `POST /hub-clients` with GitHub's token for stage `prod` also answers `initial_access_token`, a
  32-byte random token with no dot in it, and `repository`, the numeric repository id from the
  claims. A preview registration answers neither. The token appears in this one answer and nowhere
  else: not in a log line, not in a renewal.
- The hub keeps one row per repository and app name in a new table `initialAccessTokens`: the
  SHA-256 of the token, `githubRepositoryDatabaseId`, `githubOwnerId`, `githubRepository`
  (`owner/name` as of issuance), `app`, `issuedAt`, and the production client id that the same
  request created. Indexes `by_token_hash` and `by_repository_and_app`. The row is written in the
  same transaction as the client. A production registration replaces the row, so the previous token
  stops.
- A GitHub-proof registration, production or preview, whose owner differs from the row's owner
  deletes the row: a transferred repository's old token stops at the first verified run after the
  transfer.
- The token has no expiry of its own. It stops when it is replaced or deleted as above, when its
  repository or owner is blocked, or when an admin deletes its row in the dashboard.
- Replacing or deleting a token stops new registrations only. A development client already made with
  it lives until its 14-day lease ends, as a preview client does. The recovery for a bad client is
  the one that exists: block the repository or the owner, which stops its sign-ins at once, and
  delete the client by hand.
- `Convex.SharedHubClient` saves `initialAccessToken` (redacted) and `repository` in its attributes,
  empty for a preview and for the off values. A run that gets the answer and dies before the state
  is saved has lost the token, and later deploys renew, so they do not ask again. Recovery, by hand:
  delete the token row in the dashboard and the production client with
  `identityBroker:deleteClient`; the next deploy registers both, and the app's users keep their ids,
  which do not depend on the client.

### The laptop request

`POST /hub-clients` with the initial access token as the Bearer. The hub tells the two proofs apart
by shape: a Bearer with two dots is a JWT and goes to the GitHub check, which verifies the
signature, issuer, audience, and expiry as today and answers 401 when any fails, never falling
through; a Bearer with no dot is an initial access token.

1. `THIRD_PARTY_PAUSED` refuses it, as today.
2. The token's hash names the row, or 401 `invalid_token`. The row's repository and owner go through
   the blocks and the hourly windows of the repository and the owner (`admitRequest`), not the
   new-owners window: an owner with a token has a registration.
3. The body is `{ app, redirectUri, softwareVersion }` as today. `app` must equal the row's `app`,
   else 403 `not_allowed` with reason `app_mismatch`.
4. The return address is https on a DNS name with the verification file, exactly as today, or http
   on a loopback host as the broker's rule names them (`127.0.0.1`, `[::1]`, `localhost`), any port,
   any path, with no file: the token is the proof, and the hub cannot reach a loopback address.
   PKCE, `state`, the exact match of the registered address, and the refusal of userinfo and
   fragments stay as they are. The stage registers exactly the address the deployment reports, with
   the IP literal that Convex gives, and registers again when the port changes (RFC 8252 section 7.3
   and 8.3).
5. The client is created with `deploymentType: development`, in the app's preview namespace
   `gh-<repository id>-<hash>-preview`, with `clientName: development`, `removeAt` 14 days ahead,
   and a registration access token (RFC 7592) for its renewals. The mutation that creates it reads
   the token row again by hash, and refuses when the row is gone, replaced, or names another app or
   owner, as it rechecks the blocks today. It passes no `ownerId` to the broker's
   `registration.register`: the broker checks the tenant's recorded owner and never writes one from
   a laptop request. Only a GitHub-proof registration changes a tenant's owner. The `registrations`
   row records the proof. The answer has the shape of today's 201, with no initial access token.

The broker's `registration.register` takes `development`, gives it `removeAt` like a preview, and
evicts it like a preview. The first laptop client of an app creates its preview app when none
exists, inside the tenant's budget of 10 apps, and development and pull request clients share the
preview app's cap of 30. Nothing else in the broker changes.

### The registrations row

`registrations` gets `proof`, a union:
`{ kind: "github", githubActorId, githubActorLogin, commitSha }` or
`{ kind: "initial_access_token", issuedAt }`. The three GitHub fields move into it;
`githubRepository` and `stage` stay at the top, `stage: development` for a laptop. The rows move the
Convex way, in two steps:

1. The first pull request makes `proof` optional and the three GitHub fields optional, writes every
   new row in the new shape, reads both shapes on the admin page, and adds a one-off internal
   mutation that replaces each old row with the new shape (`proof` filled from the three fields, the
   three fields gone). Run once after the deploy.
2. The third pull request makes `proof` required, removes the three fields and the one-off. The
   one-time functions of RFC 130 that have run, `importRegistrations` and `reconnectTenants`, go in
   the first pull request.

The admin page's "Registered by" gets a fourth value next to the GitHub run, "Team login", and "No
record": the repository with its id, "laptop", and when the token was issued. samebase.com's
validator of the hub's answer takes the new kind.

### The development stage

A laptop is a stage of the app's own Alchemy stack, named `dev-<name>`, with the three rows every
stage has. Nothing is set on the deployment by hand, and no command exists next to the stack.

1. **Stage and deployment.** `pnpm run dev` picks the stage name `dev-<slug>`: the slug is the
   checkout's directory name for a linked worktree, and the person's user name for the main
   checkout, so two people and two worktrees never share a stage or its state rows. "Deployment" is
   `Convex.Deployment({ project, type: "dev", name: <stage> })` with `adopt(true)`: it finds the dev
   deployment by that reference, or creates it (Convex allows more than one named dev deployment per
   member). Both deployment rows keep the default removal policy `retain`: a stage destroy never
   deletes a person's dev deployment. The project comes from the selected deployment, not from
   `prod`'s state, so a laptop works before the first deploy to main.
2. **The token.** The stage reads `prod`'s `HubClient` row through a read that answers the off
   attributes when the row does not exist:
   `Convex.SharedHubClient.read("HubClient", { stage: "prod" })`. A plain Alchemy ref throws on a
   missing row, so the package provides this read. It gives `initialAccessToken` and `repository`,
   sealed, as Outputs.
3. **"Deployment"** sets `SAMEBASE_REPOSITORY_ID` from that `repository` in its `env` and pushes
   with the same deploy script as production: it builds the site, writes the auth keys and the off
   values of the three `HUB_` variables when they are missing, uploads, and pushes. After it the
   site serves the verification file.
4. **"HubClient"** is `Convex.SharedHubClient` with `deploymentType: "development"` and
   `initialAccessToken` from step 2. With a token it posts to `/hub-clients` with the token as the
   Bearer and the deployment's `https://<name>.convex.site/auth/hub/callback`; the hub checks the
   file and answers the client. Without a token it gives the off values and logs "deploy to main
   once for Google sign-in on this laptop". It renews with the saved RFC 7592 address and token on
   each stack run, as a preview does, registers anew when the client is gone or the address or the
   type differ, and deletes the development client on destroy. A 403 on renewal gives the off values
   to the app and keeps the saved client in state, so an unblock needs no new client.
5. **"Site"** writes the three `HUB_` variables, with no push, as in every stage. The RFC 7592
   address and token stay in the stage's state. No `HUB_REGISTRATION_*` variable exists.
6. `pnpm run dev` then selects the deployment for the Convex CLI (`convex deployment select`, which
   writes `.env.local`) and starts `convex dev` with the frontend as its `--start` command. The
   stack finishes before the watcher starts, so the two never push at the same time.

The team: `CONVEX_TEAM_ID` when set; else the team of the selected deployment's project, read
through the Management API, and passed to the stack. A fresh clone with no `.env.local` runs
`convex init` first, which configures a deployment without a push.

### The starter

- `convex/http.ts` serves `GET /samebase-verification.json` as
  `{ "repository": <SAMEBASE_REPOSITORY_ID> }` with `Cache-Control: no-store`, and 404 while the
  variable is unset. An exact route wins over an uploaded file, so the variable, the route, and the
  removal of `write-samebase-verification.ts` ship together. "Deployment" sets the variable from
  `GITHUB_REPOSITORY_ID` in CI and from `prod`'s `repository` on a laptop. One mechanism for every
  stage.
- `convex/convex.config.ts` declares `SAMEBASE_REPOSITORY_ID` as optional: a deployment that never
  ran the stack has none.
- `alchemy.run.ts` gets the `dev-` branch next to `prod` and the previews: the three rows above.
  `HUB_APP` stays one line in the stack; no shared constants file.
- `pnpm run dev` (`scripts/run-primary-dev.ts`) does, in order: `convex init` when `.env.local` is
  missing; the team and the stage name; `alchemy deploy --stage dev-<slug>`;
  `convex deployment select`; `convex dev --start "vp run dev:frontend"`. A stack failure prints one
  line and still starts `convex dev`, so a laptop is never blocked by the hub. Linked worktrees run
  the same path with a cloud deployment of their own; the anonymous local backend goes.
- README, Google sign-in: three sentences on the laptop, and the first run.

### What does not change

- The team's apps and `Convex.HubClient`: the Convex login stays their proof, on laptops too.
- Production and preview clients of strangers' apps: the GitHub token and the file, as today.
- App ids, salts, connectors, the issuer. A laptop's users are the preview namespace's users.
- Expiry: a development client lives 14 days after its last dev start or sign-in (RFC 131).
- The tenant and owner switches stop a laptop client where they stop a preview: at registration,
  renewal, sign-in start, and code exchange. The pause stops registration, sign-in start, and code
  exchange; it does not stop a renewal, today or after this RFC.
- The broker's `/register` stays off. The admin page's key still cannot create anything.

## What a leaked token can do

The token lives in the Alchemy state of the app's `prod` stage, where the client secret already is,
and sealed again in each `dev-<slug>` stage that read it. Both are rows of the team's own store.
Whoever reads it can register development clients of that app, on loopback addresses or on https
hosts that serve the repository's id, which is public, inside the repository's 30 requests an hour
and the owner's 100. Such a client gets the identities of people who sign in to it, in the app's
preview namespace, and its registrations can evict the app's preview clients at the cap. It cannot
reach another app, a team app, a team connector, a provider login, or the production namespace. That
is what the repository's own CI run can do today with GitHub's proof. A block on the repository or
the owner stops it at once.

## Standards

- RFC 7591: the token is an initial access token in the section 1.2 sense, issued and checked by the
  service as the RFC leaves it. `/hub-clients` is a private request and answer that uses the
  concept; it is not the RFC's registration wire format, which the broker's `/register` is and which
  stays off.
- RFC 7592: each client, laptop clients included, manages only itself with its own token at the URI
  the hub gave. The initial access token is a separate thing and never manages a client.
- RFC 8252 section 7.3 and 8.3: loopback http with the IP literal, an exact registered address, a
  new registration on a port change.

## Order of work

1. **PR 1, hub, broker, package.** Broker: `development` in `registration.register`, version bump.
   Hub: `initialAccessTokens`, the token in the production answer, the transfer rule, the token
   proof in `/hub-clients` with the transactional recheck, the widened `registrations` with the
   one-off, the two RFC 130 one-time functions removed, the admin page's fourth value. Package:
   `Convex.SharedHubClient` saves the token and the repository id;
   `alchemy-convex hub-client --shared`; release. After the deploy, run the one-off.
2. **PR 2, package.** `Convex.SharedHubClient`: `deploymentType: "development"`, the
   `initialAccessToken` input, the read of another stage's row with off values when it is missing,
   the suspended state mapped to off values for the app; the `hub-client --shared` command and
   `registerSharedDevelopmentClient` deleted; release.
3. **PR 3, starter** (`samebase/base`): the route, the `dev-` stage, the dev runner, the deploy
   script without the file writer, the README, the package pin. It replaces samebase/base PR 42.
4. **PR 4, hub.** `proof` required, the three fields and the one-off removed (open as PR 1901).
5. Existing public apps get a token with their next production registration, and a renewal is not
   one. The production clients of Nicu's test repositories can be deleted by hand and redeployed.

## Validation

- Hub tests: a production registration answers a token and writes its row, a preview answers none; a
  second production registration replaces the row and the first token answers 401; a GitHub-proof
  registration with another owner deletes the row; the token registers a development client on
  `http://127.0.0.1:3211/auth/hub/callback` with no fetch, and on an https host only with the file;
  `app_mismatch`; a token whose row was deleted during the file fetch is refused in the create
  mutation; the request passes no owner to the broker and a tenant's owner is unchanged after it; a
  blocked repository, a blocked owner, and the pause refuse it; it counts in the repository and
  owner windows; the first laptop client creates the preview app and fails at the tenant's app
  budget; a laptop client is evicted at the preview app's cap; a JWT that fails verification is 401
  and never tried as an opaque token; the `registrations` row has `proof.kind: initial_access_token`
  and `stage: development`; only the production answer holds the token.
- Broker tests: `development` gets `removeAt` and is evicted like a preview; cleanup deletes it
  after its date; a renewal of a blocked tenant's client answers 403.
- alchemy-convex tests: the resource saves the token and the repository id from a recorded answer; a
  development resource registers with the token and the recorded answer, renews with the saved
  values, registers anew when the address or the type differ or the client is gone, gives the off
  values on 403 and keeps the saved client, gives the off values with no token; the read of another
  stage's row gives the off values when the row is missing; a stack test with the three dev rows
  keeps the order push, client, variables, with `SAMEBASE_REPOSITORY_ID` set by "Deployment" and
  kept after "Site", and `retain` on both deployment rows.
- Starter: the route answers the id with `no-store` and 404 without it; the dev runner runs
  `convex init` only without `.env.local`, then the stack, then the selection, then `convex dev`,
  and still starts `convex dev` when the stack fails.
- Live, on a fork of `samebase/base` under a second GitHub account with no Samebase account: push to
  main; clone; `npx convex login`; `pnpm run dev` in the main checkout and in a linked worktree;
  each gets its own dev deployment and Sign in with Google works in both; the admin page shows both
  rows with the app token; `alchemy destroy --stage dev-<slug>` deletes the client and keeps the
  deployment; after a block on the owner, the next `pnpm run dev` prints the hub's reason and the
  laptop has guest sign-in only; before any deploy to main, `pnpm run dev` gives a working app with
  guest sign-in.

## Decisions

Taken on 2026-11-05:

1. The laptop's proof is the app's own initial access token (RFC 7591), issued only with a
   production registration and saved in the stack's state. No Samebase account, no GitHub login on
   the laptop, no open endpoint.
2. One create step: `/hub-clients` takes both proofs, told apart by shape. The broker's `/register`
   stays off.
3. A loopback return address needs no file; an https one keeps the file. The starter serves the file
   from a variable through one route, in every stage.
4. The token is replaced by each production registration, deleted by a verified run under another
   owner, and has no expiry of its own. A laptop request never changes a tenant's owner.
5. A laptop is a stage `dev-<slug>` of the app's stack, with its own cloud dev deployment, adopted
   or created by reference and retained on destroy. The client's RFC 7592 address and token live in
   that stage's state, as a preview's do; no variable is set by hand. A 403 on renewal gives the app
   the off values and keeps the client in state.
6. `registrations` gets a `proof` union, moved in two pull requests with the one-off between them.
   No invented actor or commit on a laptop row.
7. The laptop's client is in the app's preview namespace, as a development client with the 14-day
   lease.
8. The stack runs before `convex dev`, never inside its `--start`, and finds the team from
   `CONVEX_TEAM_ID` or the selected deployment's project.
9. The starter uses cloud dev deployments only, in linked worktrees too. Anonymous local backends
   get no client: the stack cannot see them, and one mechanism is worth more than the second path.

## Not in this RFC

- The team's own apps on this path, and the bindings that would keep their app ids and salt mode.
- A list of sign-in methods per app, and a public GitHub OAuth App.
- A token with the GitHub proof for an existing production client without a registration.
- The pause on renewals.
- A client for an anonymous local backend.
- The page before Google that names the repository and the return site.
