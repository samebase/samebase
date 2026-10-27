# 129 Identity broker on Convex

## Document Control

- Status: Proposal
- Owner: Nicu Chiciuc
- Created: 2026-10-28
- Base: `origin/main` at `3e5d7c658` (v2158)
- Revised on 2026-10-28 after one Codex design review: dedicated hub deployment instead of a mount
  in the Samebase app, one client per deployment through RFC 7591 instead of a shared client updated
  through RFC 7592, pairwise subjects with the app as the sector, lifecycle values fixed.
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
   Apps keep separate accounts, and each app sees its own pairwise subjects. The broker is a hub of
   provider connections, not a hub of accounts.
3. The broker is a Convex component, `@samebase/identity-broker` in `packages/identity-broker`, plus
   a small host app, `apps/identity-hub`, that mounts it. The hub runs as its own Convex deployment
   at `https://auth.samebase.com`, not inside the Samebase app. The package imports nothing from
   `apps/samebase` and is published like `packages/sidebars`. The consumer side needs no new
   library: a Convex Auth v2 app points its generic OAuth method at the broker, and its deploy step
   registers each deployment as a client.
4. The design follows OAuth 2.1, OpenID Connect Core and Discovery, RFC 7591 for client
   registration, RFC 8414 for metadata, RFC 9207 for the `iss` response parameter, and RFC 9700 for
   the security profile. Every departure is named in the Standards section. The differentiator is
   the runtime: one Convex deployment, no Docker, no database to run, one key pair to generate.

## Facts

- Convex Auth v2 (2.0.0-beta.0) ships a generic OAuth method, `setupOauth`, exported at
  `@convex-dev/auth/methods/oauth/server`. Its catalog names `authorizationEndpoint`,
  `tokenEndpoint`, `issuer`, optional `userInfoEndpoints`, `scopes`, and a `profile` mapping whose
  result must carry `id`. Each OAuth component instance reads `CLIENT_ID` and `CLIENT_SECRET` from
  its own component env, is mounted with an `httpPrefix` in `convex.config.ts`, serves its callback
  at `<CONVEX_SITE_URL><httpPrefix>/callback`, always sends PKCE S256, sends no `nonce`
  (`dist/lib/oauth/authorize.js:53`), posts `client_id`, `client_secret` and `code_verifier` to the
  token endpoint (`dist/lib/oauth/callback.js:98`), and checks the `id_token` claims `iss`, `sub`,
  `aud` exactly the client id, `azp` if present, and `exp` (`dist/lib/oauth/callback.js:143`). It
  does not verify the signature, which OIDC Core 3.1.3.7 permits for a token received directly from
  the token endpoint over TLS. So a broker that is a plain OpenID Provider with `client_secret_post`
  needs no app-side code beyond a catalog constant and one env pair. The internal `dist/lib/oauth`
  paths are not public exports.
- Convex Auth v1 (0.0.94, the `templates/base` version) carries the Auth.js redirect proxy only as a
  TODO (`dist/server/provider_utils.js:72`, `dist/server/oauth/authorizationUrl.js:26`). Convex Auth
  v2 fixes the callback to the deployment URL. Neither solves preview deployments.
