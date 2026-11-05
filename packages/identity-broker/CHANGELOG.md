# Changelog

## 0.16.0

- `registration.register` takes `deploymentType: "development"`, for a client on a laptop. It gets a
  removal date 14 days ahead, as a preview client does, and at the cap of an app it can evict any
  row, as a preview client can. `POST /register` still takes `production` and `preview` only.

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
