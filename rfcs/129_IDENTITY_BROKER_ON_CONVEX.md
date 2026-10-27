# 129 Identity broker on Convex

## Document Control

- Status: Proposal
- Owner: Nicu Chiciuc
- Created: 2026-10-28
- Base: `origin/main` at `3e5d7c658` (v2158)
- Evidence: the Convex Auth v2 generic OAuth method installed at
  `apps/samebase/node_modules/@convex-dev/auth` (2.0.0-beta.0), the Samebase MCP OAuth server in
  `apps/samebase/convex/mcp/oauth.ts`, the Samebase email sender in `apps/samebase/convex/email.ts`,
  the standards cited inline, and the prior-art survey in the session notes of 2026-10-27 and
  2026-10-28 (Dex, codefox-inc/convex-oauth-provider, WorkOS AuthKit, Cloudflare Access)
- Related: `rfcs/128_SAMEBASE_SSR_WITH_COOKIE_SESSIONS_ROLLOUT.md` (Convex Auth 2 in Samebase),
  `specs/117_MANUAL_PASSWORD_AUTH_SPEC.md`,
  `rfcs/062_MCP_DUAL_ORIGIN_CONSENT_LOGIN_REDIRECT_SPEC.md` (the MCP authorization server),
  `research/2026-08-28-sidebars-package-publishing.md` (how a package leaves this monorepo),
  `research/2026-06-22-cloudflare-oauth-apps-mcp-fit.md`

## Summary

1. The per-project cost of login is not code. It is credentials bound to a domain: an OAuth client
   whose callback URL is registered at GitHub or Google, and an email sender with a verified domain
   and an API token. Convex Auth puts the OAuth callback on each deployment's `CONVEX_SITE_URL`, so
   every dev and preview deployment needs its own registration, and in practice previews cannot use
   GitHub sign-in. The fallback today is email and password plus a Cloudflare Email token copied
   into every app.
2. This RFC adds an identity broker: one Convex deployment per team that holds the GitHub app, the
   Google client, and the email sender once, and acts as an OpenID Provider for the team's apps. The
   broker keeps no user accounts and no login sessions. Every sign-in goes upstream again, and the
   broker returns an `id_token` from which each app creates its own user with its own Convex Auth.
   Apps keep separate accounts. The broker is a hub of provider connections, not a hub of accounts.
3. The broker is a Convex component, `@samebase/identity-broker` in `packages/identity-broker`. It
   is built in this monorepo, imports nothing from `apps/samebase`, and is published like
   `packages/sidebars`. The first mount is the Samebase deployment at `https://auth.samebase.com`.
   The consumer side needs no new library: a Convex Auth v2 app points its generic OAuth method at
   the broker, and its deploy scripts register each deployment's callback URL with the broker.
4. The design follows OAuth 2.1, OpenID Connect Core and Discovery, RFC 7591 and RFC 7592 for client
   registration, RFC 8414 for metadata, RFC 9207 for the `iss` response parameter, and RFC 9700 for
   the security profile. The differentiator is the runtime: one Convex deployment, no Docker, no
   database to run, one key pair to generate.

## Facts

- Convex Auth v2 (2.0.0-beta.0) ships a generic OAuth method, `setupOauth`, in
  `dist/methods/oauth/server.d.ts`. Its catalog names `authorizationEndpoint`, `tokenEndpoint`,
  `issuer`, optional `userInfoEndpoints`, `scopes`, and a `profile` mapping. Each OAuth component
  instance reads `CLIENT_ID` and `CLIENT_SECRET` from its own component env, serves its callback at
  `<CONVEX_SITE_URL><httpPrefix>/callback`, always sends PKCE S256, posts `client_id`,
  `client_secret` and `code_verifier` to the token endpoint (`lib/oauth/callback.js:98`), and checks
  the `id_token` claims: `iss` in the catalog list, `aud` exactly the client id, `azp` if present
  (`lib/oauth/callback.js:143`). So a broker that is a plain OpenID Provider with
  `client_secret_post` needs no app-side code beyond a catalog constant and one env pair.
- Convex Auth v1 (0.0.94, the `templates/base` version) carries the Auth.js redirect proxy only as a
  TODO (`dist/server/provider_utils.js:72`, `dist/server/oauth/authorizationUrl.js:26`). Convex Auth
  v2 fixes the callback to the deployment URL. Neither solves preview deployments.
