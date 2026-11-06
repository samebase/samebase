# 134 One path for every hub client

## Document Control

- Status: Accepted on 2026-11-06. PR 1 is the pull request that adds this file.
- Owner: Nicu Chiciuc
- Created: 2026-11-06
- Base: `origin/main` at v2275 (RFC 133 shipped).
- Research: `reports/personal-apps-one-path-2026-11-06.md`. This RFC is its result, without the
  options that were set aside.
- Reviewed on 2026-11-06 by Codex (`gpt-6-astra`) against the code. Nine findings, all folded in:
  the owner list became a repository list, each app keeps its row names and the owner of each
  variable, previews get the off values from the project's defaults, anonymous folders are
  converted, the old Alchemy rows are drained before the provider goes, the two block switches stay
  separate, a provider refresh checks blocks, and `required` also fails on a suspended client.

## Summary

Today the hub makes clients in two ways. Nicu's four apps (samebase.com, Bristol, ailegis,
TrailScout) use the team's Convex login and the internal function `registerClient`. Every other app
uses `POST /hub-clients` with GitHub's token in CI and the app's own token on a laptop. After this
RFC there is one way: `POST /hub-clients` for every app.

What a real person sees:

- Nothing on samebase.com. A user keeps their account.
- A user of Bristol, ailegis, or TrailScout keeps their account. The app finds them by email.
- On a laptop, samebase.com runs a logged-in Convex local deployment in each folder, in place of an
  anonymous one. It is listed in the Convex dashboard under the project.
- The admin page lists every client with the repository and the run or laptop that made it.

## Decisions

Taken on 2026-11-06:

1. **One path.** Every client comes from `POST /hub-clients`. The broker's `registerClient`,
   `renewClient`, and `createApp` go, and `Convex.HubClient` of alchemy-convex goes.
2. **Own apps by repository.** The hub holds one list of GitHub repository ids. A listed repository
   gets a first-party app; every other repository gets a guest app. A copy of the hub sets its own
   list. Not by owner: an owner list would make `samebase/base` and every test repository of
   `nicu-chiciuc` first-party, so the starter would no longer show what a stranger gets, nobody
   could test the guest path from Nicu's account, and the existing guest apps of those repositories
   would answer `app_taken` at their next registration.
3. **New app ids for the four apps.** No mapping keeps an old app id.
4. **Public subjects.** The user id that the hub gives an app is the provider's own id, the same in
   every app and every hub. No salt. Until this RFC the hub gave pairwise subjects with a salt; it
   stopped so that an app keeps its users' ids when it moves to another hub, and the reasons are
   under "Why public subjects are safe". The broker's `docs/design.md` records this history.
5. **samebase.com laptops use logged-in local deployments**, one per folder, in the main checkout
   and in every worktree. The anonymous mode goes.

## Target

### The hub

- `apps/identity-hub/convex/ownApps.ts`:

  ```ts
  /** The repositories whose apps are this hub's own: every connector and provider logins. */
  export const OWN_REPOSITORY_IDS = new Set([
    "1021726325", // samebase/samebase
    "851029727", // nicu-chiciuc/bristol_tsx
    "1343236238", // nicu-chiciuc/ailegis-same
    "1347540564", // samebase/scout
  ]);
  ```

- `createClient` and `createDevelopmentClient` (`apps/identity-hub/convex/hubClients.ts:429`,
  `:538`) pass `firstParty: OWN_REPOSITORY_IDS.has(<repository id>)` to the broker. The repository
  id is GitHub's signed `repository_id` for a run, and the token row's for a laptop. A first-party
  app gets no connector; a guest app gets `google-apps`, as today.
- The app id is `gh-<repository id>-<hash of the name>` for production and the same with `-preview`
  for previews and laptops, as today, for every app. A listed repository is a new app id, so no
  existing app changes its kind.
- Proofs, the verification file, blocks, limits, the registrations row, and the initial access token
  per repository and name do not change.

### Subjects

- `sub` is `<provider>:<the provider's id>`, such as `google:104325...` or `github:4076804`. Each
  connector type gets a required `provider` field. `google()` sets `google`, also for the connector
  named `google-apps`, so one Google account has one `sub` on both. `github()` sets `github`.
- Discovery says `subject_types_supported: ["public"]` (OpenID Connect Core section 8). Google's own
  discovery says the same.
- The `connector` claim stays. `connector_account_id` stays until PR 3, then goes: the `sub` carries
  the same id.
