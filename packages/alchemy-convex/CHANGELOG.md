# Changelog

## 0.39.0

- Breaking: `IdentityHub.Client` takes `redirectUris`, a list of one to eight return addresses, in
  place of `redirectUri`. One client serves every handler of the deployment that receives the hub's
  answers. The hub records the set for good: a changed set registers a new client, as a changed
  connector set does. The attributes hold `redirectUris` and `app`; a row saved by an earlier
  version cannot be read, so the cut-over resets the client rows of each stack with the hub's
  `clients` table (identity-broker 0.31.0).
- `app` is optional. Its default is the stack's path in the repository, `apps/samebase` for the
  stack `samebase/samebase/apps/samebase`, and `app` for a stack named after the repository, which
  is the name the starter has used all along. A stack whose name is not `owner/repo` or
  `owner/repo/<path>` must set `app`. A changed name registers a new client under the new name; an
  earlier version renewed the old client.
- `IdentityHub.defaultApp(stackName)` is exported, for tooling that must name the app.

## 0.38.0

- `IdentityHub.Hub` is `{ issuer }`. The stack no longer names the hub's terms, and the answer of a
  registration is no longer checked against them: the hub's operator can move its terms without
  breaking every app's deploy. A new client's log line names the hub's issuer, a value of the stack.
- A `hub` constant that still has `terms` keeps compiling; remove the line when convenient. An
  inline `hub: { issuer, terms }` literal must drop `terms`.

## 0.37.0

- Breaking: `Convex.SharedHubClient` is now `IdentityHub.Client`, from its own import path:
  `import * as IdentityHub from "@samebase/alchemy-convex/identity-hub"`. Its types are
  `IdentityHub.ClientProps`, `IdentityHub.ClientAttributes`, and `IdentityHub.Hub`. The root export
  no longer has `SharedHubClient`, `SharedHubClientProps`, `SharedHubClientAttributes`, or `Hub`.
  `Convex.providers()` still registers the provider.
- The resource type is `IdentityHub.Client`. A row that an earlier version saved as
  `IdentityHub.SharedClient` is the same client: the next deploy updates it in place, with no new
  client and no delete, and saves it with the new type. `IdentityHub.Client.read` and
  `alchemy-convex stack-comment` read rows of both types.
- `Convex.Deployment` with `source` removes a name that left `env` after the push succeeds, not
  before it. Convex refuses to remove a variable that the running code requires, so before, a
  renamed required variable stopped the deploy. A failed push keeps the old name, and the next run
  removes it. Without `source`, the removal stays in the same write as the new values.
- The starter's variables are `IDENTITY_HUB_ISSUER`, `IDENTITY_HUB_CLIENT_ID`, and
  `IDENTITY_HUB_CLIENT_SECRET` (before, `HUB_ISSUER`, `HUB_CLIENT_ID`, and `HUB_CLIENT_SECRET`).
  Rename them in `alchemy.run.ts` and in the app that reads them, together with the move to 0.37.0.
  The first deploy of 0.37.0 sets the new names before its push and removes the old ones after it.
- The store stays at version 7.

## 0.36.0

- The store stays at version 7, so 0.35.0 and 0.36.0 work with the same store.
- `Convex.SharedHubClient` no longer replaces a saved client whose attributes it cannot read, such
  as one that 0.32.0 or older saved. Such a row stops the run with a fixed message that holds no
  value of the row.
- `newKeyRing` is gone from `@samebase/alchemy-convex/sealed-secret`.

## 0.35.0

- `Convex.state()` holds Alchemy's state interface and nothing else, so `Cloudflare.state()` can
  take its place in a stack. It no longer adds the run record to the stage output.
- `Convex.withRunRecord(state)` adds the run record to the outputs of any state layer:
  `state: Convex.withRunRecord(Convex.state())`. A stack without it writes outputs with no
  `samebase.run`, and Samebase does not show its stages. The helper that 0.34.0 exported under this
  name, which added a record to one output value, is gone.
- Store version 7. `state:set`, `state:remove`, and `state:setOutput` take no `run`, and the store
  keeps no current run record: a reader sees a stage from its first complete deploy, with the record
  in its output. `state:readStack` and `reader:repository` give each stage as
  `{ name, resources, output }`; the repository reader removes the secrets and nothing else. A
  resource write no longer reads the output row of its stage.
- The first run of 0.35.0 pushes the store, and from then on a client of 0.34.0 or older fails its
  runs until it upgrades: upgrade every repository of a team together, with Samebase. The rows of
  store version 6 stay as they are, and the push needs no other step.

## 0.34.0

- `Convex.SharedHubClient` takes `hub`, the identity hub to register at, required:
  `{ issuer, terms }`. It replaces the `HUB_URL` variable and the fixed terms of samebase.com, so
  any hub of @samebase/identity-broker 0.27 can give a client. The run asks GitHub for a token whose
  audience is the hub's issuer, as the broker 0.27 requires (before, `samebase`). The answer must
  name the hub's issuer and terms. A client is renewed only at the hub that issued it, so a changed
  hub registers a new client there.
- Every stack sets `hub`. On Samebase's hub:
  `hub: { issuer: "https://auth.samebase.com", terms: "https://samebase.com/terms" }`. A saved
  client keeps working: it already holds that issuer, so the first run of 0.34.0 renews it.

## 0.33.0