- Samebase already runs an OAuth 2.1 authorization server for MCP clients with dynamic client
  registration, PKCE, exact redirect URI checks, consent, refresh token rotation, and audit rows
  (`apps/samebase/convex/mcp/oauth.ts`, routes at `apps/samebase/convex/http.ts:91` to `:117`). It
  issues opaque access tokens looked up by hash, not JWTs. Its authorize flow signs the user in with
  Samebase accounts, which the broker must not do for end users of other apps.
- Samebase sends email through Cloudflare Email with `CLOUDFLARE_EMAIL_API_TOKEN` and
  `CLOUDFLARE_EMAIL_ACCOUNT_ID` (`apps/samebase/convex/email.ts:50`). That is the per-app setup the
  broker centralizes.
- Convex 1.48.0 adds `ctx.auth.signJwt` (ES256, deployment key, issuer fixed to the deployment's
  `CONVEX_CLOUD_URL`, max one hour). It is not usable for this broker: OpenID Connect requires RS256
  support from every OP
  ([Core 15.1](https://openid.net/specs/openid-connect-core-1_0.html#ServerMTI)) and Discovery
  requires the metadata document under the issuer URL
  ([Discovery 4](https://openid.net/specs/openid-connect-discovery-1_0.html#ProviderConfig)), which
  `convex.cloud` does not serve.
- Prior art. Dex ([dexidp.io](https://dexidp.io/docs/connectors/)) is a federated OpenID Provider
  with upstream connectors and no user accounts; it stores clients, auth requests, codes, refresh
  tokens and keys, builds `sub` from the connector id and the upstream user id, and has no RFC 7591
  support. [codefox-inc/convex-oauth-provider](https://github.com/codefox-inc/convex-oauth-provider)
  is a beta Convex component that is an OAuth 2.1 and OIDC provider for MCP clients. Nothing
  documents one Convex deployment as the login server for many Convex apps.
  [Convex Auth issue 49](https://github.com/convex/convex-auth/issues/49) asks for shared auth
  across domains and is open since 2024.
- Preview deployments get their own deployment name and `CONVEX_SITE_URL`, and they are deleted
  after 5 days (14 on paid plans)
  ([preview deployments](https://docs.convex.dev/production/hosting/preview-deployments)). Project
  default environment variables apply to new deployments of each type
  ([environment variables](https://docs.convex.dev/production/environment-variables)).

## Target

One sign-in, with Bristol as the app and GitHub as the connector:

1. Bristol's client calls its Convex Auth `startSignInWithHub({ redirectTo })`. The mutation records
   the request and returns the broker authorization URL:
   `https://auth.samebase.com/authorize?response_type=code&client_id=<bristol>&redirect_uri=https://<bristol-deployment>.convex.site/oauth/hub/callback&scope=openid%20email%20profile&state=<s>&nonce=<n>&code_challenge=<c>&code_challenge_method=S256&connector=github`.
2. The broker checks the client, compares `redirect_uri` with the registered list by simple string
   comparison, stores the authorization request for ten minutes, and, because `connector=github`
   names a configured connector and the client is first-party, redirects straight to GitHub with its
   own `state` and PKCE pair. Without `connector`, it renders a minimal page: the client name and
   one button per connector.
3. GitHub returns to `https://auth.samebase.com/connectors/github/callback`. The broker exchanges
   the code with the broker's GitHub secret, reads the GitHub user, mints a one-time authorization
   code bound to Bristol's request, and redirects to Bristol's `redirect_uri` with `code`, `state`
   and `iss=https://auth.samebase.com`.
4. Bristol's Convex Auth callback posts `code`, `client_id`, `client_secret` and `code_verifier` to
   `https://auth.samebase.com/token`. The broker verifies the PKCE challenge and the secret, and
   returns `id_token`, a short-lived `access_token` for `/userinfo`, `token_type`, `expires_in`.
   Bristol's Convex Auth validates `iss`, `aud` and `nonce`, runs Bristol's `createUser` callback
   with the mapped profile, and issues Bristol's own session.
5. The broker deletes the authorization request and the code. It keeps one audit row: client id,
   connector, the subject, and the time. No email, no name, no token.

The user saw Bristol, then GitHub, then Bristol. The broker was invisible.

The email connector replaces step 2 and 3 with a six-digit code: the broker sends the code through
the host app's sender, shows one input, verifies the code with an attempt limit, and continues at
step 3 with `email_verified: true`.

## Standards

| Area                                                                           | Standard                                                                                                                                                                                        | What the broker does                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authorization code flow, PKCE, redirect URI matching, `iss` response parameter | [OAuth 2.1 draft 16](https://datatracker.ietf.org/doc/draft-ietf-oauth-v2-1/), [RFC 9207](https://www.rfc-editor.org/rfc/rfc9207)                                                               | Code flow only. PKCE S256 required for every client, public or confidential. Exact string comparison of `redirect_uri`; loopback `http://127.0.0.1:<port>` accepted with any port. `iss` on every authorization response. No implicit, no password grant.                                                                                                                                                                                   |
| ID token, claims, `sub`, `prompt`, `max_age`, `nonce`                          | [OIDC Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html)                                                                                                                          | `iss`, `sub`, `aud`, `exp`, `iat`, `auth_time`, and `nonce` when sent. `sub` is stable per issuer and at most 255 ASCII characters. `prompt=none` returns `login_required` because the broker has no session. `prompt=login` and `max_age` are always satisfied because every sign-in reauthenticates upstream; `auth_time` is the upstream completion time.                                                                                |
| Metadata                                                                       | [OIDC Discovery](https://openid.net/specs/openid-connect-discovery-1_0.html), [RFC 8414](https://www.rfc-editor.org/rfc/rfc8414)                                                                | `/.well-known/openid-configuration` and `/.well-known/oauth-authorization-server` with the same content. The issuer has no path, so both documents sit at the same place. `id_token_signing_alg_values_supported` lists RS256 and ES256. `code_challenge_methods_supported: ["S256"]`, `authorization_response_iss_parameter_supported: true`, `subject_types_supported: ["public"]`.                                                       |
| Client registration                                                            | [RFC 7591](https://www.rfc-editor.org/rfc/rfc7591), [RFC 7592](https://www.rfc-editor.org/rfc/rfc7592)                                                                                          | `POST /register` requires an initial access token minted by the hub admin. The response carries `client_id`, `client_secret` for `client_secret_post` or `client_secret_basic`, none for `token_endpoint_auth_method: "none"`, and `registration_access_token` plus `registration_client_uri` for `GET`, `PUT` and `DELETE` on the client configuration. `software_id` identifies the app across its deployments. Open registration is off. |
| Keys                                                                           | [RFC 7517](https://www.rfc-editor.org/rfc/rfc7517), [RFC 7518](https://www.rfc-editor.org/rfc/rfc7518), [OIDC Core 10.1.1](https://openid.net/specs/openid-connect-core-1_0.html#RotateSigKeys) | JWKS at `/.well-known/jwks.json` with `kid` on every key and token. One current signing key, retired keys kept in the set for 14 days. RS256 default, ES256 optional.                                                                                                                                                                                                                                                                       |
| Security profile                                                               | [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700)                                                                                                                                              | No pattern matching on redirect URIs (4.1.3). Distinct callback path per upstream connector, which is the mix-up defense of 4.4.2.2 for the broker as a client of GitHub and Google. The broker authenticates the user before any redirect and auto-redirects upstream only for first-party clients (4.11). A `code_verifier` without a stored `code_challenge` is rejected (4.8.2). Codes are single use and expire after 60 seconds.      |
| UserInfo                                                                       | [OIDC Core 5.3](https://openid.net/specs/openid-connect-core-1_0.html#UserInfo)                                                                                                                 | `GET /userinfo` with the access token from the token response. The access token is a broker-signed JWT with `aud` equal to the issuer, five minutes, usable only there.                                                                                                                                                                                                                                                                     |

Named deviations and gaps:

- No refresh tokens and no `offline_access`. Apps hold their own sessions. Dex differs here.
- No sessions at the broker, so no single sign-on across apps. This is the point, not a gap.
- Email codes have no standard. NIST SP 800-63B says email is not an out-of-band authenticator. The
  broker carries the result in `email_verified` and sets no `amr` value. This matches what the apps
  do today with email and password; it does not make it stronger.
- Public subjects, not pairwise. Pairwise subjects need one sector identifier per client, and
  preview hosts change, so each preview would see new subjects unless every app registers a
  `sector_identifier_uri`. The apps belong to one team and already receive `email`, so cross-app
  correlation is not a threat the broker needs to prevent. Decision 5 records this.
- The "dynamic OP" profile of OIDC Core 15.2 requires implicit response types, which OAuth 2.1
  removes. The broker follows OAuth 2.1.

## Changes

### Phase 1. The package

`packages/identity-broker`, a Convex component built with `defineComponent`, following
`$convex-create-component` and `docs/code-guardrails.md`.

Tables, all inside the component:

- `clients`: `clientId`, `secretHash` (absent for public clients), `tokenEndpointAuthMethod`,
  `redirectUris` as a list of `{ uri, touchedAt }`, `clientName`, `softwareId`, `firstParty`,
  `registrationAccessTokenHash`, `createdAt`, `updatedAt`.
- `registrationTokens`: `tokenHash`, `label`, `expiresAt`, `remainingUses`, `createdAt`.
- `authRequests`: `clientId`, `redirectUri`, `state`, `nonce`, `scope`, `codeChallenge`,
  `connector`, `status` as the first field of a union (`pending`, `upstream`, `completed`),
  `expiresAt`, the upstream `state` and `codeVerifier` while `upstream`, the claims snapshot while
  `completed`.
- `authorizationCodes`: `codeHash`, `authRequestId`, `expiresAt`, `usedAt`.
- `emailCodes`: `authRequestId`, `email`, `codeHash`, `attempts`, `expiresAt`.
- `signIns`: `clientId`, `connector`, `sub`, `at`.

Keys live in the host app's env as a JSON JWK set in `IDENTITY_BROKER_PRIVATE_KEYS`, one entry
marked current. `npx @samebase/identity-broker keys` generates a key, and `keys --rotate` adds a new
current key and keeps the old one. Public keys are derived at request time.

HTTP routes, mounted at the issuer root and refused unless the `Host` header equals the issuer host:
`/.well-known/openid-configuration`, `/.well-known/oauth-authorization-server`,
`/.well-known/jwks.json`, `/authorize` (GET), `/register` (POST), `/register/:clientId` (GET, PUT,
DELETE with the registration access token), `/token` (POST), `/userinfo` (GET),
`/connectors/<name>/callback` (GET), `/connectors/email` (POST for the code form).

Connectors, chosen at mount time: `github` and `google` with `CLIENT_ID` and `CLIENT_SECRET` per
connector in the component env, and `email` with a host-provided sender function reference, in the
same shape Convex Auth v2 uses for user callbacks. The upstream OAuth code copies the catalog shape
of Convex Auth v2's generic method rather than importing its internal `lib/oauth` paths, which are
not public exports.

`sub` is `base64url(<connector>:<upstream account id>)`, plus the private claims `connector` and
`connector_account_id`. Standard claims: `email`, `email_verified`, `name`, `picture` when the
connector provides them.

Tests use real payloads from GitHub and Google, mutated only for negative cases, per the guardrails.
The conformance test runs `openid-client` as an independent relying party against the component in
`convex-test`: discovery, registration with an initial access token, code flow with PKCE and
`nonce`, token validation, userinfo, and the rejections (wrong `redirect_uri`, reused code, missing
`code_challenge`, expired request, bad secret).

### Phase 2. The first hub in Samebase

- `app.use(identityBroker, { env: { ... } })` in `apps/samebase/convex/convex.config.ts`, with the
  GitHub and Google credentials of two new OAuth apps registered once for
  `https://auth.samebase.com/connectors/<name>/callback`, and the email sender bound to the existing
  `sendEmail` action.
- `auth.samebase.com` routed to the Samebase deployment: a Convex custom domain for the deployment's
  HTTP actions, with a Cloudflare proxied record in front like `samebase.com`. If the deployment
  cannot carry a second custom domain, a Cloudflare Worker route for `auth.samebase.com/*` forwards
  to the deployment's `convex.site` origin. Decision 3.
- Hub administration inside Samebase, additive and minimal: a list of registration tokens with
  create and revoke, and a list of clients with their redirect URIs and a revoke action.
  Organization owners only, under the existing access model.
- The MCP authorization server stays as it is. Decision 6.

### Phase 3. The consumer path in the starter

In `samebase/base-hosting` (Convex Auth 2.0.0-beta.0):

- A `hub` sign-in method:
  `setupOauth(auth, "hub", hubCatalog, callbacks, { component: components.authHub, allowedRedirectOrigins })`
  with the component mounted at `httpPrefix: "/oauth/hub"` in `convex.config.ts`. The catalog is the
  broker issuer, `/authorize`, `/token`, scopes `openid email profile`, and a `profile` mapping from
  the `id_token` claims. Component env: `CLIENT_ID` and `CLIENT_SECRET` from `HUB_CLIENT_ID` and
  `HUB_CLIENT_SECRET`.
- `scripts/register-hub-callback.ts`: reads `HUB_REGISTRATION_ACCESS_TOKEN` and the current
  deployment's `CONVEX_SITE_URL`, and `PUT`s the client configuration with this deployment's
  callback URL added and its `touchedAt` refreshed. `pnpm run dev --once`, `deploy` and
  `deploy:preview` run it after the deployment exists.
- One-time setup per app:
  `npx @samebase/identity-broker register --hub https://auth.samebase.com --token <initial access token> --name Bristol`
  prints `HUB_CLIENT_ID`, `HUB_CLIENT_SECRET` and `HUB_REGISTRATION_ACCESS_TOKEN`, which the
  developer stores as Convex project default env vars for dev and preview and as production env
  vars. Samebase provisioning does this step in Phase 4.
- Bristol is the first consumer, then the Samebase-made personal apps.

### Phase 4. Samebase provisioning

When Samebase creates or repairs an app whose organization has a hub, it registers the client with
the organization's initial access token, writes the three env vars as project defaults and
production values, and adds the production callback URL. This phase gets its own plan after Phase 3
has run on two apps.

## Decisions

1. **A broker, not an account hub.** The broker keeps no users and no sessions. Reason: the
   requirement is shared provider connections with separate accounts per app, and an account hub
   brings branding, consent, an account page, and data-controller duties that the apps do not want.
2. **Hub-managed RS256 keys and a public issuer URL, not `ctx.auth.signJwt`.** Reason: OIDC requires
   RS256 support and the metadata document under the issuer URL; `signJwt` is ES256 only with an
   issuer on `convex.cloud`. Cost: one env var generated by one command, as Convex Auth v1 did.
   Revisit if Convex adds configurable issuers and RS256.
3. **Issuer `https://auth.samebase.com`, no path.** Reason: OIDC Discovery and RFC 8414 place the
   well-known segment on different sides of a path; a host-only issuer serves both at one place.
   Fallback if a second custom domain is impossible: a Worker route, not a path.
4. **One client per app, many redirect URIs, registered per deployment through RFC 7592.** Reason:
   OAuth 2.1 and RFC 9700 forbid pattern matching, preview names are random, and one client keeps
   `aud` and `sub` identical across prod, dev and previews. The registration access token and the
   client secret are shared by all deployments of the app, which is the same trust the GitHub secret
   has today. Redirect URIs not touched for 30 days are dropped. Alternative not taken: one client
   per deployment through RFC 7591, which multiplies clients and needs `npx convex env set` on each
   preview, which the docs do not confirm. Later simplification to evaluate: the Client ID Metadata
   Document draft, where the deployment URL is the client id and no registration is stored.
5. **Public subjects, `base64url(connector:id)`.** Reason: pairwise subjects break across preview
   hosts without a `sector_identifier_uri` per app, and the apps already get `email`.
6. **The MCP authorization server stays separate for now.** Reason: it issues opaque tokens for
   Samebase's own resource with Samebase accounts and scopes, which is a different product boundary.
   Shared helpers (`redirectUriMatchesRegistered`, PKCE S256 verification) move into the package
   only when the MCP server imports them back; the package never imports from `apps/samebase`.
7. **Built in the monorepo, published from it.** Reason: the monorepo is private until token
   management is fixed, and `packages/sidebars` already proves the export path to a separate public
   repository. The package has no Samebase imports, so the move is a copy.
8. **First-party auto-redirect, consent for others.** Reason: RFC 9700 4.11. Clients registered with
   an initial access token are first-party. Open registration stays off until a consent page exists.

## Validation

- Phase 1: the `openid-client` conformance test above, plus the real-payload parser tests.
- Phase 2: a GitHub sign-in to a scratch Convex Auth v2 app through `auth.samebase.com` from a dev
  deployment and from a preview deployment, with the callback registered by the script and without
  any change at GitHub. The audit row shows the client and the connector and nothing else.
- Phase 3: Bristol signs in through the hub on prod, dev and a preview; the Bristol GitHub OAuth app
  is deleted afterwards.
- A log and screenshot check that no token, code, or email appears in Convex logs.

## Non-Goals

- Single sign-on across apps, sessions at the broker, refresh tokens, `offline_access`.
- MFA, passkeys, SAML, account management, a hosted account page.
- Replacing the MCP authorization server or Samebase's own login.
- Serving other teams from `auth.samebase.com`. Another team mounts the component in its own Convex
  deployment.

## Open Questions

- Does one Convex deployment carry two custom domains for HTTP actions? Decision 3 has the fallback.
- Package name: `@samebase/identity-broker` or a product name.
- Whether Samebase's own login should later move onto the broker it hosts, which would make the MCP
  consent flow a client of it.
