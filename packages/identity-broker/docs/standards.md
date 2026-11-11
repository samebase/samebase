# Standards

The broker invents as little as it can. This page lists every standard it relies on, the sections it
relies on, and how far it goes. "Implemented" describes the use named in the row, not the whole
document. A deliberate difference is a named departure in [design.md](design.md).

## Protocol

| Standard                                                                                                        | Sections                                  | Used for                                                                                                               | Status                                                                       |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [RFC 6749](https://www.rfc-editor.org/rfc/rfc6749.html), OAuth 2.0                                              | 2, 3, 4.1, 5, 6, Appendix B               | Confidential clients, code and refresh grants, scopes, errors                                                          | Partly: code and resource refresh grants                                     |
| [RFC 8707](https://www.rfc-editor.org/rfc/rfc8707.html), resource indicators                                    | 2, 2.1, 2.2                               | Select and bind one configured API resource                                                                            | Implemented for resource authorization                                       |
| [RFC 7009](https://www.rfc-editor.org/rfc/rfc7009.html), token revocation                                       | 2.1, 2.2                                  | Authenticated removal of a broker refresh grant                                                                        | Refresh tokens only                                                          |
| [OAuth 2.1, draft 16](https://datatracker.ietf.org/doc/draft-ietf-oauth-v2-1/16/)                               | 2.4, 4.1                                  | The code flow with mandatory S256, and `iss` on responses                                                              | Partly: a draft, so it can change                                            |
| [RFC 7636](https://www.rfc-editor.org/rfc/rfc7636.html), PKCE                                                   | 4.1 to 4.6                                | S256 challenge and verifier, in both directions                                                                        | Implemented, S256 only                                                       |
| [OpenID Connect Core 1.0, errata set 2](https://openid.net/specs/openid-connect-core-1_0.html)                  | 2, 3.1, 5.1 to 5.4, 8.1, 9, 10            | ID Tokens, claims, UserInfo, pairwise subjects, signing                                                                | Partly: see the departures in [design.md](design.md)                         |
| [OpenID Connect Discovery 1.0, errata set 2](https://openid.net/specs/openid-connect-discovery-1_0.html)        | 3, 4                                      | The provider's metadata, with `registration_endpoint` and `op_tos_uri` in hub mode, and reading an upstream provider's | Implemented                                                                  |
| [RFC 8414](https://www.rfc-editor.org/rfc/rfc8414.html)                                                         | 2, 3                                      | OAuth server metadata and its well-known location                                                                      | Implemented                                                                  |
| [RFC 9207](https://www.rfc-editor.org/rfc/rfc9207.html)                                                         | 2, 3                                      | `iss` on authorization responses, and checking it upstream                                                             | Implemented                                                                  |
| [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html), OAuth security BCP                                     | 2.1.1, 2.2.2, 4.1.3, 4.4, 4.7, 4.14, 4.16 | PKCE, exact redirects, mix-up and CSRF defenses, confidential refresh binding                                          | Implemented for these sections                                               |
| [RFC 6750](https://www.rfc-editor.org/rfc/rfc6750.html), Bearer tokens                                          | 2.1, 3, 3.1                               | The UserInfo endpoint, the registration endpoint, and the client configuration endpoint, and their challenges          | Implemented, the header method only                                          |
| [RFC 7591](https://www.rfc-editor.org/rfc/rfc7591.html), dynamic client registration                            | 2, 3, 3.1, 3.2.1, 3.2.2                   | The client registration endpoint `POST /register`                                                                      | Implemented, with an initial access token required                           |
| [RFC 7592](https://www.rfc-editor.org/rfc/rfc7592.html), client management (Experimental)                       | 2, 2.1, 2.3, 3                            | Read and delete with the registration access token of one client                                                       | Read and delete; no update (405)                                             |
| [OpenID Connect Dynamic Client Registration 1.0](https://openid.net/specs/openid-connect-registration-1_0.html) | 2, 3, 3.2, 4                              | Client metadata, the registration response, and the client read                                                        | Implemented for `web` clients, with the departures in [design.md](design.md) |

## Tokens and keys

The broker signs and verifies through [`jose`](https://github.com/panva/jose), and talks to upstream
providers through [`oauth4webapi`](https://github.com/panva/oauth4webapi).

| Standard                                                     | Sections | Used for                          | Status                  |
| ------------------------------------------------------------ | -------- | --------------------------------- | ----------------------- |
| [RFC 7519](https://www.rfc-editor.org/rfc/rfc7519.html), JWT | 4, 7     | Token claims, signing, validation | Implemented             |
| [RFC 7515](https://www.rfc-editor.org/rfc/rfc7515.html), JWS | 2, 4, 5  | Compact signatures and headers    | Implemented             |
| [RFC 7518](https://www.rfc-editor.org/rfc/rfc7518.html), JWA | 3.3, 6.3 | RS256 and RSA key parameters      | Implemented, RS256 only |
| [RFC 7517](https://www.rfc-editor.org/rfc/rfc7517.html), JWK | 4, 5     | Keys and the public key set       | Implemented             |

## The web underneath

| Standard                                                                                                                                                                  | Sections                   | Used for                                            | Status                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | --------------------------------------------------- | ------------------------------- |
| [RFC 6265](https://www.rfc-editor.org/rfc/rfc6265.html) and [6265bis, draft 22](https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis-22)                   | 4.1, 4.2; 4.1.2.7, 4.1.3.2 | `Secure`, `HttpOnly`, `SameSite=Lax`, and `__Host-` | Implemented; 6265bis is a draft |
| [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html), HTTP                                                                                                             | 8.3, 11.6.1, 15.5.2        | Media types, authentication, status codes           | Implemented                     |
| [RFC 3986](https://www.rfc-editor.org/rfc/rfc3986.html), [RFC 4648](https://www.rfc-editor.org/rfc/rfc4648.html), [RFC 8259](https://www.rfc-editor.org/rfc/rfc8259.html) | 6.2.1; 5; 4, 8.1           | URI comparison, base64url, JSON                     | Implemented                     |

## Client registration

With `registration` set, the hub serves the client registration endpoint of RFC 7591 at
`POST /register`, and each client reads or deletes its own record at `/register/<client>` with its
registration access token (RFC 7592). The initial access token is GitHub's OIDC token of a GitHub
Actions run or the app's own token. How that token is made and checked is the one part outside the
standard: RFC 7591 section 3 leaves it out of scope. After registration, a client is an ordinary
confidential OAuth client.

Without hub mode, the host creates each client in its own mutation, with `newClientCredentials` and
`component.registration.register`, after its own proof of who asks.

## Not implemented

- RFC 7592 update (`PUT`).
- Software statements (RFC 7591 section 2.3).
- Open registration, without an initial access token.
- `native` clients.
- Refresh tokens for sign-in: apps keep their own sessions. Resource refresh requires confidential
  client authentication and keeps the broker token stable, as RFC 6749 section 6 permits.
- RFC 8693 token exchange: resource authorization uses the authorization-code grant, not a
  `subject_token` exchange. The upstream provider integration does not define a new wire protocol.
- Request Objects: `request` and `request_uri` answer `request_not_supported` and
  `request_uri_not_supported`.
- The implicit and hybrid flows, and session management and logout.

## Certification

The broker is not OpenID Certified. On 2026-11-07 the OpenID Foundation conformance suite ran
against a local hub with a fake upstream connector. The Config OP plan passes once the suite is told
about the `connectors_supported` extension. The Basic OP plan cannot pass as it stands, because its
requests omit PKCE, which the broker requires. With PKCE added by a test adapter, 13 of its modules
pass and none fails. The modules that stop are named departures in docs/design.md: the hub's error
page before the user continued, no sessions for `prompt=none`, and a fresh login only through a
connector that can reauthenticate. The registration endpoints were not run against the OpenID
Foundation's dynamic registration test plans.