- `Convex.SharedHubClient` takes `connectors`, the names of the hub's connectors the client signs in
  through, such as `["google", "github"]` (RFC 137): required, at least one name of
  `[a-z0-9-]{1,64}`. The request sends the set, the hub records it on the client, and the attributes
  and outputs hold it as `connectors`, sorted, each once. A client is renewed only when its return
  address, its type, and its connector set are the saved ones; another set registers a new client. A
  400 `invalid_connectors` logs the connectors the hub allows this app.
- Every app sets `connectors` and deploys once. The saved attributes changed shape, so the first run
  of 0.33.0 registers a new client for every saved client, and a production run also gets a new
  initial access token: deploy production first, then previews, then start development again,
  because a development run reads the production row and cannot read one that 0.32.0 saved. A
  replaced production client stays valid on the hub until its administrator deletes it.
- The pull request comment says `Sign-in with google, github: on` for a client, in place of
  `Google sign-in: on`.

## 0.32.0

- A run record's `source` is `github-actions` or `checkout`; `laptop` is gone. `checkout` names
  where the record came from, git in a checkout outside GitHub Actions (a developer's machine, a
  sandbox, another CI), and says nothing of the stage: a checkout can deploy `prod`.
- Store version 6. The first run of 0.32.0 pushes it, and from then on a client of 0.31.0 fails its
  runs until it upgrades: upgrade every repository of a team together. A stored output whose run
  record says `laptop` stops the push: delete that output row first (its stage writes it again at
  its next run).

## 0.31.0

- Remove `Convex.HubClient`, its provider, `HUB_PROJECT_NAME`, `HubClientAttributes`,
  `HubClientFailed`, `HubClientProps`, and `HubDeploymentType`, and the command
  `alchemy-convex hub-client`. The identity broker no longer has `registerClient` or `renewClient`:
  every app gets its clients from `Convex.SharedHubClient`. A stack whose state still holds an
  `IdentityHub.Client` row stops its plan: destroy that stage, or deploy it once with 0.30.0 first.
- Remove `ManagementApi.resolveTeamId`. `ManagementApi.teamId` gives the team of the credential.
- `alchemy-convex stack-comment` is the only command.

## 0.30.0

- `Convex.SharedHubClient` takes `required`. With `true`, the run fails unless the hub confirms the
  client in this run: a refused or unanswered registration or renewal, or a suspended client, fails
  it. Without it, the run gives the off values or keeps the saved client, as before.
- Add `Convex.LocalDeployment`, which writes the `env` of the logged-in local deployment of a
  folder, from its `.convex/local/default/config.json`, with its admin key. It never creates,
  pushes, or deletes. `Convex.LocalDeployment.of(rootDir?)` gives its `siteUrl` to the stack's
  program.
- With the Convex CLI login, a selected `local:` deployment gives the team of its project, from the
  folder's `config.json`. Before, a run with a local deployment selected stopped.

## 0.29.0

- `team` is removed from `Convex.state()` and from both forms of `Convex.Project`, `{ name }` and
  `{ slug }`. They are in the team of the credential. A team access token and an OAuth token of a
  team name it in `GET /token_details`. The Convex CLI login names no team, so a run with it takes
  the team of the deployment that the Convex CLI selected: `CONVEX_DEPLOYMENT` in the environment or
  in `.env.local`, then the project of that deployment, then the team of that project. A local or
  anonymous deployment is in no team, and the run stops. Remove `team` from the stack. A stack whose
  state has `team` keeps its project and writes nothing to Convex when the credential is of the same
  team; a credential of another team stops the plan with `ProjectTeamChange`.
- `alchemy-convex stack-comment` takes no `--team`. `Convex.HubClient` and `hub-client --team` keep
  `team`: it names the team of the hub, not the team of the app.

## 0.28.0

- `Convex.Deployment` with `type: "dev"`: `name` is a dev reference or the Convex name of a dev
  deployment that exists, such as `happy-animal-123` from `.env.local`. With `adopt`, a stage takes
  over the deployment that `npx convex dev` made and selected and gives it variables, with no push
  and no new deployment; a name that matches nothing still creates a dev deployment with that
  reference, as before. A deploy key of that deployment is accepted for the name form too. This is
  how a laptop gets its hub client (RFC 133): `alchemy deploy --stage dev-<name>`, run on purpose
  after `convex dev`, with three rows on that deployment: the repository id, the client, the three
  `HUB_` variables.

## 0.27.3

- A failure of `Convex.SharedHubClient` that stops a stack prints its reason. In 0.27.2 the error
  had an empty message, so a terminal showed only a stack trace.

## 0.27.2

Three fixes from the review of 0.27.1, with no change to the state store protocol.

- The `terms` of a new client's answer must be exactly `https://samebase.com/terms`. In 0.27.1 any
  path of samebase.com passed, so an answer could still put a value into the log line.
- The run replaces a saved client row with a new client only on a schema issue, such as the missing
  token fields of a row that 0.26 or earlier saved. Any other failure of the decoder stops the run
  with a fixed message, so a defect never registers a client.
- The warning of that replacement says that the saved attributes cannot be read by this version and
  that the new client replaces the saved one. For a production client, the new registration also
  replaces the app's initial access token.

## 0.27.1

Three fixes from the review of 0.27.0, with no change to the state store protocol.

- `Convex.SharedHubClient` keeps `initialAccessToken` and `repository` from a production answer
  only. A preview or development answer that holds them is not saved with them.
- The log line of a new client names the request's return address, and the answer's `terms` must be
  a page of samebase.com, so no value that an answer chose is printed. An answer with another return
  address is a bad answer and gives the off values.