- `IDENTITY_BROKER_KEYS` holds signing keys only. The parser no longer reads `pairwiseSalt`, and
  after the hub's deploy the variable is written again without it. `appSalt` and `pairwiseSubject`
  go.
- Every existing user gets a new `sub` once. That is a sign-up in each app, and each app finds the
  existing user: samebase.com by connector and `connector_account_id`, Bristol, TrailScout, and
  ailegis by email. ailegis needs that lookup first: its `createUser` inserts without one
  (`ailegis-same/convex/owner.ts:38`). Users of the guest apps that `samebase/base` and Nicu's test
  repositories made get new accounts in those apps, because the starter's `createUser` inserts. No
  stranger has signed in to any guest app.

#### Why public subjects are safe

- **The standard allows it.** OpenID Connect Core section 8 defines two subject types. `public`
  "provides the same sub (subject) value to all Clients" and is the default. `pairwise` gives each
  client its own value. Section 17.3 says pairwise "SHOULD be considered" to protect a user from
  correlation among clients. It is a consideration, not a requirement. Google itself publishes
  `subject_types_supported: ["public"]`.
- **Pairwise hides nothing here.** It stops two apps from matching one user by `sub`. Every app of
  this hub also asks for `email` (the starter, samebase.com, Bristol, ailegis, TrailScout), and an
  email matches the user across apps more surely than any `sub`. An app that asks for `openid` alone
  would lose that protection; no app does today.
- **The id stays unique and is never reassigned**, as section 8 requires: Google's `sub` is unique
  among all Google accounts and never reused, GitHub's user id is its permanent numeric id, and the
  prefix keeps the two providers apart. The value is far below the 255 characters of section 2.
- **A `sub` is not a credential.** Each id_token names one client in `aud`, and each app checks it
  (Convex Auth does). Knowing a user's `sub` gives no access to any app.
- **What pairwise cost.** A user's id depended on the hub's salt, the app id, the connector name,
  and the issuer. Losing the key set, moving an app to another hub, or turning a guest app into an
  own app gave every user a new id. With public subjects none of these change a user's id.

### The broker

- `registration.register` takes `firstParty` and an optional `connector`. An existing app with
  another `firstParty` or tenant answers `app_taken`, as today.
- The limit of 120 sign-in requests a minute per tenant
  (`packages/identity-broker/src/component/authRequests.ts:68`) and the pause
  (`authRequests.ts:337`) apply when the app is not first-party. Today they test for a tenant, and
  after this RFC every app has one.
- A provider refresh checks the tenant's switches and the owner block, as a code exchange does.
  Today `authenticate` in `packages/identity-broker/src/component/resourceRequests.ts:18` checks
  only the secret and `firstParty`, so a blocked first-party repository would keep its provider
  access.
- Deleted in PR 3: `admin().createApp`, `registerClient`, `renewClient`
  (`packages/identity-broker/src/client/index.ts:857`, `:886`) and the component mutations behind
  them; `POST /register` with a global initial access token and `POST /tenant-connection`
  (`packages/identity-broker/src/client/registration.ts:310`), which the hub has not served since
  v2261, with `setConnection`, the `initialAccessToken` option, and `connectionRevision`, which only
  `setConnection` compares. `GET` and `DELETE /register/<client>` (RFC 7592) stay: `SharedHubClient`
  renews and deletes with them.
