# Changelog

## 0.30.0

- `GET /moderation/clients?owner=<GitHub id>` lists the clients of every repository whose recorded
  owner is that account, newest first, as `{ owner, clients, limitReached }`. Like the full list it
  stops at 500 clients and says so. A transferred repository's clients follow its new owner. The
  `repository` filter is gone, and any parameter other than one `owner` is refused with 400, so a
  caller asking for a filter this version lacks never gets the full list. `tenants` gets the index
  `by_owner_id`.
- `DELETE /moderation/clients/<id>?owner=<GitHub id>` deletes only while the client's repository is
  recorded under that owner, checked in the same transaction, and answers `{ changed: false }`
  otherwise: a console that listed a client for one owner cannot delete it after a transfer.
- The GitHub connection (`githubConnection`) sends `prompt=select_account`, so GitHub shows its
  account picker instead of reusing the account the browser is signed in to, as the `github` sign-in
  connector does with `selectAccount`.

## 0.29.0

- Connector grants and sign-in page exemptions belong to a repository and an owner, not to an app:
  one row covers every app and deployment of the repository. `connectorGrants` is keyed by
  `tenantId`, `ownerId`, and `connector`; a repository exemption's target is
  `{ scope: "repository", tenantId, ownerId }`. Rows of different owners coexist, and a row counts
  while the tenant's recorded owner and the client's are its owner.
- `POST /moderation/connector-grants` takes `repositoryId` (the numeric GitHub id) in place of
  `appId`, and `POST /moderation/sign-in-page` the target
  `{ scope: "repository", repositoryId, expectedOwnerId }`. Neither needs the hub to know the
  repository, so a row can come before its first registration; both answer 409 `owner_changed` for a
  row of another owner than the recorded one, and no longer 404 `unknown_app`. A revoke or a removal
  deletes only the row of the owner it names. The lists answer rows by `repositoryId` and `ownerId`,
  and a client's `signInPage` is `repository` in place of `this_app`.
- Nothing that apps call changes. A hub must delete its grant and exemption rows before it deploys
  this version, and set them again after: Convex does not accept the new shape over old rows.

- An app is a repository plus an exact name: `appIdOf(tenantId, app)` has no `-preview` app. Its
  production, preview, and development clients are clients of that one app, so its connector grants
  and its sign-in page exemption cover all of them.
- An app has two budgets of 30 clients: production, and previews with development servers. Each
  evicts only within itself, by the rules of 0.27.0.
- The grant and exemption lists no longer answer `production`; `connectorGrants.forRegistration`
  takes no `production`. Old `-preview` apps stay until the operator deletes them.

## 0.27.0

- `POST /hub-clients` takes a GitHub Actions token only when its audience is the hub's issuer.
  Before, every hub took the audience `samebase`, so a token that a deploy made for one hub also
  worked at every other hub, and that hub's operator could replay it within its lifetime. Apps ask
  for the new audience with `Convex.SharedHubClient` 0.34. With 0.33 or earlier, a renewal still
  works, and a new client (a new preview, or another connector set) is refused until the app
  upgrades.
- The mark under every page says where the broker comes from: the Samebase square and "Samebase", in
  the color of the links next to it. It no longer says "Managed with", which was not true of a hub
  that someone else runs.

## 0.26.1

- The card of the broker's pages no longer jumps when the page loads with a browser extension that
  adds an element to the body, such as LanguageTool: the card owns the first row of the page's grid,
  and the added element goes into a row below the screen.

## 0.26.0

Connector grants, set by the hub's administrator (RFC 137 decision 10).

- The policy can name only the host's own connectors and API resources: `google()`, `github()`, and
  the resource providers return their names as literal types, and `defineIdentityBroker` passes them
  to the policy's `connectors` and `resources`, so a misspelt name does not compile. Keep the
  connector list without a `Connector[]` annotation, which would widen the names to `string`.

- A new table, `connectorGrants`: one row per broker app (a repository's production app, or its
  preview app with its development clients) and connector, bound to the repository's recorded owner.
  Additive: no data to clear.
