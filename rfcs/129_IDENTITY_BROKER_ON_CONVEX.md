# 129 Identity broker on Convex

## Document Control

- Status: Proposal
- Owner: Nicu Chiciuc
- Created: 2026-10-28
- Revised on 2026-10-28 (6): no new upstream registrations. The hub starts with the email connector,
  adds Google by one more redirect URI on the existing client, and adds GitHub on the existing
  Samebase GitHub App, which accepts up to 10 callback URLs.
- Revised on 2026-10-28 (5): the hub at `auth.samebase.com` is the team's hub, and Samebase is one
  consumer of it, after Bristol and the personal apps; Samebase's own login moving onto the hub
  becomes Phase 4, and product provisioning for other organizations becomes Phase 5.
- Revised on 2026-10-28 (4): the provider surface is written fresh from the Samebase MCP OAuth
  server pattern instead of forked from `codefox-inc/convex-oauth-provider`; the patterns shared by
  Dex, Ory Hydra, Keycloak, Logto, Zitadel, Cloudflare Access, Supabase and Auth.js are recorded,
  with the five points where an account-less broker has no precedent.
- Revised on 2026-10-28 (3): connectors are hub configuration, not a fixed set; two public
  repositories, the component and a hub template; the hub template is built on the Alchemy setup
  stack; the provider surface starts from `codefox-inc/convex-oauth-provider`.
- Revised on 2026-10-28 (2): the code lives outside this monorepo so both the package and the
  self-hostable hub can be open source. See Decision 7.
- Revised on 2026-10-28 after one Codex design review: dedicated hub deployment instead of a mount
  in the Samebase app, one client per deployment through RFC 7591 instead of a shared client updated
  through RFC 7592, pairwise subjects with the app as the sector, lifecycle values fixed.
- Evidence: the Convex Auth v2 generic OAuth method installed at
  `apps/samebase/node_modules/@convex-dev/auth` (2.0.0-beta.0), the Samebase MCP OAuth server in
  `apps/samebase/convex/mcp/oauth.ts`, the Samebase email sender in `apps/samebase/convex/email.ts`,
  `templates/base-actions/alchemy.run.ts`, the standards cited inline, and the prior-art and reuse
  surveys in the session notes of 2026-10-27 and 2026-10-28
- Related: `rfcs/128_SAMEBASE_SSR_WITH_COOKIE_SESSIONS_ROLLOUT.md` (Convex Auth 2 in Samebase),
  `specs/117_MANUAL_PASSWORD_AUTH_SPEC.md`,
  `rfcs/062_MCP_DUAL_ORIGIN_CONSENT_LOGIN_REDIRECT_SPEC.md` (the MCP authorization server),
  `docs/repository-exports.md` (the one-way export path, not used here),
  `research/2026-10-05-alchemy-setup-stack-and-wrangler-split.md`,
  `research/2026-06-22-cloudflare-oauth-apps-mcp-fit.md`

## Summary

1. The per-project cost of login is not code. It is credentials bound to a domain: an OAuth client
   whose callback URL is registered at an upstream provider, and an email sender with a verified
   domain and an API token. Convex Auth puts the OAuth callback on each deployment's
   `CONVEX_SITE_URL`, so every dev and preview deployment needs its own registration, and in
   practice previews cannot use GitHub sign-in. The fallback today is email and password plus a
   Cloudflare Email token copied into every app.
2. This RFC adds an identity broker: one Convex deployment per team that holds the team's upstream
   connections once and acts as an OpenID Provider for the team's apps. Which connections is hub
   configuration: any OAuth or OpenID Connect provider from the Auth.js provider catalog, plus an
   email code connector. The team hub configures GitHub, Google and email. The broker keeps no user
   accounts and no login sessions. Every sign-in goes upstream again, and the broker returns an
   `id_token` from which each app creates its own user with its own Convex Auth. Apps keep separate
   accounts, and each app sees its own pairwise subjects. The broker is a hub of provider
   connections, not a hub of accounts.
3. Two public repositories. `samebase/identity-broker` is the Convex component, published to npm as
   `@samebase/identity-broker`. `samebase/identity-hub` is a GitHub template repository: the host
   app that mounts the component, built on the Alchemy setup stack of `templates/base-actions`, and
   maintained in its own repository like `samebase/base-hosting`. The team hub at
   `https://auth.samebase.com` is an app created from that template. Samebase is one consumer of
   that hub, after Bristol and the personal apps have proven it. Another team forks the template, or
   creates it from Samebase once the product has a manifest for it. This monorepo keeps this RFC,
   the Phase 4 login change, and the Phase 5 provisioning work.