- A saved client row that this version cannot read, such as one that 0.26 or earlier saved without
  the token fields, is no client: the run warns and asks for a new one. For a production client that
  also gives the app's initial access token, so an existing app needs no deletion by hand.

## 0.27.0

A laptop is a stage `dev-<name>` of the app's stack, and `Convex.SharedHubClient` gets its client
there (RFC 133). The command `alchemy-convex hub-client --shared` and its function
`registerSharedDevelopmentClient` are deleted. `alchemy-convex hub-client` keeps the team mode of
`Convex.HubClient`.

- `Convex.SharedHubClient` takes `deploymentType: "development"` with `initialAccessToken`, the
  app's initial access token. Only a development client takes the token, and the props type rejects
  other combinations. The client asks `POST /hub-clients` with the token in place of the GitHub OIDC
  token, renews like a preview, and a destroy deletes it. With an empty token, it gives the off
  values and logs "deploy to main once for Google sign-in on this laptop". A 401 logs that the hub
  refused the initial access token.
- A saved client is renewed only when its `redirectUri` and its `deploymentType` are the new ones.
  Else, the run asks for a new client.
- `Convex.SharedHubClient.read(id, { stage })` gives the attributes of a client row of another stage
  of the same stack as Outputs, with the State service of the running stack. When the row is
  missing, it gives the off attributes, where `Convex.SharedHubClient.ref` fails.
- `Convex.SharedHubClient.variables(client)` gives `issuer`, `clientId`, and `clientSecret` for the
  app's deployment: the client's values when `status` is `on`, else the `no-hub` values. A suspended
  client keeps its values in state, and the app gets guest sign-in.

The state store protocol does not change.

## 0.26.0

A laptop gets Google sign-in for an app on the central identity hub with the app's initial access
token (RFC 133). The hub must answer `initial_access_token` and `repository` to a production
registration, and take that token at `POST /hub-clients`.

- `Convex.SharedHubClient` saves `initialAccessToken` (redacted) and `repository` from a production
  registration. A renewal keeps them. They are empty for a preview, for the off values, and for a
  client saved by an earlier version until its next production registration.
- `alchemy-convex hub-client --shared --stack <owner/name> --app <app> --callback-path <path>`
  renews the laptop's client when `HUB_ISSUER` is the hub that it asks (`HUB_URL`, else
  `https://auth.samebase.com`), the client ID and the secret are not `no-hub`, and the hub answers
  exactly the current callback. Else, it reads the token from the `HubClient` row of stage `prod`
  and asks the hub for a development client. It writes `HUB_ISSUER`, `HUB_CLIENT_ID`,
  `HUB_CLIENT_SECRET`, `HUB_REGISTRATION_URI`, and `HUB_REGISTRATION_TOKEN` on standard input, and
  `SAMEBASE_REPOSITORY_ID` on an https site. It finds the team from `--team`, `CONVEX_TEAM_ID`, or
  the selected cloud development deployment. A failure prints a fixed text that quotes no answer and
  no error. It never stops a dev start.
- A refusal with the reason `app_mismatch` logs that the token belongs to another app.

The state store protocol does not change.

## 0.25.1

- A resource write of the store writes the run record of the stage only when the run changes. The
  resources of a deploy write at the same time, and each of them wrote the one output row of the
  stage, so a deploy with several resources could fail with
  `Documents read from or written to the "outputs" table changed while this mutation was being run and on every subsequent retry`.
- `recordedAt` of the current record is the time of the first write of the run until its output, and
  then the time of the output. Two laptop deploys of one commit have no `runUrl`, so they count as
  one run: the second keeps the time of the first until its output.

The store version stays 5, because no function changes its arguments or results. A client pushes the
store only to a store of an older version, so an existing store gets this change only from a manual
push of `src/store`. A new store gets it from its first run.

## 0.25.0

Every preview and development client of `Convex.HubClient` and `alchemy-convex hub-client` expires
14 days after its last deploy, dev start, or use. A production client never expires. The hub must
have `identityBroker:renewClient` of `@samebase/identity-broker` 0.15.0 or later.

- `Convex.HubClient` renews its client on the hub at each deploy: its diff is always an update. A
  client that the hub no longer has gets a new one, and the `env` of the `Convex.Deployment` gets
  the new values in the same run. A destroy deletes a preview client and leaves a production client,
  because the production deployment can stay.
- `alchemy-convex hub-client` renews the client that the three variables name. A deployment whose
  client the hub no longer has, such as one with the `no-hub` values, gets a new client in one
  `env set --force`. Run it at each dev start.
- Each new client is registered with `expires: true`.

The state store protocol does not change.

## 0.24.0

`Convex.SharedHubClient` asks the identity hub for a new client at
`${HUB_URL ?? "https://auth.samebase.com"}/hub-clients`, not samebase.com. The repository needs no
Samebase account. `SAMEBASE_URL` is gone.

- A new client logs the link to the terms of the shared sign-in service once.
- A refusal logs the reasons of the hub: `blocked`, `paused`, `suspended`, the caps of an app, and
  the hourly window of a 429 (a repository, an owner, or new owners).

The state store protocol does not change.

## 0.23.0

Requires `alchemy@2.0.0-beta.85` and Effect 4.1: `effect` and `@effect/platform-node` ^4.1.0.
Upgrade Alchemy, its provider packages, and Effect together with this release.

`@effect/platform-node` 4.1 pins its `@effect/platform-node-shared`, so the override that Effect 4.0
needed can go.

The state store protocol does not change.

## 0.22.0