- A grant adds its connector to what the host's policy gives the app's clients: a client may enroll
  in and use the policy's connectors and its app's granted ones, of the host's configured
  connectors. A row counts only while the tenant's recorded owner and the owner that registered the
  client are the row's owner; at registration, the owner of the incoming proof. It counts again if
  the repository comes back to that owner.
- Every step reads the grants in its own transaction: `POST /hub-clients` and both creating
  mutations (`policyConnectors` goes to them, and a grant revoked while the host checked answers
  `400 invalid_connectors` with the allowed names), `/authorize`'s stored set (`authRequests.create`
  takes the decision, decides the set with the grants of its own transaction, and answers it, and
  the page renders that set; `off` when none is left), `/continue`, the callback's claim and
  completion, and code exchange. Revoking a grant stops a sign-in at its next step; issued tokens
  and app sessions stay. `decision.connectors` stays the policy's part, and the host adds the grants
  that the client's facts carry (`granted` on `clients.withApp`) with `usableNow`.
- A grant counts only for one of the host's configured connectors: the decision carries them
  (`configured`), and the creating mutations take `configuredConnectors`, so a connector removed
  from the host's configuration stops at the next step, a kept grant of it included.
- `GET /moderation/connector-grants` answers the host's connector names and every grant, each with
  its owner and whether it is `active`; `POST /moderation/connector-grants` grants or revokes one,
  with a reason and the admin's email, and appends a `connector_grant_change` event in the same
  transaction. Granting answers 409 `owner_changed` when the recorded owner is not the one the admin
  saw, 404 `unknown_app` for an app the broker does not have, and 400 `unknown_connector` for a
  connector the host does not configure. Revoking answers 409 `owner_changed` when the row is bound
  to another owner than the one the admin saw, and needs neither the app nor the connector, so a row
  of an app that `apps.remove` deleted, which would count again when the app registers again, or of
  a connector the host dropped can always go.
- The clients of `/moderation/clients` carry `policyConnectors`, `usableConnectors`, and
  `grantedConnectors`.
- Grants give no API resource and skip no sign-in page; exemptions grant no connector.

## 0.25.0

Exemptions from the sign-in page, set by the hub's administrator (RFC 137 decision 5, as amended).