4. The provider surface is not designed from scratch. Samebase already owns an OAuth 2.1
   authorization server for MCP clients, about 2,000 lines with tests in this repository's
   guardrails: dynamic registration, PKCE, exact redirect checks, the token endpoint, errors and
   audit rows. The component copies that pattern into the new repository and adds what a broker
   needs: `jose` for RS256 `id_token`s and JWKS, discovery and userinfo, connectors, the app and
   registration-token model, pairwise subjects, and key rotation. Upstream sign-ins use
   `oauth4webapi` and the `@auth/core` provider definitions, which Convex Auth v1 already runs
   inside the Convex runtime. `codefox-inc/convex-oauth-provider` is the reference for protocol edge
   cases, not the code base. The broker semantics follow the patterns that Dex, Ory Hydra, Keycloak,
   Logto, Zitadel and Cloudflare Access share, recorded below.
5. The design follows OAuth 2.1, OpenID Connect Core and Discovery, RFC 7591, RFC 8414, RFC 9207,
   and RFC 9700. Every departure is named in the Standards section. The differentiator is the
   runtime: one Convex deployment, no Docker, no database to run, one key set to generate.

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
  needs no app-side code beyond a catalog constant and one env pair.
- Convex Auth v1 (0.0.94, the `templates/base` version) carries the Auth.js redirect proxy only as a
  TODO (`dist/server/provider_utils.js:72`). It runs `oauth4webapi` and the `@auth/core` provider
  definitions inside Convex HTTP actions (`dist/server/oauth/callback.js:3`), which proves both run
  in the Convex runtime. Convex Auth v2 fixes the callback to the deployment URL. Neither solves
  preview deployments.
- `@auth/core` (ISC) ships 321 provider definitions. `providers/github.js` and `providers/google.js`
  import nothing: they are functions that return the endpoints, scopes and a `profile` mapping, so a
  hub can import one definition without running Auth.js. GitHub's definition falls back to
  `/user/emails` without checking `verified`; the broker must check it. Google's definition is only
  `{ type: "oidc", issuer }`, so OIDC connectors use discovery through `oauth4webapi`.