`Convex.SharedHubClient` takes `redirectUri` in place of `deployment`, so a client can serve any
host and any path, such as a Worker or Convex Auth 0's `/api/auth/callback/hub`. samebase.com reads
`/samebase-verification.json` at the origin of `redirectUri`, which must name the numeric GitHub id
of the repository, and no longer asks Convex. Serve the file before the client: put the resource
after the push of the site, and write its three variables with a `Convex.Deployment` that has no
`source`.

- The output `deployment` is gone. A saved client whose `redirectUri` is the new one renews, so a
  stack that passes the same address keeps its client.
- A refusal of samebase.com logs its reason, such as a host that does not serve the file.

## 0.21.0

`alchemy-convex hub-client --env-prefix RESOURCE_HUB` registers a second development client without
replacing the sign-in client. It writes `RESOURCE_HUB_ISSUER`, `RESOURCE_HUB_CLIENT_ID`, and
`RESOURCE_HUB_CLIENT_SECRET`. The default prefix remains `HUB`.

The state store protocol does not change.

## 0.20.0

`Convex.SharedHubClient` gets a client of the central identity hub through samebase.com, for an app
that deploys in its own GitHub Actions run. The workflow needs `permissions: id-token: write` and no
Samebase key.

- Each deploy reads the saved client on the hub with its own token. No failure stops a deploy or a
  destroy: a failed renewal keeps the saved values, and a failed request for a new client gives the
  `no-hub` values.
- A stack card shows the Google sign-in status: on, not set up, or suspended.
- A failed push removes the `Redacted` values of `env` from the output that it quotes, next to the
  deploy key.

## 0.19.1

- A deploy key request from an OAuth token sends only the name. Convex answers HTTP 400 to
  `allowedActions` and `expiresAt` from an OAuth token, so a run with an OAuth token as
  `CONVEX_ACCESS_TOKEN` stopped at its first key.
- White space around the access token no longer reaches a comparison. A run with such an OAuth token
  would otherwise delete its key, which revokes the OAuth token.

## 0.19.0 (unreleased)

The store seals each `Redacted` value, so a row holds no secret in clear text.

- `state:set` and `state:setOutput` are actions that seal with AES-256-GCM before they write. `get`,
  `replaced`, and `getOutput` open the values for a run. `readStack` and `reader:repository` give
  the rows as they are stored, without their secrets.
- Each key is one variable `STATE_KEY_<keyId>` of the store deployment, and a sealed value names its
  key. A run that finds no key makes one and never reads it back. A transaction in the store chooses
  the current key, so two first runs cannot replace a key that a row needs.
- `state:reseal` seals every value under the current key. Each run asks `state:sealing` if a reseal
  finished, and runs one if not, so a run that stopped leaves no row in clear text for long. This
  also finishes a key rotation.
- This is store version 5. Upgrade every repository of a team on the same day: the first run of this
  version pushes the store, and an older client stops with an error.
- The key of a run on the store can also run internal actions.
- `@samebase/alchemy-convex/sealed-secret` exports the sealing functions.

## 0.18.0 (unreleased)

The command `alchemy-convex stack-comment` keeps one comment on a pull request with a card for each
stack of the repository at the stage of the pull request.

- Run it as a step of a pull request workflow after every deploy. It needs `CONVEX_ACCESS_TOKEN`,
  `GITHUB_TOKEN`, and the permission `pull-requests: write`. The run record gives it the repository
  and the pull request.
- A card shows the folder of the stack, its address, its last run, and its Convex deployments,
  Workers, and R2 buckets. A stack without the stage of the pull request has no card.
- Remove a `GitHub.Comment` from the stack. A comment that a stack declares can show only that
  stack.

## 0.17.0 (unreleased)

The hub is the project `identity-hub`, a name that says what the project holds.

- `Convex.HubClient` and the command `alchemy-convex hub-client` find the hub in the project
  `identity-hub`. Rename the project with `PATCH /projects/{project_id}` and `name: "identity-hub"`.
  The slug does not matter, because the lookup uses the name.
- Upgrade every stack that has a hub client together with the rename. A run on an older version
  fails with a clear error when it must register or delete a client. A new preview that fails this
  way keeps its deployment, so rerun the stack after the upgrade, or destroy the stage. A deployment
  whose client exists keeps working, because a deploy calls the hub only for a change.

## 0.16.0 (unreleased)

The state store has its own project again, `alchemy-state-store`, the name of the Cloudflare state
store of Alchemy. The store and the identity hub have opposite owners: the package pushes the store,
and a team forks and edits the hub. In one deployment, a broken hub deploy stops every stack of the
team, and each store change has to reach the hub first.

- `Convex.state()` finds or creates `alchemy-state-store`. Copy the rows of the old project first,
  or the first run of each stack starts with no state. Move every repository of a team together.
- `Convex.HubClient` finds the hub in the project `samebase`, which it now names as
  `HUB_PROJECT_NAME`.
- The store app of this package is the only app that serves the store, so `state:host`,
  `OutdatedBase`, and the exports `./state/*` go. The store version stays 4.

## 0.15.0 (unreleased)

`Convex.HubClient` registers a deployment as a client of the identity hub of the team, with the
Convex credential of the stack. It replaces `IdentityHub.Client` of
`@samebase/alchemy-identity-hub`, which needed a registration token and the address of the hub. A
client that a stack registered with the old resource stays: the resource type is the same, and a
deploy with the same redirect URI stores the new props and does not reach the hub. The first deploy
needs a hub with `@samebase/identity-broker` 0.7.0.

The command `alchemy-convex hub-client` does the same for a development deployment.

