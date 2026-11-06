# Changelog

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