- Schema in PR 3: `apps.tenantId` required, `apps.allowedCallbackHosts` removed,
  `clients.registrationTokenHash` and `clients.renewedAt` required. `tenants.suspendedAt` (the
  operator's `setTenantSuspended`) and `tenants.disconnected` (a repository block) stay separate, so
  an unblock never clears an operator's suspension.

### The package, `@samebase/alchemy-convex`

- `Convex.SharedHubClient` gets `required: true`: the run fails when the client ends with any status
  but `on`, a failed registration or a suspended client at renewal
  (`packages/alchemy-convex/src/SharedHubClient.ts:310`, `:360`). A renewal that gets no answer
  keeps the saved values, which still work, and does not fail.
- A new resource `Convex.LocalDeployment`: the logged-in local deployment of this folder, read from
  `.convex/local/default/config.json` (name, ports, admin key, `cloudProjectId`). It only writes its
  `env`, through the same `/update_environment_variables` call as a cloud deployment, with the admin
  key. It never creates, pushes, or deletes: `convex dev` owns the backend and the push.
  `Convex.LocalDeployment.of()` gives its `siteUrl` to the stack's program, for the clients'
  callbacks. A resource of its own, not a type of `Convex.Deployment`, which works through the
  Management API on cloud deployments only.
- `ManagementApi.teamId` reads the team of a selected `local:` deployment from its `cloudProjectId`.
  Today it refuses a `local:` selection.
- Deleted in 0.31.0: `Convex.HubClient`, `HUB_PROJECT_NAME`, the `hub-client` command,
  `resolveTeamId`. Only after no stage of any stack in the team's store holds an
  `IdentityHub.Client` row: Alchemy stops a plan whose state holds a row of a type with no provider
  (`alchemy/src/Plan.ts:2255`), and a preview cleanup on `main` destroys an old stage with the
  package of `main` (`.github/workflows/alchemy.yml:173`).

### The shape of each app's stack

Each of the four apps keeps its row names, and each variable keeps the row that owns it today. A row
removes a variable that leaves its own `env` before it pushes
(`packages/alchemy-convex/src/Push.ts:531`), so moving a variable between rows in one run either
loses it or fails the push. The rows of `Convex.HubClient` are replaced by new rows of
`Convex.SharedHubClient` with new names, "SignInClient" and, for samebase.com, "ConnectionsClient":
the old rows leave the program and are deleted with the provider that 0.30.0 still has, which leaves
a production client on the hub and unregisters a preview's.

- **Production.** The callback is a fixed address, and the running deployment serves the
  verification route from the deploy before (see the order of work). So the clients register before
  the row that pushes, as `Convex.HubClient` does today, and that row keeps its `env`. Nothing else
  changes.
- **Previews.** The callback is on the new deployment's `.convex.site` URL, and the hub reads the
  verification route there before it registers. So the row that creates the deployment ("Preview" in
  samebase.com) gets the `source` and pushes first; the clients register; the row that pushed before
  ("Site") keeps its `env` and loses its `source`. `SAMEBASE_COMMIT` goes into the first row's `env`
  too, with the same value, so a change in a workspace package still pushes. The first push of a new
  preview needs the hub variables that `convex.config.ts` requires: the project's default variables
  for previews get their off values, as the starter's `ensure-convex-auth.ts` writes them. Today
  `apps/samebase/scripts/deploy-preview.ts:14` sets only `CREDENTIAL_KEYS`.

### samebase.com

- Production: "SignInClient" (`app: "samebase"`, on `https://samebase.com/auth/hub/callback`) and
  "ConnectionsClient" (`app: "samebase-connections"`, on `https://samebase.com/oauth/hub/callback`),
  both `Convex.SharedHubClient` with `required: true`, then "Site" as today. Two names, because the
  hub keeps one initial access token per repository and name.
- Previews: as above, with `required: true`.
- Stage `dev-<slug>`, on a laptop: the two clients as development clients with the tokens of
  `prod`'s two rows, on `http://127.0.0.1:<site port>/auth/hub/callback` and `/oauth/hub/callback`,
  and "Site" as `Convex.LocalDeployment` with the six `HUB_` and `RESOURCE_HUB_` variables.
- `convex/http.ts` serves `GET /samebase-verification.json` as `{"repository":"1021726325"}` with
  `Cache-Control: no-store`, above the hosting catch-all.
- `.github/workflows/alchemy.yml`: `id-token: write` on the deploy job.
- Sign-in (`apps/samebase/convex/identity/signIn.ts:111`) takes the provider id from `sub` in PR 3,
  when `connector_account_id` goes.
- `pnpm run dev`, in the main checkout and in each worktree:
  1. When `.convex/local/default/config.json` is missing, or names an `anonymous-` deployment:
     delete the anonymous folder, then run
     `npx convex deployment create nicu:samebase-com:local --select`. It imports the project's
     default variables for development and replaces the selection in `.env.local`. Decided on
     2026-11-06: no worktree's local data is kept.
  2. `convex dev` with the folder's fixed ports (`apps/samebase/scripts/convex-dev.ts`), so the
     callback keeps its port.
  3. When the local backend answers: `alchemy deploy --stage dev-<slug>`. The existing wait in
     `scripts/run-worktree-dev.ts:25` is the place.
- The project's default variables for development get `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`,
  `GITHUB_APP_SLUG`, which the seed script copies today and the defaults lack, and the off values of
  the six hub variables, so the first push of a new local deployment passes `convex.config.ts`.
  Names that no code on `main` reads are removed from the defaults.
- Deleted: `CONVEX_AGENT_MODE=anonymous` and its branches in `predev.ts` and `convex-dev.ts`, the
  copy of nine variables from `nicu:samebase-com:dev` in `scripts/convex-seed-dev-auth.ts`, the
  scripts `hub:client` and `hub:resource-client`. The dev deployment `quiet-robin-508` is deleted by
  hand after the move.

### Bristol, ailegis, TrailScout

Each one, in its own repository, the shape above: production clients before the pushing row,
previews push first, the verification route, `id-token: write`, preview default variables with the
off values, and a `dev-<name>` stage on a cloud dev deployment for laptops. They are first-party, so
`connector=google` and Google's "Samebase" screen stay. TrailScout's profile check reads the
provider id from `sub` (`scout/apps/scout/convex/auth.ts:408`) in its PR 3 change.

### The admin page

"Registered by" has two kinds: a GitHub run with its actor, or a laptop with the token's issue time.
"Team login" and "No record" go, with `madeByTeam` in the hub's `clientList`
(`apps/identity-hub/convex/moderation.ts:201`). A first-party app shows as "own".

## Order of work

The old path stays until every app has left it, because the installed package of each app calls
`registerClient`.

1. **ailegis**: `createUser` finds the owner by email before it inserts.
2. **PR 1, monorepo, additive**: the repository list, `firstParty` in `register`, the limit and
   pause rule, the refresh checks, public subjects with `connector_account_id` kept, the key set
   parser without the salt, `required`, `Convex.LocalDeployment`, `teamId` for `local:`, and
   samebase.com's verification route. Release the broker and alchemy-convex 0.30.0. After the hub's
   deploy: write `IDENTITY_BROKER_KEYS` again without the salt. After samebase.com's deploy:
   production serves the route.
3. **PR 2, monorepo: samebase.com** on the one path, with the default variables, and local
   deployments on laptops. The three provider connections are connected again once: their refresh
   grants belong to the old resource client. Then the old clients of `samebase-ahbfh` and the app
   are deleted by hand.
4. **Bristol, ailegis, TrailScout**, two PRs each: the verification route, then the stack. Then
   their old apps and 7 clients are deleted by hand.
5. **Drain.** List every stage of every stack in the team's store. Each stage that still holds an
   `IdentityHub.Client` row is destroyed, or deployed once with 0.30.0. The list must be empty.
6. **PR 3, monorepo, deletion**: everything marked "Deleted" above, the schema changes,
   `connector_account_id`, the admin page kinds. alchemy-convex 0.31.0. The PR 3 changes of
   samebase.com and TrailScout that read the id from `sub` land first.

## Validation

- Hub: a run of a listed repository gets a first-party app with every connector; another repository
  gets a guest app with `google-apps`, also one of `nicu-chiciuc`; a laptop's token row decides by
  its repository.
- Broker: `sub` is `google:<id>` for both Google connectors and `github:<id>` for GitHub; discovery
  says `public`; a key set without a salt parses, and one with a salt parses until PR 3; the tenant
  limit and the pause skip first-party apps; a refresh of a blocked tenant or owner is refused.
- alchemy-convex: `required` fails the run on a refusal, on a hub that does not answer at
  registration, and on a suspended client; `Convex.LocalDeployment` writes env with the admin key
  and never pushes; `teamId` reads a `local:` selection's team; a stack with the new row names
  deletes the old `IdentityHub.Client` rows and keeps a production client on the hub.
- Live, after PR 2: samebase.com production and an existing and a new preview sign in with Google
  and GitHub, and the user keeps their data; Connect Convex, Cloudflare, and GitHub work; an
  existing anonymous worktree is converted and keeps its old data folder; a new worktree gets its
  own local deployment and signs in; a second worktree at the same time gets another one; the admin
  page shows every client with a repository.
- Live, after step 4: each app signs Nicu in to his existing account.

## One switch

The broker has two switches that stop a repository's sign-ins. `disconnected` is set by Block
repository on the admin page. `suspendedAt` is set only by hand, with
`npx convex run identityBroker:setTenantSuspended`. Both act on the same repositories and stop the
same things; the hand switch leaves no row in the hub's `blocks` table, so the admin page does not
show it. After this RFC the four own apps have repositories too, so Block repository reaches every
app. Decided on 2026-11-06: PR 3 deletes `setTenantSuspended` and `suspendedAt`, and the admin
page's Block repository and Block owner are the only switches.

## Not in this RFC

- The hub as a template repository, and the gaps a copy has today: the package's fixed terms URL,
  the GitHub audience `samebase`, a rule that refuses guests on a hub without a guest connector.
- Carrying a user's id to another hub: public subjects make it the same there, so nothing is needed.
- The default stage name for `pnpm run hub`.