## 0.14.1 (unreleased)

A base app compiles the exported store functions under its own tsconfig. `reader:repository` reads
its custom claims with bracket access, so a base app with `noPropertyAccessFromIndexSignature` needs
no change. No function changes.

## 0.14.0 (unreleased)

The package exports the functions of the state store, so that the base app of a team serves the
store next to its own components. `Convex.state()` never pushes its store app over a base. The store
version stays 4, so a consumer on 0.13.0 keeps working and moves when it wants to.

- New function `state:host` answers `"seed"` for the store app of this package and `"base"` for the
  base app of a team. A store without it is a seed. No other function, argument, result, or row
  changes.
- `STORE_VERSION` rises only when a function that a released client calls changes or goes away. Each
  consumer needs the exact number, so only such a change moves every consumer of a team at once.
- The package exports the store functions as code, and its store app `src/store/convex` uses the
  same exports:
  - `@samebase/alchemy-convex/state/functions`: `stateFunctions(alchemyState, host)`, the twelve
    internal `state:*` functions, and `readerFunctions(alchemyState)`, `reader:authorize` and
    `reader:repository`.
  - `@samebase/alchemy-convex/state/auth.config`: `authConfig(cloudUrl)`, the auth config that
    verifies the read tokens.
  - `@samebase/alchemy-convex/state/_generated/component.js`: the `ComponentApi` type, which the
    Convex codegen of an app that mounts the component imports.

  A base app mounts the component and writes three files; see
  [the design note](docs/design/convex-state.md#the-stores-functions-are-exported-and-a-base-is-never-pushed-over-0140).

- `Convex.state()` never pushes its store app over a base, because the push replaces every function
  of the deployment. A base that answers an older store version fails the run with `OutdatedBase`
  (exported): upgrade `@samebase/alchemy-convex` in the base app and push the base app. A newer
  store fails the run as before, from either host.
- `reader:repository` accepts only a token of the deployment's own issuer, so a base that accepts
  other auth providers does not widen who can read a repository.

## 0.13.0 (unreleased)

The state project of a team is named `samebase`.

- Breaking: `Convex.state({ team })` finds or creates the project `samebase` (was `alchemy-state`).
  A team renames its existing project before the first run of this version, with the Management API
  (`PATCH /projects/{project_id}`, name and slug) or the dashboard, and upgrades every consumer at
  the same time: a run of either version that does not find its project creates an empty one. The
  rows do not move.
- The package exports the state component as `@samebase/alchemy-convex/state/convex.config`, for an
  app that mounts it next to other components. The functions of the store app stay in this package;
  a mounting app writes its own wrappers.

## 0.12.0 (unreleased)

The state store is a Convex component: store version 4. The store functions, their arguments, and
their results do not change.

- Breaking: the next provider run pushes store version 4. The rows are now in the tables of the
  component `alchemyState`. The rows of store version 3 stay in the root tables, and the store does
  not read them, so a run that comes after the push and before the move plans each resource as new.
  A team whose store has rows moves them once, with the steps in
  [the design note](docs/design/convex-state.md#the-store-is-a-component-store-version-4).
- The store app `src/store/convex` mounts the component of `src/store/component` and sends each
  `state:*` function to it. `reader:authorize` and `reader:repository` stay in the app, because they
  use `ctx.auth`. The package does not export the component yet.
- The dashboard shows the rows under the component `alchemyState`.

## 0.11.0 (unreleased)

Works with Alchemy 2.0.0-beta.84. The code, the resources, the state store, and its data do not
change.

- Breaking: peer dependency `alchemy` is `2.0.0-beta.84` (was `2.0.0-beta.83`). Upgrade `alchemy`
  together with this version. The `effect` and `@effect/platform-node` peer ranges are `^4.0.5`
  (were `^4.0.0`), the ranges that `alchemy` 2.0.0-beta.84 requires.
- Alchemy 2.0.0-beta.84 moves its providers into separate packages. Import Cloudflare from
  `@alchemy.run/cloudflare` (was `alchemy/Cloudflare`) and GitHub from `@alchemy.run/github` (was
  `alchemy/GitHub`), and install them at `2.0.0-beta.84`. `Cloudflare.providers()` and
  `Cloudflare.state()` keep their names.
- `state: Convex.state({ team })` does not change. The stack still takes the state layer, and
  `alchemy state` without `--backend` reads it from the stack file. `STORE_VERSION` stays 3, so the
  first run does not push the store.
- Development dependencies: `alchemy` 2.0.0-beta.84, `effect`, `@effect/platform-node`, and
  `@effect/vitest` 4.0.5, and the new `@alchemy.run/cloudflare` 2.0.0-beta.84 for `examples/app`.
  `pnpm-workspace.yaml` excludes these exact beta versions, and the `@alchemy.run/*` and
  `@distilled.cloud/*` versions that they install, from `minimumReleaseAge`.

## 0.10.0 (unreleased)

- `bindComponent` connects the installed name of a Convex component, as in the app's
  `convex.config.ts`, to a native Alchemy namespace. The connection is stored in the deployment
  resource's native bindings and is included in the existing live reader. Component connections can
  change without a code push or resource replacement. Environment variables, component installation,
  and resource removal policies stay with their existing owners.

## 0.9.0 (unreleased)

- The state store supports native Convex subscriptions through `reader:repository`. An internal
  `reader:authorize` mutation issues a five-minute token for one repository. The store uses its own
  Convex signing key and public JWKS endpoint. Tokens do not permit state writes. Secret values
  marked with `__redacted__` are removed before a subscription returns data.
- Resource writes and deletes now record the current run in the same transaction. A first deploy
  appears before its final output is written. `state:readStack` includes the current `record` of
  each stage; `getOutput` stays null until the stack writes an output. The reader lists a stage only
  after a 0.9.0 run writes to it.
- Store version 3 is pushed on the next provider run. Convex 1.48.0 or newer is required.
- A store that is newer than the package fails the run with both versions.

## 0.8.0 (unreleased)

`Convex.Deployment` takes `rootDir`: the app directory, relative to the directory where the deploy
runs (the directory of the stack file), `"."` by default. The push runs in it, and `source` and
`source.include` are relative to it. State always holds it, `"."` included, so a reader of the state
places each deployment under its app folder, with the same rule as a Cloudflare Worker.

- Breaking: the push no longer runs in the nearest directory above `source` with a package.json. A
  stack file outside the app directory needs `rootDir`, such as
  `{ rootDir: "apps/web", source: "./convex" }` in place of `{ source: "apps/web/convex" }`. Without
  it, the run stops with `SourceMismatch` before the push. A stack file in the app directory needs
  no change.
- `rootDir` must have a package.json (`ConvexAppNotFound`, which has the field `rootDir` in place of
  `source`). `SourceMismatch` names the app directory too. For a deployment in state, the source
  checks also run in the plan, so a wrong `rootDir` stops the run before Alchemy writes the new
  props to state.
- An absolute `rootDir` stops the stack when it declares the resource, with the defect
  `AbsoluteRootDir`, so it never reaches the plan or state.
- The default content hash also covers the functions directory when convex.json puts it outside
  `rootDir`, such as `"functions": "../shared/convex"`.
- The first run after the upgrade plans one `update` for each `Convex.Deployment`, which writes
  `rootDir` to its state row. When the app directory did not move, the update changes nothing in
  Convex: no push, no deploy key, only reads. The lockfile is part of the content hash, so when the
  upgrade changed the lockfile, that run also pushes the same functions once.
- `Convex.Deployment` is a function over the resource class that writes `rootDir` into the props. It
  keeps the fields of the resource class (`Type`, `Props`, `Self`, `Provider`, `Aliases`, `ref`), so
  `Provider.collection` still takes it. It takes `rootDir` as a plain string and the props as an
  object, not as an Effect. `Convex.DeploymentInput` is the type of its props.
- `Convex.state()` passes the directory of its store as `rootDir` to the push. The store, its
  version, and its function names do not change.

## 0.7.0 (unreleased)

The stage output records its run. `Convex.state()` stores the stack's output plus the key
`samebase.run`:
`{ version: 1, repository, stackFile, branch, pullRequest, headCommit, runUrl, source, recordedAt }`,
from the GitHub Actions variables and the event payload, or from git on a laptop, which needs a
branch and an `origin` remote with `owner/name`. `getOutput` gives the document back as stored. A
checkout that gives no record, such as a tarball without git or a detached HEAD, still reads, plans,
and destroys: its outputs are written without the record, and the log says why.

- `src/RunRecord.ts` derives the record with no Convex dependency, so any state layer can add it.
  `stackFile` is the working directory below the git top level plus `alchemy.run.ts`: Alchemy does
  not expose the `--config` path to a state layer.
- The store function `state:readStack({ stack })` answers every stage of a stack with its resources
  and output in one call. `STORE_VERSION` is 2, so the first run of this version pushes the store in
  place; the rows and the names of version 1 stay.

## 0.6.1 (unreleased)

A team access token works. 0.6.0 resolved a team slug through the dashboard's team list, which a
team access token cannot read (HTTP 403 `NotAllowed`), so every run with `CONVEX_ACCESS_TOKEN` from
the dashboard failed with `team lookup for "<slug>" failed with HTTP 403`.

- `resolveTeamId` reads `GET /token_details` first. A team access token names its team there; a
  configured slug is checked against the `teamSlug` of the team's projects, so a token of another
  team fails the run instead of putting resources and state into its own team, and a team without a
  project asks for the numeric id. The Convex CLI login and a personal token get HTTP 403
  `NotOAuthTeamToken` from it and keep the slug lookup in the dashboard's team list. A project
  access token is refused with the reason.
- `Convex.state()` takes no `team` with a team access token. `Convex.Project` still needs `team`.

## 0.6.0 (unreleased)

One state project for each Convex team. `state: Convex.state({ team })` keeps the state of every
stack and stage of the team in the production deployment of the project `alchemy-state`, which the
first run creates. The `alchemyState` component, `@samebase/alchemy-convex/convex.config`, and
`CONVEX_STATE_DEPLOY_KEY` are gone, so a repository holds one secret, the team token, and a stack
can create and destroy its own project.

- The store functions are internal and pushed by the package itself, from `src/store/convex`, with
  the Convex CLI of the app, when `state:version` is missing or older. A newer store serves an older
  package as it is and is never replaced. Every function keeps its name; `version` is new, and
  `stacks` and `stages` also list a stage that has only an output.
- Each run gets a deploy key of the store deployment with `deployment:functions:runInternalQueries`
  and `runInternalMutations` only, deleted at the end of the run, and replaced once when a call gets
  HTTP 401 or 403. A reader of the index needs `runInternalQueries`; `deployment:data:view` does not
  run an internal function.
- Two first runs of a team that both create `alchemy-state` end on the oldest project: the other run
  deletes its own empty project.
- `Convex.state({ team })` takes the team, like `Convex.Project`. The 0.5.0 state in an
  `alchemyState` component is not read: run the first deploy with `--adopt` so that the resources of
  the stack are taken over.
- `withPushKey` takes the key actions, and `createDeployKey`, `deleteDeployKey`, `installedCli`,
  `findProjectByName`, `getProjectById`, `prodDeploymentOf`, and `createProject` are exported from
  their modules for the store.

## 0.5.0 (2026-10-20)

Alchemy state in Convex. `state: Convex.state()` keeps the stack's state in an `alchemyState`
component that the app mounts from `@samebase/alchemy-convex/convex.config`, in the production
deployment of the project, so a stack needs no Cloudflare or S3 store.

- The store calls the component the way `convex run --component` does, so Convex checks the key:
  `CONVEX_STATE_DEPLOY_KEY`, a production deploy key with `deployment:data:view` and
  `deployment:data:write`, on every run including preview runs. A preview run can therefore read and
  write production tables; it cannot push code or change variables.
- First run: with no component on the deployment, writes stay in memory until the deployment push
  installs it, then they are written. A run that ends with unsaved state fails.
- No lock: keep one CI concurrency group per stage.
- The rows hold the JSON text Alchemy writes to local state files; nothing is re-encoded.

## 0.4.1 (2026-10-20)

Current dependencies. The code and the resources do not change.

- Peer dependency `alchemy`: `2.0.0-beta.80` to `2.0.0-beta.83`. Upgrade Alchemy together with this
  version. The `effect` and `@effect/platform-node` peer ranges stay `^4.0.0`.
- Use one version for `effect` and for each `@effect/*` package. `@effect/platform-node-shared`
  4.0.5 imports `make` from `effect/Path`, and `effect` 4.0.3 does not have it. Alchemy then cannot
  load `@effect/platform-node` and stops.

Development dependencies, the versions that this release is tested with:

| Package                  | From              | To            |
| ------------------------ | ----------------- | ------------- |
| `effect`                 | 4.0.0             | 4.0.4         |
| `@effect/platform-node`  | 4.0.0             | 4.0.4         |
| `@effect/vitest`         | 4.0.0             | 4.0.4         |
| `alchemy`                | 2.0.0-beta.80     | 2.0.0-beta.83 |
| `vite-plus`              | 0.3.0             | 1.1.0         |
| `vitest`                 | ^4.0.0 (4.1.11)   | 5.0.3         |
| `typescript`             | ^5.9.0 (5.9.3)    | 6.0.3         |
| `@types/node`            | ^24.0.0 (24.19.1) | 24.19.2       |
| `convex`                 | ^1.45.0 (1.46.0)  | 1.46.0        |
| `@arethetypeswrong/core` | ^0.18.5           | 0.18.5        |
| `publint`                | ^0.3.25           | 0.3.25        |
| `packageManager`         | pnpm 11.18.0      | pnpm 11.28.5  |

- Every development dependency now has an exact version. The lockfile has one version of each
  `effect` and `@effect/*` package (4.0.4).
- `pnpm-workspace.yaml` sets `minimumReleaseAge` to 7 days, the rule of `renovate.json`. pnpm checks
  each lockfile entry against it.
- `pnpm-workspace.yaml` overrides `vite` and `vitest` with the versions that `vite-plus` bundles.
  Then `vp test`, `@effect/vitest`, and `alchemy/Test/Vitest` use one Vitest copy. With two copies,
  the tests stop with "Vitest failed to find the current suite".

Not updated:

- `effect` and `@effect/*` 4.0.5, `convex` 1.47.0, `vite-plus` 1.2.0 and 1.3.0, and pnpm 11.28.6:
  released less than 7 days ago.
- `vitest` 5.0.4: `vite-plus` 1.1.0 bundles 5.0.3, and the tests need one Vitest copy.
- `typescript` 7.0.2: `vp pack` emits declarations with TypeScript 7 only through an experimental
  API and fails the build.
- `@types/node` 26: this package runs on Node 24 (`.node-version`) and Node 22 (`engines`).
- pnpm 12: a major version. It gets its own pull request.

## 0.4.0 (2026-10-20)

The Convex plane. `Convex.Deployment` now owns the push, so no deploy key goes from one resource to
another and nothing is shaped for Workers Builds. Breaking: see the removed resources.

- `Convex.Deployment` takes `project` (a `Convex.Project` or `{ projectId }`) in place of
  `projectId`, and optional `source` and `env`. `source` is the Convex functions directory. The
  update sets `env`, then runs the installed `convex deploy`. A hash of the source files,
  package.json, convex.json, the lockfile, the deployment name, and `env` is the content identity:
  the same hash is a no-op. New outputs: `hash` and `envNames`.
- The hash covers every file of the app that git does not ignore.
  `source: { path, command, include }` runs a push command, such as
  `convex-hosting deploy --build ...`, with the key in `CONVEX_DEPLOY_KEY`, and `include` narrows
  the hash. `source` must be the functions directory of convex.json (`SourceMismatch`).
- A failed push sets the changed variables back and deletes a dev or preview deployment that the
  same run created. A production deployment with code that is not in state needs `--adopt`.
- With the access token, each push uses a deploy key that expires after two hours and is deleted
  after the push. With `CONVEX_DEPLOY_KEY`, a deploy key of the deployment or a preview deploy key
  of the project pushes with no access token.
- `Convex.Project` takes `{ team, slug }` for an existing project, found with the official
  `GET /teams/{team}/projects/{slug}`. It never creates or renames that project.
- Credentials: `fromValues({ accessToken?, deployKey? })` replaces `fromToken`. `fromConfig` also
  reads `CONVEX_DEPLOY_KEY`.
- Removed: `Convex.Code`, `Convex.Deploy`, `Convex.DeployKey`, `Convex.PreviewDeployKey`,
  `Convex.EnvironmentVariable`, and `Convex.DefaultEnvironmentVariable`. This version has no
  provider for them. Before you upgrade, remove them from the stack and deploy once with 0.3. That
  deploy revokes the keys of removed key resources, so do it only after nothing uses those keys. To
  keep a key or a variable, delete its state record with `alchemy state rm` instead. Then put
  `source` and `env` on the `Convex.Deployment`.

## 0.3.0

One Alchemy stack can now own a Convex app end to end: it creates the deployment, pushes the
functions, and gives the URLs to a Cloudflare Worker or a Vite site.

- `Convex.Deployment`: `{ projectId, type: "prod" }` takes over the project's default production
  deployment, and follows it when another production deployment becomes the default.
  `{ projectId, type: "dev" | "preview", name }` creates a dev deployment with `name` as its
  reference, or a preview deployment with `name` as its preview name, through
  `POST /projects/{project_id}/create_deployment`. Outputs `name`, `url`, `siteUrl`, `type`,
  `projectId`, `reference`, and `previewName`.
- `Convex.Deployment` keeps every deployment by default (removal policy `retain`) and never deletes
  a production deployment: delete reads the live type first. A dev or preview deployment that is not
  in state is taken over only with `--adopt`, and the resource never creates over it. A change of
  `projectId`, `type`, or `name` stops the deploy with `DeploymentIdentityChange`. An expired
  preview deployment is created again on the next deploy.
- `Convex.Code`: pushes the functions with the `convex` package that `cwd` resolves, on every
  deploy. The deploy key goes only into an env file with mode 0600 that is removed after the run.
  The CLI output stays out of the logs, and a failure shows its last lines without the key. The key
  must fit the deployment before the push, and the CLI must name the same deployment after it. A
  preview deploy key pushes with `--preview-name`. `env` sets deployment variables before the push.
  Outputs `url`, `siteUrl`, `deploymentName`, `deployedAt`, and `envNames`.
- `Convex.Deploy` is deprecated. It keeps working, so that stacks and state from 0.1 and 0.2 do not
  break. Use `Convex.Code` with a `Convex.Deployment`.
- `parseDeployOutput` moves to `Convex.Code`. The export from the package stays the same.

## 0.2.0

Data safety release. An accident can no longer delete a Convex project or its data, revoke the wrong
deploy key, or overwrite an environment variable.

- `Convex.Project` keeps the project by default (removal policy `retain`). To delete the project
  with the resource, add `RemovalPolicy.destroy()`. State from 0.1 records `destroy`: run one deploy
  with 0.2 before you remove a project or run `alchemy destroy`.
- `Convex.Project` never replaces a project. A `name` change renames it in place with
  `PATCH /projects/{project_id}`. A `team`, `deploymentType`, or `deploymentRegion` change stops the
  deploy with `ProjectTeamChange` or `ProjectDeploymentChange`.
- `Convex.Project` with state uses only the project id in state. The name lookup reads all pages,
  matches the exact name, fails with `AmbiguousProject` for two matches, and takes a project over
  only with `--adopt`.
- `Convex.DeployKey` and `Convex.PreviewDeployKey` request a name that is unique to each resource:
  the `name` prop, a dash, and 12 hex characters of a hash of the resource identity. They store the
  numeric key id, delete only by the secret, and fail with `DeployKeyRecoveryRequired` when the key
  list does not show exactly one key with the requested name. A key that is the OAuth credential
  itself fails with `DeployKeyIsCredential` and is never kept or deleted. Keys created by 0.1 keep
  working, but 0.2 does not delete them: delete them in the Convex dashboard when you remove or
  replace them.
- `Convex.EnvironmentVariable` and `Convex.DefaultEnvironmentVariable` overwrite an existing value
  that is not in state only with `--adopt`. Their writes run again after a write conflict or a 5xx
  answer, and a create checks again before each attempt. `EnvironmentVariable` keeps the deploy key
  of its deployment in the outputs, and read and delete use it.
- A change of a variable's `name` or `deployment` (a default's `projectId`, `name`, or
  `deploymentType`) stops the deploy with `VariableIdentityChange`. In 0.1 it replaced the resource.
  To rename or move a variable, create a new resource with a new logical id and remove the old one.
  A replacement or a rename in place needs a cleanup step that can fail and leave a variable or a
  revoked deploy key behind, so 0.2 has neither.
- `Convex.Deploy` always pushes a preview deploy (`previewName` or `previewCreate`), because a
  preview deployment can expire.
- Expected failures are typed errors that name the fix, not defects.

## 0.1.0

First release, pinned to `alchemy@2.0.0-beta.80` and Effect 4.

- `Convex.Project`: create, adopt by name with `--adopt`, replace on property change, delete.
- `Convex.DeployKey` and `Convex.PreviewDeployKey`: create, find by unique listed name, replace on
  change, delete by name.
- `Convex.EnvironmentVariable`: set and remove one variable on one deployment through the deployment
  API.
- `Convex.DefaultEnvironmentVariable`: project defaults that new deployments of a type inherit, such
  as auth keys for every preview deployment.
- `Convex.Deploy`: run `npx convex deploy` with a deploy key and expose the deployment URL, memoized
  by content hash.
- Credentials from `CONVEX_ACCESS_TOKEN`, then the Convex CLI login.
