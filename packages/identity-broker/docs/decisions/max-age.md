# A positive max_age goes to the provider

## Decision

The broker keeps no session, so the provider decides the age of a login. A positive `max_age` goes
upstream as itself to an OIDC connector with `maxAge: true`, and the broker accepts the login when
the id_token's `auth_time` is not later than now plus 60 seconds and not older than `max_age`, with
no tolerance. Else the app gets `login_required`. `prompt=login` and `max_age=0` stay forced logins.

## The standard

OpenID Connect Core 1.0,
[section 3.1.2.1](https://openid.net/specs/openid-connect-core-1_0.html#AuthRequest), on `max_age`:
"Specifies the allowable elapsed time in seconds since the last time the End-User was actively
authenticated by the OP. If the elapsed time is greater than this value, the OP MUST attempt to
actively re-authenticate the End-User." and "When max_age is used, the ID Token returned MUST
include an auth_time Claim Value. Note that max_age=0 is equivalent to prompt=login."

[Section 2](https://openid.net/specs/openid-connect-core-1_0.html#IDToken), on `auth_time`: "Time
when the End-User authentication occurred." and "When a max_age request is made or when auth_time is
requested as an Essential Claim, then this Claim is REQUIRED; otherwise, its inclusion is OPTIONAL."

[Section 15.1](https://openid.net/specs/openid-connect-core-1_0.html#rfc.section.15.1): "OPs MUST
support enforcing a maximum authentication age via the max_age parameter, as defined in Section
3.1.2 (Authorization Endpoint)."

## Precedent

Keycloak's OIDC identity provider has the `passMaxAge` switch. With it, Keycloak
[sends the app's `max_age` upstream](https://github.com/keycloak/keycloak/blob/7c669fece57e90b95b801fca0759cb5ef525abd6/services/src/main/java/org/keycloak/broker/oidc/OIDCIdentityProvider.java#L1013-L1029),
[reads the upstream `auth_time`](https://github.com/keycloak/keycloak/blob/7c669fece57e90b95b801fca0759cb5ef525abd6/services/src/main/java/org/keycloak/broker/oidc/OIDCIdentityProvider.java#L335-L361),
[fails a login older than the age](https://github.com/keycloak/keycloak/blob/7c669fece57e90b95b801fca0759cb5ef525abd6/services/src/main/java/org/keycloak/broker/oidc/OIDCIdentityProvider.java#L430-L446),
and
[does not try again](https://github.com/keycloak/keycloak/blob/7c669fece57e90b95b801fca0759cb5ef525abd6/tests/base/src/test/java/org/keycloak/tests/broker/oidc/KcOidcBrokerPassMaxAgeTest.java#L84-L119).

The others keep a session of their own, check the age against it, and do not send it upstream:

- Dex:
  [the generic OIDC connector](https://github.com/dexidp/dex/blob/2c8caf40500829dbd02c6fb89f77e7179f3ae74b/connector/oidc/oidc.go#L478-L512).
- ZITADEL:
  [the generic OIDC provider](https://github.com/zitadel/zitadel/blob/c02ad5dd570f9d8c42445284276d782464263933/internal/idp/providers/oidc/oidc.go#L141-L170).
- Authentik:
  [the generic OIDC source](https://github.com/goauthentik/authentik/blob/db141a444e482fe81583e4537f46eb5088041868/authentik/sources/oauth/views/redirect.py#L36-L67).
- Ory Hydra:
  [asks its login app for a new login](https://github.com/ory/hydra/blob/4174065ffb052799890f7480f5360a877a67ffc1/consent/strategy_default.go#L115-L169).
- Auth0 is the exception: a connection can
  [map `max_age` into `upstream_params`](https://auth0.com/docs/authenticate/identity-providers/pass-parameters-to-idps#available-fields).

## Rejected

- A forced login for every `max_age`, as 0.40.0 did. It asks for more than the standard: a login of
  a minute ago satisfies `max_age=300`. The conformance module `oidcc-max-age-10000` then passed
  only when two forced logins fell in one clock second. It stays for a connector with `promptLogin`
  and no `maxAge`, where a new login is the only evidence the broker can get.
- A second, forced login attempt when `auth_time` is old or missing. The standard does not require
  it, Keycloak does not do it, and the callback would have to send a claimed request upstream again
  with a new state, nonce and PKCE pair. The app can send `max_age=0` itself.
- A change of the conformance expectations. The expectations file has no honest entry for a result
  that depends on the clock, and a fake provider with a frozen clock would hide two logins.

## Not verified

- Which real providers obey `max_age` and return a true `auth_time`, and how far their clocks
  differ: an operator sets `maxAge` only after checking the provider. Google keeps it off.
- Whether an app relied on a positive `max_age` to force a new login.
