# Standards

The broker invents as little as it can. This page lists every standard it relies on, the sections it
relies on, and how far it goes. "Implemented" describes the use named in the row, not the whole
document. A deliberate difference is a named departure in [design.md](design.md).

## Protocol

| Standard                                                                                                 | Sections                                  | Used for                                                                      | Status                                               |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------- |
| [RFC 6749](https://www.rfc-editor.org/rfc/rfc6749.html), OAuth 2.0                                       | 2, 3, 4.1, 5, 6, Appendix B               | Confidential clients, code and refresh grants, scopes, errors                 | Partly: code and resource refresh grants             |
| [RFC 8707](https://www.rfc-editor.org/rfc/rfc8707.html), resource indicators                             | 2, 2.1, 2.2                               | Select and bind one configured API resource                                   | Implemented for resource authorization               |
| [RFC 7009](https://www.rfc-editor.org/rfc/rfc7009.html), token revocation                                | 2.1, 2.2                                  | Authenticated removal of a broker refresh grant                               | Refresh tokens only                                  |
| [OAuth 2.1, draft 16](https://datatracker.ietf.org/doc/draft-ietf-oauth-v2-1/16/)                        | 2.4, 4.1                                  | The code flow with mandatory S256, and `iss` on responses                     | Partly: a draft, so it can change                    |
| [RFC 7636](https://www.rfc-editor.org/rfc/rfc7636.html), PKCE                                            | 4.1 to 4.6                                | S256 challenge and verifier, in both directions                               | Implemented, S256 only                               |
| [OpenID Connect Core 1.0, errata set 2](https://openid.net/specs/openid-connect-core-1_0.html)           | 2, 3.1, 5.1 to 5.4, 8.1, 9, 10            | ID Tokens, claims, UserInfo, pairwise subjects, signing                       | Partly: see the departures in [design.md](design.md) |
| [OpenID Connect Discovery 1.0, errata set 2](https://openid.net/specs/openid-connect-discovery-1_0.html) | 3, 4                                      | The provider's metadata, and reading an upstream provider's                   | Implemented                                          |
| [RFC 8414](https://www.rfc-editor.org/rfc/rfc8414.html)                                                  | 2, 3                                      | OAuth server metadata and its well-known location                             | Implemented                                          |
| [RFC 9207](https://www.rfc-editor.org/rfc/rfc9207.html)                                                  | 2, 3                                      | `iss` on authorization responses, and checking it upstream                    | Implemented                                          |
| [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html), OAuth security BCP                              | 2.1.1, 2.2.2, 4.1.3, 4.4, 4.7, 4.14, 4.16 | PKCE, exact redirects, mix-up and CSRF defenses, confidential refresh binding | Implemented for these sections                       |
| [RFC 6750](https://www.rfc-editor.org/rfc/rfc6750.html), Bearer tokens                                   | 2.1, 3                                    | The UserInfo endpoint and its challenges                                      | Implemented, the header method only                  |
| [RFC 7591](https://www.rfc-editor.org/rfc/rfc7591.html), dynamic client registration                     | 3.2.1                                     | The client information that `/register/<client>` answers with                 | Partly: no `/register`, the host creates clients     |
| [RFC 7592](https://www.rfc-editor.org/rfc/rfc7592.html), client management (Experimental)                | 2.1, 2.3                                  | Read and delete with a token of one client                                    | Partly: no update, see the departures                |

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

The host creates each client in its own mutation, with `newClientCredentials` and
`component.registration.register`, after its own proof of who asks. The hub's `POST /hub-clients`
takes the OIDC token of a GitHub Actions run or the app's own token. No standard covers this step,
and none needs to: RFC 6749 section 2 leaves the means of registration open, as in a provider's own
console.

With `registration` set, each client holds a registration access token for its own record at
`/register/<client>` (RFC 7592). After that, a client is an ordinary confidential OAuth client.

## Not implemented

- RFC 7591 `POST /register` and OpenID Connect Dynamic Client Registration. RFC 7592 update (`PUT`)
  is not implemented.
- Refresh tokens for sign-in: apps keep their own sessions. Resource refresh requires confidential
  client authentication and keeps the broker token stable, as RFC 6749 section 6 permits.
- RFC 8693 token exchange: resource authorization uses the authorization-code grant, not a
  `subject_token` exchange. The upstream provider integration does not define a new wire protocol.
- Request Objects: `request` and `request_uri` answer `request_not_supported` and
  `request_uri_not_supported`.
- The implicit and hybrid flows, and session management and logout.

## Certification

The broker is not OpenID Certified, and the conformance suite has not been run against it. The
Config OP profile is the realistic first target. The Basic OP test plan cannot pass as it stands,
because its requests omit PKCE, which the broker requires.