- Samebase already runs an OAuth 2.1 authorization server for MCP clients with dynamic client
  registration, PKCE, exact redirect URI checks, consent, refresh token rotation, and audit rows
  (`apps/samebase/convex/mcp/oauth.ts`, routes at `apps/samebase/convex/http.ts:91` to `:117`). It
  owns `/.well-known/oauth-authorization-server` at the root of the Samebase deployment, it issues
  opaque access tokens looked up by hash, and its authorize flow signs the user in with Samebase
  accounts and MCP grants (`mcp/oauth.ts:697`). None of that can serve end users of other apps.
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
- A Convex deployment can serve HTTP actions on a custom domain on the Pro plan, through a `CNAME`
  to `convex.domains`, with the Cloudflare proxy enabled when the domain sits in the team's own zone
  ([custom domains](https://docs.convex.dev/production/custom-domains)). The Convex HTTP router
  dispatches on path only, so two issuers on one deployment would share `/.well-known/*`.
- Preview deployments get their own deployment name and `CONVEX_SITE_URL`, and they are deleted
  after 5 days (14 on paid plans)
  ([preview deployments](https://docs.convex.dev/production/hosting/preview-deployments)).
  `npx convex env set` accepts `--deployment <name>`, so a deploy step can write env vars to the
  deployment it just created (`npx convex env set --help`, convex 1.48.0).
- Prior art. Dex ([dexidp.io](https://dexidp.io/docs/connectors/)) is a federated OpenID Provider
  with upstream connectors and no user accounts; it stores clients, auth requests, codes, refresh
  tokens and keys, builds `sub` from the connector id and the upstream user id, and has no RFC 7591
  support. [codefox-inc/convex-oauth-provider](https://github.com/codefox-inc/convex-oauth-provider)
  is a beta Convex component that is an OAuth 2.1 and OIDC provider for MCP clients. Nothing
  documents one Convex deployment as the login server for many Convex apps.
  [Convex Auth issue 49](https://github.com/convex/convex-auth/issues/49) asks for shared auth
  across domains and is open since 2024.

## Target

One sign-in, with Bristol as the app and GitHub as the connector:

1. Bristol's client calls its Convex Auth `startSignInWithHub({ redirectTo })`. The mutation records
   the request and returns the broker authorization URL:
   `https://auth.samebase.com/authorize?response_type=code&client_id=<bristol-prod>&redirect_uri=https://<bristol-deployment>.convex.site/oauth/hub/callback&scope=openid%20email%20profile&state=<s>&code_challenge=<c>&code_challenge_method=S256&connector=github`.
2. The broker checks the client, compares `redirect_uri` with the registered value by simple string
   comparison, stores the authorization request for ten minutes, and, because `connector=github`
   names a configured connector and the client's app is first-party, redirects straight to GitHub
   with the broker's own `state` and PKCE pair. Without `connector`, it renders a minimal page: the
   app name and one button per connector. A third-party app gets a consent page before any redirect.
3. GitHub returns to `https://auth.samebase.com/connectors/github/callback`. The broker exchanges
   the code with the broker's GitHub secret, reads the GitHub user, mints a one-time authorization
   code bound to Bristol's request, and redirects to Bristol's `redirect_uri` with `code`, `state`
   and `iss=https://auth.samebase.com`.
4. Bristol's Convex Auth callback posts `code`, `client_id`, `client_secret` and `code_verifier` to
   `https://auth.samebase.com/token`. The broker verifies the PKCE challenge and the secret, and
   returns `id_token`, a short-lived `access_token` for `/userinfo`, `token_type`, `expires_in`.
   Bristol's Convex Auth validates `iss`, `aud` and `exp`, maps `claims.sub` to the profile `id`,
   runs Bristol's `createUser` callback, and issues Bristol's own session.
5. The broker deletes the authorization request and the code. It keeps one audit row: client id,
   connector, the pairwise subject, and the time. No email, no name, no token.

The user saw Bristol, then GitHub, then Bristol. The broker was invisible.

The email connector replaces step 2 and 3 with a six-digit code: the broker sends the code through
the hub's sender, shows one input, verifies the code with an attempt limit, and continues at step 3
with `email_verified: true`.

## Standards

| Area                                                                           | Standard                                                                                                                                                                                        | What the broker does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authorization code flow, PKCE, redirect URI matching, `iss` response parameter | [OAuth 2.1 draft 16](https://datatracker.ietf.org/doc/draft-ietf-oauth-v2-1/), [RFC 9207](https://www.rfc-editor.org/rfc/rfc9207)                                                               | `response_type=code` only. PKCE S256 required for every client. Exact string comparison of `redirect_uri`, with no loopback exception: a local dev deployment registers its exact `http://127.0.0.1:<port>/...` URI. `iss` on every authorization response, success and error.                                                                                                                                                                                                                                                                                              |
| ID token, claims, `sub`, `prompt`, `max_age`, `nonce`                          | [OIDC Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html)                                                                                                                          | `/authorize` accepts GET and POST. `iss`, `sub`, `aud`, `exp`, `iat`, and `nonce` when the request carried one. `sub` is pairwise per app, at most 255 ASCII characters, never reassigned. `prompt=none` returns `login_required` because the broker has no session. `prompt=login` and `max_age` are forwarded to connectors that can reauthenticate (Google `prompt=login`, the email code is always fresh) and `auth_time` is set from that completion; a connector that cannot force reauthentication (GitHub) answers such a request with `login_required`.            |
| Metadata                                                                       | [OIDC Discovery](https://openid.net/specs/openid-connect-discovery-1_0.html), [RFC 8414](https://www.rfc-editor.org/rfc/rfc8414)                                                                | The component serves both layouts for its configured issuer: `<issuer>/.well-known/openid-configuration` and `<origin>/.well-known/oauth-authorization-server<issuer path>`, same content. For `https://auth.samebase.com` the issuer has no path, so both sit at the host root. `id_token_signing_alg_values_supported: ["RS256"]`, `code_challenge_methods_supported: ["S256"]`, `authorization_response_iss_parameter_supported: true`, `subject_types_supported: ["pairwise"]`, `token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"]`. |
| Client registration                                                            | [RFC 7591](https://www.rfc-editor.org/rfc/rfc7591)                                                                                                                                              | `POST /register` requires an initial access token that the hub admin mints per app. The response carries `client_id` and `client_secret`. `software_id` is the app id, `software_version` is the deployment name, and the extension field `deployment_type` is `production`, `development` or `preview`. Open registration is off. RFC 7592 is not implemented: a deployment registers once and never edits its client.                                                                                                                                                     |
| Keys                                                                           | [RFC 7517](https://www.rfc-editor.org/rfc/rfc7517), [RFC 7518](https://www.rfc-editor.org/rfc/rfc7518), [OIDC Core 10.1.1](https://openid.net/specs/openid-connect-core-1_0.html#RotateSigKeys) | JWKS at `<issuer>/.well-known/jwks.json` with `kid` on every key and token. RS256 only. One current private key; a rotation adds a new current key and keeps only the public half of the old key in the set for 14 days.                                                                                                                                                                                                                                                                                                                                                    |
| Security profile                                                               | [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700)                                                                                                                                              | No pattern matching on redirect URIs (4.1.3). Distinct callback path per upstream connector, the mix-up defense of 4.4.2.2 for the broker as a client of GitHub and Google. The broker authenticates the user before any redirect and auto-redirects upstream only for first-party apps (4.11). A `code_verifier` without a stored `code_challenge` is rejected (4.8.2). Codes are single use and expire after 60 seconds.                                                                                                                                                  |
| UserInfo                                                                       | [OIDC Core 5.3](https://openid.net/specs/openid-connect-core-1_0.html#UserInfo)                                                                                                                 | `/userinfo` accepts GET and POST with the access token from the token response. The access token is a broker-signed JWT with `aud` equal to the issuer, five minutes, usable only there.                                                                                                                                                                                                                                                                                                                                                                                    |

Named departures and gaps:

- No refresh tokens and no `offline_access`. Apps hold their own sessions. Dex differs here.
- No sessions at the broker, so no single sign-on across apps. This is the point, not a gap.
- `response_type=code` only. OAuth 2.1 removes `token`; the OIDC `id_token` response types are
  omitted by choice, so the "dynamic OP" profile of Core 15.2 is not met.
- Pairwise subjects use the app as the sector, not a `sector_identifier_uri` or the redirect host
  (Core 8.1). Reason: the sector must stay stable across a prod deployment, a dev deployment and
  previews on random hosts, and the registration authority already groups those deployments under
  one app. The algorithm is the one Core 8.1 gives:
  `base64url(SHA-256(app id || connector || upstream account id || hub salt))`, deterministic and
  not reversible.
- `connector` is a private claim so an app can show "signed in with GitHub" and decide its own
  linking policy. No `connector_account_id`: it would undo the pairwise choice. No `amr`: RFC 8176
  has no value for an email code.
- Email codes have no standard. NIST SP 800-63B says email is not an out-of-band authenticator. The
  broker carries the result in `email_verified`. This matches what the apps do today with email and
  password; it does not make it stronger. The email connector identity is the canonical address:
  trimmed, NFC-normalized, lowercased, with no provider-specific folding. A reassigned mailbox is
  not detectable. Linking a GitHub subject and an email subject is an app decision; Core 5.7 says
  `email` is not an identifier, and the broker never links.
- `token_endpoint_auth_method: "none"`, native clients, ES256, and the Client ID Metadata Document
  draft are deferred until a consumer needs them.

## Changes

### Phase 1. The package

`packages/identity-broker`, a Convex component built with `defineComponent`, following
`$convex-create-component` and `docs/code-guardrails.md`.

Tables, all inside the component:

- `apps`: `appId`, `name`, `firstParty`, `allowedCallbackHosts` (for example `*.convex.site` and
  `127.0.0.1`), `createdAt`.
- `registrationTokens`: `tokenHash`, `appId`, `expiresAt`, `createdAt`.
- `clients`: `clientId`, `appId`, `secretHash`, `tokenEndpointAuthMethod`, `redirectUri`,
  `deploymentType`, `softwareVersion`, `createdAt`, `lastSignInAt`.
- `authRequests`: `status` first as the union discriminant (`pending`, `upstream`, `completed`),
  `clientId`, `redirectUri`, `state`, optional `nonce`, `scope`, `codeChallenge`, `connector`,
  `prompt` and `maxAge` when sent, `expiresAt`; the upstream `state` and `codeVerifier` while
  `upstream`; the claims snapshot and `authTime` while `completed`.
- `authorizationCodes`: `codeHash`, `authRequestId`, `expiresAt`, `usedAt`.
- `emailCodes`: `authRequestId`, `email`, `codeHash`, `attempts`, `expiresAt`.
- `signIns`: `clientId`, `connector`, `sub`, `at`.

Lifecycle values: authorization requests live ten minutes, email codes ten minutes and five
attempts, authorization codes sixty seconds and one use, `id_token` and the userinfo access token
five minutes, audit rows ninety days, registration tokens thirty days. A cron deletes expired
requests, codes, and preview clients whose `lastSignInAt` or `createdAt` is older than 30 days.
Production and development clients are never pruned; the admin deletes them. Deleting an app deletes
its clients and tokens at once, which is the emergency revocation. Rotating the signing key is the
other one.

Keys live in the host's env as a JSON JWK set in `IDENTITY_BROKER_KEYS`: one private key marked
current, plus the public halves of retired keys with a `retiredAt`.
`npx @samebase/identity-broker keys` creates the set and `keys --rotate` advances it; the host
redeploys env after each.

HTTP routes, mounted at the issuer root: `/.well-known/openid-configuration`,
`/.well-known/oauth-authorization-server`, `/.well-known/jwks.json`, `/authorize` (GET, POST),
`/register` (POST), `/token` (POST), `/userinfo` (GET, POST), `/connectors/<name>/callback` (GET),
`/connectors/email` (POST for the code form). The host passes the issuer URL at mount time, and the
component derives both metadata locations from it.

Administration is internal functions run by the deployment owners with the Convex CLI: `createApp`,
`mintRegistrationToken`, `deleteApp`, `listClients`. No admin UI in this phase.

Connectors, chosen at mount time: `github` and `google` with `CLIENT_ID` and `CLIENT_SECRET` per
connector in the component env, and `email` with a sender function reference supplied by the host,
in the shape Convex Auth v2 uses for user callbacks. The upstream OAuth code copies the catalog
shape of Convex Auth v2's generic method rather than importing its internal paths.

The package must not import Samebase's generated API or types, its access wrappers, `users` or
`organizations`, deployment profiles, the email implementation, MCP grants or scopes, or Convex Auth
internals. Adapters stay in the host.

Tests use real payloads from GitHub and Google, mutated only for negative cases, per the guardrails.
The conformance test runs `openid-client` as an independent relying party against the component in
`convex-test`: discovery at both locations, registration with an initial access token, code flow
with PKCE, token validation with and without `nonce`, userinfo, `prompt=none`, and the rejections
(wrong `redirect_uri`, reused code, missing `code_challenge`, expired request, bad secret, expired
registration token, callback host outside the app's allow list).

### Phase 2. The hub deployment

- `apps/identity-hub`: a host app with `convex.config.ts` that mounts the component with issuer
  `https://auth.samebase.com`, the GitHub and Google credentials of two new OAuth apps registered
  once for `https://auth.samebase.com/connectors/<name>/callback`, and a `sendEmail` action on
  Cloudflare Email with its own token. No frontend beyond the pages the component renders.
- Its own Convex project on the Samebase team, with the custom domain `auth.samebase.com` as a
  proxied `CNAME` to `convex.domains` in the Samebase Cloudflare zone.
- This host app is also the self-host starter: another team copies it, sets its issuer and
  credentials, and has a hub.

### Phase 3. The consumer path in the starter

In `samebase/base-hosting` (Convex Auth 2.0.0-beta.0):

- A `hub` sign-in method:
  `setupOauth(auth, "hub", hubCatalog, callbacks, { component: components.authHub, allowedRedirectOrigins })`
  with the component mounted at `httpPrefix: "/oauth/hub"` in `convex.config.ts`. The catalog is the
  broker issuer, `/authorize`, `/token`, scopes `openid email profile`, and a `profile` mapping from
  the `id_token` claims with `id: claims.sub`. Component env: `CLIENT_ID` and `CLIENT_SECRET` from
  `HUB_CLIENT_ID` and `HUB_CLIENT_SECRET` on each deployment.
- `scripts/register-hub-client.ts`: runs after a deployment exists, with `HUB_REGISTRATION_TOKEN`
  from the CI secret store or the developer's `.env.local`, posts the deployment's callback URL,
  `deployment_type` and name to `/register`, and writes `HUB_CLIENT_ID` and `HUB_CLIENT_SECRET` to
  that deployment with `npx convex env set --deployment <name>`. It skips when the deployment
  already has a client id. `pnpm run dev --once`, `deploy` and `deploy:preview` call it. The
  registration token never lives in a Convex deployment env; it sits where `CONVEX_DEPLOY_KEY`
  already sits.
- One-time setup per app: the hub admin runs `createApp` and `mintRegistrationToken` and hands the
  token to the app's CI secrets. Samebase provisioning does this step in Phase 4.
- Bristol is the first consumer, then the Samebase-made personal apps.

### Phase 4. Samebase provisioning

When Samebase creates or repairs an app whose organization has a hub, it calls the hub's admin
functions over an admin token to create the app and mint a registration token, stores that token in
the repository's CI secrets next to the deploy key, and leaves the rest to the deploy step. This
phase gets its own plan after Phase 3 has run on two apps.

## Decisions

1. **A broker, not an account hub.** The broker keeps no users and no sessions. Reason: the
   requirement is shared provider connections with separate accounts per app, and an account hub
   brings branding, consent, an account page, and data-controller duties that the apps do not want.
2. **Hub-managed RS256 keys and a public issuer URL, not `ctx.auth.signJwt`.** Reason: OIDC requires
   RS256 support and the metadata document under the issuer URL; `signJwt` is ES256 only with an
   issuer on `convex.cloud`. Cost: one env var generated by one command, as Convex Auth v1 did.
   Revisit if Convex adds configurable issuers and RS256.
3. **A dedicated hub deployment at `https://auth.samebase.com`, not a mount in the Samebase app.**
   Reason: the Convex router dispatches on path only, and the Samebase deployment already owns
   `/.well-known/oauth-authorization-server` for MCP, so a second issuer there needs host dispatch
   in handlers; a shared deployment also couples releases, outages, signing keys and email capacity.
   The review proposed the path issuer `https://samebase.com/identity` as the cheap conformant
   alternative; it is correct, and the component supports path issuers, but a separate deployment
   removes the coupling as well and keeps the host-only issuer. Cost: one more Convex project and
   one email token.
4. **One app, one client per deployment through RFC 7591, no RFC 7592.** Reason: OAuth 2.1 and RFC
   9700 forbid pattern matching and preview names are random, so registration must be automatic;
   per-deployment clients keep production credentials out of previews, remove the replace-on-PUT
   race, and remove any need to return a stored secret. The registration token is app-scoped,
   expires in 30 days, and lives in CI secrets and the developer's `.env.local`, the same places as
   the deploy key, which can already deploy code to production. A leaked token can register clients
   under that app only on the app's allowed callback hosts until the admin deletes the app. `aud`
   differs per deployment and `sub` does not, because the sector is the app.
5. **Pairwise subjects with the app as the sector.** Reason: separate accounts per app do not need
   public subjects, a public `connector:id` would be a permanent cross-app correlator, and the app
   sector keeps `sub` stable across prod, dev and previews, which `sector_identifier_uri` cannot do
   for random preview hosts.
6. **The MCP authorization server stays separate.** Reason: it issues opaque tokens for Samebase's
   own resource with Samebase accounts and scopes, a different product boundary. Shared helpers move
   into the package only when the MCP server imports them back; the package never imports from
   `apps/samebase`.
7. **Built in the monorepo, published from it.** Reason: the monorepo is private until token
   management is fixed, and `packages/sidebars` already proves the export path to a separate public
   repository. Publication waits for a consumer outside the monorepo (Bristol).
8. **First-party is an app-level admin decision.** Reason: RFC 9700 4.11. A registration token
   cannot change it. Third-party apps get a consent page.

## Validation

- Phase 1: the `openid-client` conformance test above, plus the real-payload parser tests.
- Phase 2: a GitHub sign-in to a scratch Convex Auth v2 app through `auth.samebase.com` from a dev
  deployment and from a preview deployment, each registered by the script, without any change at
  GitHub. The audit row shows the client, the connector and the pairwise subject and nothing else.
  `npx convex env set --deployment <preview name>` under the preview deploy key is the one CLI claim
  to prove here.
- Phase 3: Bristol signs in through the hub on prod, dev and a preview; the Bristol GitHub OAuth app
  is deleted afterwards.
- A log and screenshot check that no token, code, or email appears in Convex logs.

## Non-Goals

- Single sign-on across apps, sessions at the broker, refresh tokens, `offline_access`.
- MFA, passkeys, SAML, account management, a hosted account page, an admin UI.
- Replacing the MCP authorization server or Samebase's own login.
- Serving other teams from `auth.samebase.com`. Another team deploys `apps/identity-hub` itself.

## Open Questions

- Package name: `@samebase/identity-broker` or a product name.
- Whether Samebase's own login should later move onto the hub, which would make the MCP consent flow
  a client of it.