- `codefox-inc/convex-oauth-provider` 0.4.2
  ([repo](https://github.com/codefox-inc/convex-oauth-provider), Apache-2.0): a Convex component
  (`defineComponent("oauthProvider")`) with discovery at both well-known locations, JWKS,
  `/authorize`, `/token`, `/userinfo`, and opt-in `/register` (RFC 7591); `authorization_code` and
  rotating `refresh_token` grants; PKCE S256 required; RS256 `id_token` with `sub`, `iss`, `aud`,
  `nonce`, `auth_time` through `jose`; RFC 9068 access tokens; codes and tokens stored as SHA-256
  hashes; one signing key from env with no rotation. End-user identity comes from a host hook,
  `getUserId(ctx, request)`, and consent from a host `authorizeHandler`. No upstream connectors, no
  account system. About 4,200 lines of TypeScript and 9,100 lines of vitest and convex-test tests,
  one maintainer, last commit 2026-05-17. The alternatives (`VortexNYC/convex-auth`,
  `robelest/convex-auth`) are full account libraries whose provider parts are not separable.
- Samebase already runs an OAuth 2.1 authorization server for MCP clients
  (`apps/samebase/convex/mcp/oauth.ts`, routes at `apps/samebase/convex/http.ts:91` to `:117`). It
  is about 2,000 lines (`mcp/oauth.ts`, `mcp/protocol.ts` with the registration, authorize and token
  request validation, `mcp/tokens.ts` with PKCE S256 and hashing, `mcp/http.ts`) plus `convex-test`
  suites, written to this repository's guardrails. It owns `/.well-known/oauth-authorization-server`
  at the root of the Samebase deployment, issues opaque tokens, and signs the user in with Samebase
  accounts and MCP grants. The protocol half is the pattern for the broker; the identity half cannot
  serve end users of other apps.
- Samebase sends email through Cloudflare Email Sending with `CLOUDFLARE_EMAIL_API_TOKEN` and
  `CLOUDFLARE_EMAIL_ACCOUNT_ID` (`apps/samebase/convex/email.ts:50`). Alchemy's Cloudflare `Email`
  resources cover routing, not sending, so the sending token stays an env secret.
- `templates/base-actions/alchemy.run.ts` is the Alchemy setup stack: `Convex.Project`,
  `Convex.DeployKey`, `Convex.PreviewDeployKey` from `@samebase/alchemy-convex`, plus Workers Builds
  for the frontend Worker. Alchemy also has Cloudflare `DNS.Record`. There is no Alchemy resource
  for a Convex custom domain; the dashboard sets it once
  ([custom domains](https://docs.convex.dev/production/custom-domains): Pro plan, `CNAME` to
  `convex.domains`, Cloudflare proxy allowed).
- Convex 1.48.0 adds `ctx.auth.signJwt` (ES256, deployment key, issuer fixed to `CONVEX_CLOUD_URL`,
  max one hour). It is not usable here: OIDC requires RS256 from every OP
  ([Core 15.1](https://openid.net/specs/openid-connect-core-1_0.html#ServerMTI)) and the metadata
  document under the issuer URL
  ([Discovery 4](https://openid.net/specs/openid-connect-discovery-1_0.html#ProviderConfig)).
- Preview deployments get their own deployment name and `CONVEX_SITE_URL`, and they are deleted
  after 5 days (14 on paid plans)
  ([preview deployments](https://docs.convex.dev/production/hosting/preview-deployments)).
  `npx convex env set` accepts `--deployment <name>` (convex 1.48.0).
- GitHub: an OAuth App has one callback URL; with wildcard matching on, a redirect on another
  subdomain of the same host and under the callback path matches, otherwise the match is exact. A
  GitHub App accepts up to 10 callback URLs, each with its own wildcard setting, and signs users in
  through `/login/oauth/authorize` with the app's client id; it requests no scopes, so reading the
  user's email needs the app's Email addresses user permission
  ([callback URL](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-user-authorization-callback-url),
  [user tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)).
  Samebase has both: a login OAuth App (`AUTH_GITHUB_CLIENT_ID`) and a GitHub App for repository
  provisioning (`GITHUB_APP_CLIENT_ID`, `apps/samebase/convex/githubApp.ts`). A Google OAuth client
  accepts a list of redirect URIs.
- Prior art for the semantics. Dex ([dexidp.io](https://dexidp.io/docs/connectors/)) is a federated
  OpenID Provider with upstream connectors and no user accounts; it builds `sub` from the connector
  id and the upstream user id and has no RFC 7591 support.
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
   app name and one button per configured connector. A third-party app gets a consent page before
   any redirect.
3. GitHub returns to `https://auth.samebase.com/connectors/github/callback`. The broker exchanges
   the code with the hub's GitHub secret, reads the GitHub user and a verified email, mints a
   one-time authorization code bound to Bristol's request, and redirects to Bristol's `redirect_uri`
   with `code`, `state` and `iss=https://auth.samebase.com`.
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

| Area                                                                           | Standard                                                                                                                                                                                        | What the broker does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authorization code flow, PKCE, redirect URI matching, `iss` response parameter | [OAuth 2.1 draft 16](https://datatracker.ietf.org/doc/draft-ietf-oauth-v2-1/), [RFC 9207](https://www.rfc-editor.org/rfc/rfc9207)                                                               | `response_type=code` only. PKCE S256 required for every client. Exact string comparison of `redirect_uri`, with no loopback exception: a local dev deployment registers its exact `http://127.0.0.1:<port>/...` URI. `iss` on every authorization response, success and error.                                                                                                                                                                                                                                                                                                    |
| ID token, claims, `sub`, `prompt`, `max_age`, `nonce`                          | [OIDC Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html)                                                                                                                          | `/authorize` accepts GET and POST. `iss`, `sub`, `aud`, `exp`, `iat`, and `nonce` when the request carried one. `sub` is pairwise per app, at most 255 ASCII characters, never reassigned. `prompt=none` returns `login_required` because the broker has no session. `prompt=login` and `max_age` are forwarded to connectors that can reauthenticate (OIDC connectors through `prompt=login`, the email code is always fresh) and `auth_time` is set from that completion; a connector that cannot force reauthentication (GitHub) answers such a request with `login_required`. |
| Metadata                                                                       | [OIDC Discovery](https://openid.net/specs/openid-connect-discovery-1_0.html), [RFC 8414](https://www.rfc-editor.org/rfc/rfc8414)                                                                | The component serves both layouts for its configured issuer: `<issuer>/.well-known/openid-configuration` and `<origin>/.well-known/oauth-authorization-server<issuer path>`, same content. For `https://auth.samebase.com` the issuer has no path, so both sit at the host root. `id_token_signing_alg_values_supported: ["RS256"]`, `code_challenge_methods_supported: ["S256"]`, `authorization_response_iss_parameter_supported: true`, `subject_types_supported: ["pairwise"]`, `token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"]`.       |
| Client registration                                                            | [RFC 7591](https://www.rfc-editor.org/rfc/rfc7591)                                                                                                                                              | `POST /register` requires an initial access token that the hub admin mints per app. The response carries `client_id` and `client_secret`. `software_id` is the app id, `software_version` is the deployment name, and the extension field `deployment_type` is `production`, `development` or `preview`. Open registration is off. RFC 7592 is not implemented: a deployment registers once and never edits its client.                                                                                                                                                           |
| Keys                                                                           | [RFC 7517](https://www.rfc-editor.org/rfc/rfc7517), [RFC 7518](https://www.rfc-editor.org/rfc/rfc7518), [OIDC Core 10.1.1](https://openid.net/specs/openid-connect-core-1_0.html#RotateSigKeys) | JWKS at `<issuer>/.well-known/jwks.json` with `kid` on every key and token. RS256 only. One current private key; a rotation adds a new current key and keeps only the public half of the old key in the set for 14 days.                                                                                                                                                                                                                                                                                                                                                          |
| Security profile                                                               | [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700)                                                                                                                                              | No pattern matching on redirect URIs (4.1.3). Distinct callback path per upstream connector, the mix-up defense of 4.4.2.2 for the broker as a client of several providers. The broker authenticates the user before any redirect and auto-redirects upstream only for first-party apps (4.11). A `code_verifier` without a stored `code_challenge` is rejected (4.8.2). Codes are single use and expire after 60 seconds.                                                                                                                                                        |
| UserInfo                                                                       | [OIDC Core 5.3](https://openid.net/specs/openid-connect-core-1_0.html#UserInfo)                                                                                                                 | `/userinfo` accepts GET and POST with the access token from the token response. The access token is a broker-signed JWT with `aud` equal to the issuer, five minutes, usable only there.                                                                                                                                                                                                                                                                                                                                                                                          |
| Upstream sign-in                                                               | [OIDC Discovery](https://openid.net/specs/openid-connect-discovery-1_0.html), [RFC 6749](https://www.rfc-editor.org/rfc/rfc6749)                                                                | OIDC connectors are configured by issuer and discovered; plain OAuth connectors by explicit endpoints and a profile mapping. Both run the authorization code flow with PKCE through `oauth4webapi`, which is an OpenID-certified relying party.                                                                                                                                                                                                                                                                                                                                   |

Named departures and gaps:

- No refresh tokens and no `offline_access`. Apps hold their own sessions. Dex and the codefox
  component differ here; the broker removes that grant.
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

## Patterns from other brokers

Surveyed on 2026-10-28: [Dex](https://dexidp.io/docs/configuration/tokens/),
[Ory Hydra](https://www.ory.com/docs/hydra/guides/openid),
[Keycloak](https://www.keycloak.org/securing-apps/client-registration),
[Logto](https://docs.logto.io/end-user-flows/sign-up-and-sign-in/social-sign-in),
[Zitadel](https://zitadel.com/docs/guides/integrate/login/oidc/webkeys),
[Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/),
[Supabase](https://supabase.com/docs/guides/auth/auth-identity-linking),
[Auth.js](https://authjs.dev/reference/core/providers#allowdangerousemailaccountlinking).

| Settled pattern                                                                                         | Who                                                                                | The broker                                                                                                                         |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| One signing key; retired public keys stay in the JWKS for an overlap window                             | Dex, Hydra, Keycloak, Zitadel, Logto, Cloudflare Access (6 weeks, 7 days overlap)  | Same, 14 days overlap.                                                                                                             |
| The identity key is (connector, upstream user id), never the email                                      | Dex, Keycloak, Logto, Supabase                                                     | Same, hashed into the pairwise subject.                                                                                            |
| Linking accounts by email is off by default, prompted, or named dangerous; only a verified email counts | Keycloak, Auth.js, Supabase, Logto, Zitadel                                        | The broker never links; `email_verified` is a claim for the app.                                                                   |
| Open client registration is off by default                                                              | Hydra, Keycloak, Logto; Dex and Zitadel have no endpoint                           | Same; app-scoped tokens.                                                                                                           |
| Dynamically registered clients get less trust (forced consent)                                          | Hydra, Keycloak, Logto                                                             | Departure: trust comes from the app the token belongs to, because every deployment of a first-party app is registered dynamically. |
| The login transaction is short-lived or sealed                                                          | Dex (stored, 24h), Hydra (encrypted into the challenge), Auth.js (encrypted state) | Stored, ten minutes.                                                                                                               |

Five points where an account-less broker has no precedent, and what the RFC decides:

1. A stable `sub` with no stored row. Only Dex does this, by encoding the connector and the upstream
   id; Keycloak's transient users change `sub` every login. Decision 5: a hash of app, connector,
   upstream id and a hub salt, with no row.
2. Linking across connectors without accounts. No system does it; every system that links stores a
   user. The broker does not link: two connectors give two subjects, and the app decides.
3. An email-code subject with no record. No system derives one. The canonical address is the
   upstream id.
4. Pairwise subjects for preview clients. Hydra's sector is the redirect host, so `sub` would change
   per preview. The sector is the app, and the hub salt is created once with the key set and never
   rotated.
5. No broker session. Every other system keeps one for single sign-on or logout. The broker has
   none, so there is no RP-initiated or front-channel logout; sign-out is the app's.

The MCP draft specification now deprecates RFC 7591 registration in favor of Client ID Metadata
Documents, and Logto uses them for dynamic apps. The broker keeps RFC 7591 with app tokens for now
and lists the metadata document as the deferred alternative.

## What it builds on

| Piece             | Source                                                                      | Used for                                                                                                                       | Kept, changed, or removed                                                                                                                                          |
| ----------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Provider surface  | Samebase's MCP OAuth server (`apps/samebase/convex/mcp/*`), this repository | registration, authorize and token request validation, PKCE S256, hashed codes, exact redirect checks, error shapes, audit rows | Copied into the new repository and adapted: no MCP scopes, no Samebase accounts, no refresh tokens, plus discovery, JWKS, `id_token`, userinfo, and the app model. |
| Edge cases        | `codefox-inc/convex-oauth-provider` 0.4.2, Apache-2.0                       | its `rfc-compliance.test.ts` as a checklist of protocol edge cases                                                             | Reference. Individual cases ported with attribution where the broker shares the behavior.                                                                          |
| Connector catalog | `@auth/core/providers/*`, ISC                                               | endpoints, scopes, profile mappings for 321 providers                                                                          | Imported one definition at a time. The broker adds the verified-email check.                                                                                       |
| Upstream flow     | `oauth4webapi`, MIT                                                         | authorization code with PKCE, discovery for OIDC connectors                                                                    | Kept as is.                                                                                                                                                        |
| Signing           | `jose`, MIT                                                                 | RS256 keys, JWKS export, sign and verify                                                                                       | Kept as is.                                                                                                                                                        |
| Design            | Dex                                                                         | federated OP with connectors and no accounts                                                                                   | Reference only.                                                                                                                                                    |

## Changes

### Phase 1. The component

`samebase/identity-broker`, a new component following `$convex-create-component` and the same
tooling contract as this monorepo: Vite+, Oxlint, Oxfmt, and an `AGENTS.md` with the code guardrails
that apply.

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

Connectors are configuration passed at mount time, not code in the component. A connector is one of:
`{ kind: "oidc", name, issuer, scopes, profile }`,
`{ kind: "oauth", name, authorizationEndpoint, tokenEndpoint, userInfoEndpoints, scopes, profile }`,
or `{ kind: "email", name, send }` where `send` is a host function reference. `github()` and
`google()` are thin wrappers over the `@auth/core` definitions; any other Auth.js provider wraps the
same way. Each connector's `CLIENT_ID` and `CLIENT_SECRET` come from the component env under the
connector's name.

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
redeploys env after each. The same command creates the pairwise salt once, in the same env var, and
`--rotate` never touches it: changing the salt changes every subject.

HTTP routes, mounted at the issuer root: `/.well-known/openid-configuration`,
`/.well-known/oauth-authorization-server`, `/.well-known/jwks.json`, `/authorize` (GET, POST),
`/register` (POST), `/token` (POST), `/userinfo` (GET, POST), `/connectors/<name>/callback` (GET),
`/connectors/email` (POST for the code form). The host passes the issuer URL at mount time, and the
component derives both metadata locations from it.

Administration is internal functions run by the deployment owners with the Convex CLI: `createApp`,
`mintRegistrationToken`, `deleteApp`, `listClients`. No admin UI in this phase.

The component depends on nothing in this monorepo. Adapters, such as the email sender, live in the
hub app.

Tests use real payloads from GitHub and Google mutated only for negative cases, port the protocol
edge cases from the Samebase MCP suites and the codefox checklist that apply, and add a conformance
test that runs `openid-client` as an independent relying party against the component in
`convex-test`: discovery at both locations, registration with an initial access token, code flow
with PKCE, token validation with and without `nonce`, userinfo, `prompt=none`, and the rejections
(wrong `redirect_uri`, reused code, missing `code_challenge`, expired request, bad secret, expired
registration token, callback host outside the app's allow list).

### Phase 2. The hub template and the team hub

- `samebase/identity-hub`, a GitHub template repository maintained there, like
  `samebase/base-hosting`. It is the Alchemy setup stack of `templates/base-actions` without the
  Worker: `Convex.Project`, `Convex.DeployKey`, `Convex.PreviewDeployKey`, and a Cloudflare
  `DNS.Record` for the hub hostname. GitHub Actions runs `npx convex deploy` on `main` with the
  deploy key. `convex.config.ts` mounts the component with the issuer URL and the connector list
  from `convex/connectors.ts`; a `sendEmail` action on Cloudflare Email Sending with its own token;
  no frontend beyond the pages the component renders. Env: the connector secrets,
  `IDENTITY_BROKER_KEYS`, the email token. The issuer defaults to the deployment's
  `CONVEX_SITE_URL`, which is host-only, so a hub works before any DNS record or custom domain and
  without the Pro plan. Setting a custom domain changes the issuer that every consuming app names,
  so it happens before the first consumer registers.
- The team hub is an app in the samebase organization created from that template, with the custom
  domain `auth.samebase.com` set in the Convex dashboard as a proxied `CNAME` to `convex.domains`.
  Connectors arrive in this order, with no new upstream registration: `email` first, on the existing
  Cloudflare Email Sending token, which is enough for Bristol and the personal apps; `google` by
  adding `https://auth.samebase.com/connectors/google/callback` to the existing Samebase Google
  client; `github` on the existing Samebase GitHub App, by adding the hub callback to its list and
  giving the app the Email addresses user permission, with the hub connector using
  `GITHUB_APP_CLIENT_ID` and its secret. The login OAuth App behind `AUTH_GITHUB_CLIENT_ID` is not
  touched until Phase 4. Samebase the app is not involved: the hub is owned by the team, and
  Samebase becomes a client of it in Phase 4.
- Another team forks the template, sets its issuer, connectors and secrets, and has a hub. Creating
  it from Samebase is Phase 5.

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
  token to the app's CI secrets. Samebase provisioning does this step in Phase 5.
- Bristol is the first consumer because it is the simplest real app with users, then the personal
  apps. Samebase waits for Phase 4.

### Phase 4. Samebase as a consumer

After Bristol and at least one personal app sign in through the hub, Samebase's own GitHub and
Google sign-in move onto it: the `hub` method replaces `setupGithub` and `setupGoogle` in
`apps/samebase/convex/auth.ts`, the `createUser` and `onSignIn` callbacks attach the hub subject to
the existing `users` rows, and the login OAuth App behind `AUTH_GITHUB_CLIENT_ID` retires. The
Google client and the GitHub App stay: the hub uses them, and the GitHub App keeps provisioning
repositories. The password method stays local, because the hub has no password connector by design.
The MCP authorization server is unchanged: it keeps running on Samebase's own session, which the hub
now establishes. Samebase dev and preview deployments get GitHub sign-in for the first time.

### Phase 5. Samebase provisioning

Two product steps, planned after Phase 4: a manifest for the hub template, so an organization
creates its hub from Samebase like any other app; and, for an app in an organization that has a hub,
a call to the hub's admin functions over an admin token that creates the app, mints a registration
token, and stores it in the repository's CI secrets next to the deploy key.

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
   `/.well-known/oauth-authorization-server` for MCP; a shared deployment also couples releases,
   outages, signing keys and email capacity. The path issuer `https://samebase.com/identity` is the
   cheap conformant alternative, and the component supports path issuers, but a separate deployment
   removes the coupling as well and keeps the host-only issuer.
4. **One app, one client per deployment through RFC 7591, no RFC 7592.** Reason: OAuth 2.1 and RFC
   9700 forbid pattern matching and preview names are random, so registration must be automatic;
   per-deployment clients keep production credentials out of previews, remove the replace-on-PUT
   race, and remove any need to return a stored secret. The registration token is app-scoped,
   expires in 30 days, and lives in CI secrets and the developer's `.env.local`, the same places as
   the deploy key, which can already deploy code to production. `aud` differs per deployment and
   `sub` does not, because the sector is the app.
5. **Pairwise subjects with the app as the sector.** Reason: separate accounts per app do not need
   public subjects, a public `connector:id` would be a permanent cross-app correlator, and the app
   sector keeps `sub` stable across prod, dev and previews, which `sector_identifier_uri` cannot do
   for random preview hosts.
6. **Connectors are hub configuration, and the team hub registers nothing new upstream.** Reason:
   which providers a team uses is the team's choice, and the Auth.js catalog already describes 321
   of them; a fixed GitHub-plus-Google set would make the component Samebase-shaped. The team hub
   starts with email, then Google and GitHub on the clients the team already owns, because a Google
   client takes several redirect URIs and a GitHub App takes ten callback URLs. A password connector
   is impossible: a password is a stored credential, which is an account.
7. **Two public repositories, maintained there.** Reason: both the component and the hub must be
   open source, this monorepo stays private until token management is fixed, the consumers (the
   `base-hosting` starter, Bristol) already live outside it, and `samebase/base-hosting` set the
   precedent that a public artifact the monorepo gives nothing to stays out of it. The one-way
   repository export would publish a mirror that cannot take pull requests. The hub is a GitHub
   template repository so it is forkable without Samebase, and a Samebase manifest later makes it a
   one-click app.
8. **Write the provider surface fresh from the Samebase MCP OAuth server, not from a fork.** Reason:
   the broker would delete most of what `codefox-inc/convex-oauth-provider` adds (host identity
   hook, per-user consent grants, refresh tokens, resource indicators) and rewrite its tests, and
   the protocol surface that remains is code this repository already owns in its own guardrails. The
   fork was the first choice and is kept as the edge-case reference; its Apache-2.0 license allows
   porting individual test cases with attribution.
9. **The MCP authorization server stays separate.** Reason: it issues opaque tokens for Samebase's
   own resource with Samebase accounts and scopes, a different product boundary. In Phase 4 it is a
   consumer of the hub through Samebase's login, not a client of it.
10. **Samebase is a consumer, not the owner of the hub, and the last of the first three.** Reason:
    the hub must be proven on an app with fewer moving parts first; Bristol has users and no
    provisioning, MCP or password flows. Samebase follows once two apps run on the hub.
11. **First-party is an app-level admin decision.** Reason: RFC 9700 4.11. A registration token
    cannot change it. Third-party apps get a consent page.

## Validation

- Phase 1: the `openid-client` conformance test, the ported edge cases, and the real-payload parser
  tests.
- Phase 2: a GitHub sign-in to a scratch Convex Auth v2 app through `auth.samebase.com` from a dev
  deployment and from a preview deployment, each registered by the script, with one callback URL
  added to the GitHub App and one redirect URI added to the Google client, and no new app. The audit
  row shows the client, the connector and the pairwise subject and nothing else.
  `npx convex env set --deployment <preview name>` under the preview deploy key is the one CLI claim
  to prove here.
- Phase 3: Bristol signs in through the hub on prod, dev and a preview; the Bristol GitHub OAuth app
  is deleted afterwards.
- Phase 4: the existing Samebase users sign in through the hub and land on their existing `users`
  rows; a Samebase preview deployment signs in with GitHub; the password flow is unchanged.
- A log and screenshot check that no token, code, or email appears in Convex logs.

## Non-Goals

- Single sign-on across apps, sessions at the broker, refresh tokens, `offline_access`.
- MFA, passkeys, SAML, account management, a hosted account page, an admin UI.
- Replacing the MCP authorization server or Samebase's own login.
- Serving other teams from `auth.samebase.com`. Another team forks the hub template.

## Open Questions

- Repository and package names: `identity-broker` and `identity-hub`, or a product name.