- A new table, `signInPageExemptions`: one row for every app, or one for a broker app (a
  repository's production app, or its preview app with its development clients), bound to the
  repository's recorded owner. Additive: no data to clear.
- The policy loses `consent`: it answers `{ connectors, resources, paused }` from the registration's
  facts. In hub mode the sign-in page shows for every client unless an exemption covers it, every
  app or its app; the exemptions are the one lever, and the broker applies them. A hub that skipped
  the page in its policy sets an exemption on its admin page instead. The policy never sees the
  exemptions. Only `/authorize` reads them, with the client's facts in one query
  (`clients.forAuthorize`), and the moderation list; never from a request. A one-app row counts only
  while the tenant's recorded owner and the owner that registered the client are the row's owner.
- `GET /moderation/sign-in-page` lists them, each one-app row with its owner and whether it is
  `active` (bound to the repository's recorded owner now), and `POST /moderation/sign-in-page` sets
  or removes one, with a reason and the admin's email, and appends a `sign_in_page_change` event in
  the same transaction. Setting a one-app row answers 409 `owner_changed` when the recorded owner is
  not the one the admin saw, removing one when the row is bound to another owner than the one the
  admin saw, and 404 `unknown_app` for an app the broker does not have.
- The clients of `/moderation/clients` carry `ownerId`, the tenant's recorded owner, and
  `signInPage`, by the rule `/authorize` applies: `shown`, or skipped by `every_app` or `this_app`.
- The page is decided at `/authorize` only: a sign-in that passed it finishes with that decision.
  Removing an exemption is not a revocation; a block is.
- A plain OAuth connector takes `selectAccount`, as an OIDC connector does, and `github()` passes it
  on: GitHub then shows its account picker on each sign-in (`prompt=select_account`).

## 0.24.1

- The hub's pages are as tall as the phone screen with the browser's address bar shown (`100svh`),
  so they no longer scroll a little on a phone.

## 0.24.0

One hub model (RFC 137): connectors by enrollment, and the policy as hub code.

- `apps` loses `firstParty` and `connector`; `clients` and the authorization requests gain
  `connectors`. Clear `apps`, `clients`, `authRequests`, `authorizationCodes`, `resourceRequests`,
  and `refreshGrants` before the deploy: the first two change shape, and the other four point at
  them. Every deployment then registers a new client at its next deploy, and users of API resources
  connect their providers again.
- `POST /hub-clients` takes `connectors`: at least one name, `[a-z0-9-]{1,64}`, duplicates
  collapsed. Each must be one of the hub's connectors and one that the policy allows, else
  `400 invalid_connectors` with the allowed names. The enrollment is per client and never changes;
  the 201 answer and the RFC 7592 record repeat it. `registration.register` takes `connectors` too.
  `Convex.SharedHubClient` of `@samebase/alchemy-convex` 0.33.0 sends it.
- `registration` is `{ name, terms, privacy, moderationKey, policy }`. `ownRepositoryIds`,
  `thirdPartyConnector`, and `paused` go; `reserved` on a connector goes. `policy` decides, from a
  registration's facts, the connectors it may enroll in and use, the API resources (by provider
  name) its client may authorize, whether the sign-in page asks for consent, and whether it is
  paused. It runs at registration and at each use, on the client's and the tenant's rows. A throwing
  or malformed policy refuses the request. Without hub mode every client may use its enrollment and
  every resource.
- `connector` on `/authorize` is a space-delimited list. One name goes straight to the connector
  when the policy asks for no consent; none offers every connector the client may use; several offer
  those. A name outside the enrollment answers `invalid_request`; an enrolled connector that the
  policy no longer allows is not offered, and none left is "Sign-in is off" (403). `/continue`, the
  callback, and code exchange accept only a connector in the request's set, the enrollment, and the
  policy of the moment. Discovery adds `connectors_supported`.
- One sign-in page: a "Continue with" button per offered connector, with the consent (host, deploy,
  repository, what the app gets) when the policy asks for it, also for production clients. Every
  refusal before the user continued is an error page of the hub; after, every outcome goes to the
  return address.
- A pause refuses registration, sign-in, API authorization, callback completion, code exchange, and
  refresh before the provider; reads, renewals, revocation, self-delete, and moderation stay. A
  callback completion decides the policy again after the provider answered, and the mutation that
  issues the code reads the blocks, the owner, the enrollment, and the request's set once more. A
  refresh has two policy evaluations, admission and release; a refused release, also one whose read
  of the client failed, keeps the rotation and answers `401 invalid_client`.
- A bound browser that comes back to a callback too late, or while the policy fails, or whose client
  is gone, goes back to the app with an authorization error instead of a page of the hub.
- A log of a provider failure names a standard OAuth error code or the exception's class, never the
  provider's text.
- The sign-in budget per tenant applies to every app.
- Model-based tests: property A gains `policyAtRegistration` and `enrollmentImmutable`, property B
  the pause and a withdrawn resource under `noTokenAfterStop`, and property C (sign-in) proves
  `enrollmentHonored`, `noSignInWhenStopped`, `codeSingleUse`, and `connectorClaimIsOne`.

## 0.23.0

- `registration.name` is required: the hub's name as users know it, which the consent page uses in
  "<name> has not reviewed this app."
- `registration.privacy` is required: the hub's privacy notice. The sign-in page links it and
  `registration.terms` under its card, as Google's user data policy and GDPR articles 13 and 14 ask
  of the service that passes users' data on.
- A third-party app's preview or development client shows a consent page before its connector: the
  host that gets the sign-in, the GitHub repository, the deploy, and what the app receives, with
  Continue. It has no Cancel: the browser's Back does that. Production clients go straight to the
  connector as before.
- A third-party app whose connector is not configured answers an error page instead of the chooser,
  which offered the host's own connectors.
- The broker's pages (consent, chooser, errors) are one card that follows the system's light or dark
  theme. A connector button shows its provider's mark: Google's G in Google's own button colors, and
  GitHub's mark.

## 0.22.0

Fixes from the RFC 136 security review, each found by a model-based test that now guards it.

- A registration that is refused writes nothing past the repository and owner counts of `admit`: the
  initial access tokens of another owner go only when the registration succeeds.
- A new owner counts in the new-owners window when its registration succeeds, not when it is
  admitted, so failed host checks cannot use up the window for everyone. A full window found after
  the host check answers `429 rate_limited` with `window: "new_owners"`. `rateLimits` loses
  `newOwnersWindowStartedAt`: clear the table, then deploy. A deploy that still finds a row with the
  field (a request in between) fails and changes nothing: clear again and deploy again.
- `POST /hub-clients` requires `iat` in GitHub's token, and `tenants.ownerProofIssuedAt` keeps the
  newest one. A token of another owner that is not newer, the same second included, is refused with
  `403 stale_proof`, so a retained token cannot move a transferred repository back.
- A provider refresh reads the client, its app, and the blocks again after the provider answers: a
  block or a client delete in that time answers `401 invalid_client`. Each attempt finishes or fails
  the grant only while its own claim holds it (`attempt` on `claimRefresh`, `finishRefresh`,
  `failRefresh`), so an attempt that another attempt took over changes nothing.
- A client that deletes itself, or that the cap evicts, loses its refresh grants. API authorization
  of a blocked app answers 403 before it goes to the provider.

## 0.21.0

- `GET /moderation/clients?repository=<GitHub id>`, with the parameter once per repository (at most
  100), answers every client of those repositories, newest first, as `{ clients }`, and
  `DELETE /moderation/clients/<client id>` deletes one client and its provider grants, as
  `{ changed }`. Both take the moderation key, so a hub's console can show each developer the
  clients of their own repositories.
- `clients.remove` answers `{ changed }`, false for a client that was already gone.

## 0.20.0

- `clients.app` and `clients.registeredBy` are required. Remove `tenants.disconnected` and
  `migration.importHubRows`. Upgrade from 0.18.0 through 0.19.0 and its import: a client row without
  both fields fails this deploy.

## 0.19.0

The broker holds every row and every rule of a hub (RFC 135). A hub is configuration only.

- `registration` in the config is the hub mode, with the options `ownRepositoryIds`,
  `thirdPartyConnector` (a reserved connector), `paused`, `moderationKey`, and `terms`, all
  required. It mounts `POST /hub-clients`, where a GitHub Actions run (GitHub's OIDC token) or a
  laptop (the app's initial access token) gets a client, and `/moderation/*` for the hub's
  administrator, next to `/register/<client>`.
- New tables: `blocks`, the one block state that registration, renewal, sign-in, and code exchange
  read; `events`, the append-only history of registrations and block changes; `initialAccessTokens`;
  `rateLimits`. Each client has `app` and `registeredBy`.
- `moderation.setBlock` replaces `registration.switchConnection` and `registration.setOwnerBlocked`.
  The table `blockedOwners` is removed; `tenants.disconnected` is read by nothing.
- `registration.register` takes `app` and `registeredBy`, for a host that proves its callers in
  another way. `clients.list` is removed: `moderation.clientList` lists the clients with who made
  them.
- Upgrade from a hub that kept these rows itself: deploy, then call `migration.importHubRows` with
  its rows while registration is paused. 0.20.0 makes `app` and `registeredBy` required and removes
  `migration` and `tenants.disconnected`.

## 0.18.0

- The host's own mutation is the only way to make a client: `newClientCredentials` and
  `registration.register`. Remove the admin functions `createApp`, `registerClient`, and
  `renewClient`, and the component mutations `apps.create`, `clients.create`, and `clients.renew`. A
  client renews at `GET /register/<client>` (RFC 7592), which stays with `DELETE`.
- Remove `POST /register` and `POST /tenant-connection`, the `initialAccessToken` and `connector`
  options of `RegistrationConfig`, and `registration.setConnection`. Discovery names no
  `registration_endpoint`. `registration.switchConnection` sets `disconnected` only, and
  `tenants.connectionRevision` is removed: clear it from the rows before you deploy.
- Remove the admin function `setTenantSuspended`, `registration.setSuspended`, and
  `tenants.suspendedAt`. `registration.switchConnection` and `registration.setOwnerBlocked` are the
  only switches.
- id_tokens and UserInfo no longer carry `connector_account_id`, and discovery no longer lists it.
  Read the provider's id from `sub`, `<provider>:<id>`.
- Schema: `apps.tenantId`, `clients.registrationTokenHash`, and `clients.renewedAt` are required;
  `apps.allowedCallbackHosts` and `tenants.suspendedAt` are gone. Delete the rows that lack them
  before the upgrade: the apps without a tenant and their clients.

## 0.17.0

- Public subjects (OIDC Core section 8): `sub` is `<provider>:<upstreamId>`, such as
  `google:104325...`, the same in every app and every broker. Discovery says
  `subject_types_supported: ["public"]`. Every existing user of every app gets a new `sub` once; an
  app that finds its users by email or by `connector_account_id` keeps them. docs/design.md records
  why the pairwise subjects stopped.
- Each connector has a required `provider`. `google()` sets `google` and `github()` sets `github`,
  whatever the connector's name. `defineIdentityBroker` refuses a provider that is not `[a-z0-9-]+`
  and two connectors of one provider with two issuers.
- `IDENTITY_BROKER_KEYS` holds no salt. `createKeySet` and `rotateKeySet` write none, and
  `parseKeySet` reads none, so a key set from before still parses. Remove `appSalt`,
  `pairwiseSubject`, and `rotateKeySetWithoutOverlap`: `keys --rotate --no-overlap` prints a new key
  set.
- `registration.register` takes `trust`: `{ firstParty: true }` for an app of the host, or
  `{ firstParty: false, connector }` in place of `connector`. An existing app of the other kind
  answers `app_taken`.
- The sign-in budget of a tenant and the pause apply to third-party apps only, also when a
  first-party app has a tenant.
- A provider refresh is refused while the client's tenant is suspended or disconnected, or its owner
  is blocked, as a code exchange is. A revocation still works.

## 0.16.0

- `registration.register` takes `deploymentType: "development"`, for a client on a laptop. It gets a
  removal date 14 days ahead, as a preview client does, and at the cap of an app it can evict any
  row, as a preview client can. `POST /register` still takes `production` and `preview` only.
- Remove `registration.recordOwner`. Its one caller, a one-time import of the host, has run.

## 0.15.0

- Add the admin function `renewClient({ clientId, expires })`. It answers whether the client exists,
  sets `renewedAt`, and moves a removal date 14 days forward. With `expires: true`, a preview or
  development client without a removal date gets one. A production client never gets one.
- `registerClient` takes an optional `expires`. With `true`, a preview or development client gets a
  removal date 14 days ahead. Without it, the client gets no removal date, as before.
- A resource authorization and a provider refresh move the removal date 14 days forward, as a
  sign-in does.
- `clients.create` takes a required `expires`, and `clients.renew` is new.

## 0.14.0

- Add `clients.list`, which lists the clients of every app, first-party apps included, newest first
  and at most `limit`.

## 0.13.0

- Add an owner switch. `registration.register` takes an optional `ownerId` and records it on the
  tenant, and `registration.setOwnerBlocked` blocks an owner. A tenant whose owner is blocked is
  refused on registration, renewal, sign-in start, and code exchange, as a suspended or disconnected
  tenant is. `registration.recordOwner` records the owner of a tenant that has none.
- Add `registration.switchConnection`, which the host calls in its own transaction to connect or
  disconnect a tenant. It raises the stored revision by one, and leaves the administrator's
  suspension as it is.
- Add a management-only registration mode: leave out `registration.initialAccessToken`, and
  `POST /register`, `/tenant-connection`, and `registration_endpoint` in discovery are not served.
  Each client still reads and deletes its own record with its own token, and `paused` still stops
  sign-in.
- Add `broker.newClientCredentials()` for a host that creates clients in its own mutation, and
  `@samebase/identity-broker/test` to register the component in a host's convex-test backend.

## 0.12.0

- Add Convex team and Cloudflare API authorization through RFC 6749 authorization code, S256 PKCE,
  and RFC 8707 resource indicators. Sign-in keeps its existing OIDC contract.
- Add confidential-client refresh grants with upstream rotation and RFC 7009 revocation. API grants
  stay in the private broker component and create no users.
- Restrict API resources to first-party apps. Bind requests to the browser and client, and stop
  grants when their client is deleted.
