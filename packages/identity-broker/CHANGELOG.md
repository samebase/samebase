# Changelog

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
