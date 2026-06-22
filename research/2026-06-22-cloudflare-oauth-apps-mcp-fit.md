# Cloudflare OAuth Apps And MCP Fit

- Status: research
- Date: 2026-06-22

## Executive Conclusion

Cloudflare's new OAuth Applications support is a fit for replacing the Cloudflare provider
connection currently labeled `mcp_oauth`. It is not a drop-in replacement for Samebase's own remote
MCP OAuth server.

There are two separate OAuth directions in the product:

1. Samebase as an OAuth provider for remote MCP clients at `/mcp` and `/oauth/mcp/*`.
2. Samebase as an OAuth client that obtains a user-scoped Cloudflare credential so Samebase can
   provision and inspect Cloudflare resources.

Cloudflare OAuth Applications applies to direction 2. Cloudflare Access Managed OAuth applies to
Access-protected resources and MCP portals. It could replace a custom auth layer only if Samebase
wanted Cloudflare Access to own MCP authentication for a protected resource. That does not match the
current Samebase MCP model because Samebase owns custom scopes, consent, grants, approval-first prod
access, and tool-level authorization in Convex.

Recommended path: add a standard Cloudflare OAuth App flow alongside the legacy Cloudflare MCP OAuth
connection, store it as `providerConnections(kind = "cloudflare", auth.method = "oauth")`, and route
that new method through direct typed Cloudflare REST calls. Keep `mcp_oauth` as legacy until
existing connections are reauthorized.

## Cloudflare Surfaces

### Cloudflare OAuth Applications

Docs:

- [OAuth Applications overview](https://developers.cloudflare.com/fundamentals/oauth/)
- [Create your OAuth client](https://developers.cloudflare.com/fundamentals/oauth/create-an-oauth-client/)
- [Integrate your OAuth client with Cloudflare](https://developers.cloudflare.com/fundamentals/oauth/integrate-with-cloudflare/)
- [Authorizing an application](https://developers.cloudflare.com/fundamentals/oauth/authorizing-an-application/)
- [Create OAuth Client API](https://developers.cloudflare.com/api/resources/iam/subresources/oauth_clients/methods/create/)
- [List OAuth Scopes API](https://developers.cloudflare.com/api/resources/iam/subresources/oauth_scopes/methods/list/)

What this provides:

1. A first-party Cloudflare authorization server for third-party apps accessing Cloudflare API
   resources on behalf of users.
2. Static OAuth client registration through the dashboard or
   `POST /accounts/{account_id}/oauth_clients`.
3. Authorization Code flow support. Cloudflare docs say third-party clients do not get client
   credentials, implicit, resource owner password, device code, or other grant types.
4. Server-side clients can use `client_secret_basic` or `client_secret_post`. Public clients use
   `token_endpoint_auth_method = "none"` plus PKCE.
5. Optional `refresh_token` grant support when the OAuth client includes `"refresh_token"` in
   `grant_types`.
6. Scopes are Cloudflare OAuth/API permission scope IDs, not the existing Cloudflare MCP scope
   strings. The scope endpoint is `GET /oauth/scopes`.
7. Private clients are limited to the parent Cloudflare account. Public clients can be authorized by
   any Cloudflare user, require logo, client URL, scopes, and client URL domain verification, and
   cannot be demoted back to private.

Relevant endpoints:

- Authorization: `https://dash.cloudflare.com/oauth2/auth`
- Token: `https://dash.cloudflare.com/oauth2/token`
- Revoke: `https://dash.cloudflare.com/oauth2/revoke`
- User info: `https://dash.cloudflare.com/oauth2/userinfo`
- OIDC config: `https://dash.cloudflare.com/.well-known/openid-configuration`
- JWKS: `https://dash.cloudflare.com/.well-known/jwks.json`

This is the surface that should replace the Cloudflare user connection currently implemented through
`https://mcp.cloudflare.com/register`, `/authorize`, and `/token`.

### Cloudflare API MCP Server

Docs:

- [Cloudflare's own MCP servers](https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/)

Cloudflare's API MCP server is at `https://mcp.cloudflare.com/mcp`. The docs say connecting a client
to that URL redirects to Cloudflare OAuth and asks the user to select permissions. They also say
automation can pass a Cloudflare API token as a bearer token.

Current Samebase uses this server as an API transport: it calls the MCP `execute` tool with
JavaScript that invokes `cloudflare.request(...)`. That was the right design before Cloudflare
exposed self-managed OAuth clients for direct Cloudflare API access. With OAuth Applications
available, keeping the MCP server in the hot path becomes a compatibility choice, not a requirement.

Open verification: Cloudflare docs do not explicitly say whether an OAuth Applications access token
is accepted as a bearer token by `https://mcp.cloudflare.com/mcp`. Do not assume this without a live
smoke test. The cleaner migration is direct REST for the new `oauth` method and legacy MCP transport
only for existing `mcp_oauth` rows.

### Cloudflare Access Managed OAuth

Docs:

- [Managed OAuth](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/)
- [Authenticate coding agents](https://developers.cloudflare.com/cloudflare-one/access-controls/authenticate-agents/)
- [Secure MCP servers with Access](https://developers.cloudflare.com/cloudflare-one/access-controls/ai-controls/secure-mcp-servers/)

Managed OAuth turns a Cloudflare Access-protected application or MCP portal into a standard OAuth
2.0 authorization server for non-browser clients. It supports OAuth metadata discovery, dynamic
client registration, authorization code plus PKCE, refresh tokens, and Access policy re-evaluation
on refresh.

This is not a Cloudflare API delegation mechanism. It is for clients accessing a resource protected
by Cloudflare Access. Cloudflare's docs explicitly warn not to enable Managed OAuth in front of an
app that already runs its own OAuth server and relies on its own `WWW-Authenticate` behavior.

Managed OAuth would be a fit only if Samebase wanted Cloudflare Access to own the authentication
boundary for a protected MCP endpoint. That would be a different product shape from the current
Convex-owned MCP OAuth implementation.

## Current Samebase Implementation

### Cloudflare Provider Connection

Current code:

- `apps/samebase/convex/cloudflareMcpOAuth.ts`
- `apps/samebase/convex/cloudflareMcp.ts`
- `apps/samebase/convex/cloudflareApi/client.ts`
- `apps/samebase/convex/providerConnections.ts`
- `apps/samebase/convex/users.ts`
- `apps/samebase/src/components/ProviderConnectionsPage.tsx`

Current flow:

1. `/oauth/cloudflare-mcp/start` and `/oauth/cloudflare-mcp/callback` are wired in
   `apps/samebase/convex/http.ts`.
2. `cloudflareMcpOAuth.ts` registers a dynamic public client at
   `https://mcp.cloudflare.com/register`, requests PKCE authorization at
   `https://mcp.cloudflare.com/authorize`, and exchanges or refreshes at
   `https://mcp.cloudflare.com/token`.
3. The requested scopes are MCP-specific strings: `user:read`, `account:read`, `offline_access`,
   `workers:read`, `workers:write`, `workers_scripts:write`, `workers_builds:read`, and
   `workers_builds:write`.
4. The callback stores `providerConnections(kind = "cloudflare")` with `auth.method = "mcp_oauth"`,
   an access token, refresh token, expiry, and Cloudflare MCP client id.
5. `resolveConnectionForUser` refreshes near-expiry or forced Cloudflare MCP tokens and updates
   `tokenHealth`.
6. `users.refreshCloudflareMcpTokenIfNeeded` owns refresh locking, debounce, retry scheduling,
   manual checks, and the UI status contract.
7. Cloudflare API calls go through `requestCloudflareApi`, which formats a typed OpenAPI path, calls
   the Cloudflare MCP `execute` tool, parses the Cloudflare response envelope, and validates the
   response with generated AJV validators.

### Samebase Remote MCP OAuth Server

Current code:

- `apps/samebase/convex/http.ts`
- `apps/samebase/convex/mcp/http.ts`
- `apps/samebase/convex/mcp/oauth.ts`
- `apps/samebase/convex/mcp/protocol.ts`
- `apps/samebase/convex/mcp/tokens.ts`
- `apps/samebase/src/routes/mcp-consent.tsx`
- `apps/samebase/src/components/McpConsentRoutePage.tsx`

Current flow:

1. Samebase serves MCP protected resource metadata and authorization server metadata.
2. Samebase supports dynamic client registration at `/oauth/mcp/register`.
3. Samebase validates authorization requests, PKCE, redirect URIs, resource binding, and scopes at
   `/oauth/mcp/authorize`.
4. Samebase redirects users into the React app for consent at `/oauth/mcp/consent`.
5. Samebase issues opaque authorization codes, access tokens, and refresh tokens from Convex.
6. Samebase stores hashed MCP tokens and durable grants in Convex tables: `mcpOauthClients`,
   `mcpAuthRequests`, `mcpAuthorizationCodes`, `mcpGrants`, `mcpAccessTokens`, `mcpRefreshTokens`,
   and `mcpAccessAudit`.
7. `/mcp` validates the bearer token hash and resource before listing or calling tools.
8. Tool access is limited by Samebase scopes: `vaults.read`, `files.read`, `files.write`,
   `commits.propose`, and `prod.read.propose`.

This flow should not be replaced by Cloudflare OAuth Applications. Cloudflare OAuth Applications
produce Cloudflare API tokens for Samebase as a client. They do not issue Samebase MCP tokens or
express Samebase tool scopes.

## Spec Constraints

Important source documents:

- `rfcs/031_CLOUDFLARE_MCP_OAUTH_LOGIN_SPEC.md`
- `rfcs/036_MCP_CONNECTION_TOKEN_HEALTH_VISIBILITY_SPEC.md`
- `rfcs/043_REMOTE_MCP_OAUTH_PROVIDER_CONVEX_ARCHITECTURE_SPEC.md`
- `rfcs/044_CLOUDFLARE_MCP_AUTO_TOKEN_REFRESH_SPEC.md`
- `rfcs/062_MCP_DUAL_ORIGIN_CONSENT_LOGIN_REDIRECT_SPEC.md`
- `rfcs/063_MCP_PREACCOUNT_ONBOARDING_FLOW_SPEC.md`
- `specs/004_AI_PROD_ACCESS_POLICY_SPEC.md`
- `specs/104_CLOUDFLARE_MCP_API_VALIDATION_SPEC.md`

Constraints to preserve:

1. Normal users connect Cloudflare through web OAuth, not a manual API-token button.
2. Provider credentials stay server-side in `providerConnections`.
3. Cloudflare connection status keeps expiry-derived health, refresh health, manual check,
   auto-refresh, debounce, locks, stale-lock recovery, and sanitized errors.
4. Account selection stays explicit. If a token exposes multiple accounts, the connection is valid
   but provisioning remains blocked until an account is selected.
5. Samebase's own remote MCP server remains Convex-owned unless a new accepted spec moves that
   responsibility.
6. AI prod access remains proposal-first, approval-gated, read-only at execution time, redacted,
   audited, and TTL-bound.
7. Existing `mcp_oauth` transport behavior is accepted spec. Changing new Cloudflare OAuth App
   connections to direct REST is acceptable only as a new auth method or spec update, not as a
   silent behavior change to legacy `mcp_oauth`.

## Recommended Architecture

### 1. Register One Cloudflare OAuth App

Use this production app configuration:

- Client name: `Samebase`
- Client URI: `https://samebase.com`
- Redirect URI: `https://samebase.com/oauth/cloudflare/callback`
- Response types: `["code"]`
- Grant types: `["authorization_code", "refresh_token"]`
- Token endpoint auth method: `client_secret_basic`
- Visibility: public, after `samebase.com` domain verification succeeds

Use `GET /oauth/scopes` to derive the exact API permission scope IDs before finalizing the client.
Do not reuse the current colon-delimited MCP scopes or protocol scopes that Cloudflare derives from
client metadata. The target scope set should cover only the Cloudflare API paths Samebase calls
today:

- `/accounts`
- `/accounts/{account_id}/workers...`
- `/accounts/{account_id}/builds...`

The implementation should fail closed if the OAuth token cannot list accounts or cannot call the
covered Workers and Workers Builds endpoints.

### 2. Add A Standard Cloudflare OAuth Module

Add a new module modeled after `githubOAuth.ts` and `convexOAuth.ts`, not after Samebase's MCP OAuth
provider:

- `apps/samebase/convex/cloudflareOAuth.ts`
- `GET /oauth/cloudflare/start`
- `GET /oauth/cloudflare/callback`

Use:

- `PROVIDER_CLOUDFLARE_OAUTH_CLIENT_ID`
- `PROVIDER_CLOUDFLARE_OAUTH_CLIENT_SECRET`
- `PROVIDER_CLOUDFLARE_OAUTH_REDIRECT_URL`

Use Cloudflare endpoints:

- authorize: `https://dash.cloudflare.com/oauth2/auth`
- token: `https://dash.cloudflare.com/oauth2/token`
- revoke: `https://dash.cloudflare.com/oauth2/revoke`

The flow should:

1. Create an `oauthStates(provider = "cloudflare")` row.
2. Redirect to Cloudflare with `response_type = code`, state, requested scopes, and the redirect
   URI.
3. Exchange the code server-side using the client secret.
4. Require `access_token`, `refresh_token`, and `expires_in` in the callback response.
5. Resolve the default account with the new token.
6. Store `providerConnections(kind = "cloudflare", auth.method = "oauth")`.
7. Delete the one-time OAuth state only after a terminal success or failure.

### 3. Widen The Cloudflare Provider Auth Union

Current schema allows Cloudflare to use only `mcp_oauth` and `api_key`.

Change Cloudflare provider auth to allow:

- `oauth`: standard Cloudflare OAuth Applications credential.
- `mcp_oauth`: legacy Cloudflare MCP OAuth credential.
- `api_key`: seed/bootstrap credential.

Do not remove `mcp_oauth` in the first pass. Existing user rows need a reconnect window, and legacy
transport has different token semantics.

### 4. Split Cloudflare API Transport By Auth Method

Keep one typed API boundary, but let it choose transport explicitly:

1. `auth.method = "mcp_oauth"`: keep current Cloudflare MCP `execute` transport.
2. `auth.method = "api_key"`: keep current behavior unless a spec changes seed behavior.
3. `auth.method = "oauth"`: call `https://api.cloudflare.com/client/v4` directly with
   `Authorization: Bearer <access_token>`.

The direct REST path should reuse the existing OpenAPI path typing and AJV response validation in
`apps/samebase/convex/cloudflareApi/client.ts`. The main change is the transport function, not the
feature-level Cloudflare callsites.

This avoids betting on undocumented behavior for OAuth App tokens at `mcp.cloudflare.com/mcp` and
removes one indirection for the standard OAuth App flow.

### 5. Generalize Token Health Naming

Storage can initially reuse `providerConnections.tokenHealth` because it is already generic enough.
Public query fields such as `mcpTokenStatus` are Cloudflare-MCP-specific names and should be
replaced or supplemented with generic Cloudflare token fields when `auth.method = "oauth"` ships.

Recommended public status shape:

```ts
{
  connected: boolean;
  accountId?: string;
  accountName?: string;
  authMethod?: "oauth" | "mcp_oauth" | "api_key";
  tokenStatus?: "valid" | "expiring_soon" | "expired" | "invalid" | "unknown";
  tokenExpiresAt?: number;
  tokenCheckedAt?: number;
  tokenError?: string;
  tokenRefreshStartedAt?: number;
  tokenLastRefreshAt?: number;
  tokenNextAutoCheckAt?: number;
}
```

Keep old `mcpToken*` fields temporarily if existing UI needs a compatibility bridge.

### 6. Migration And Rollout

1. Add the new OAuth App flow and direct REST transport behind `auth.method = "oauth"`.
2. Keep the Providers UI button labeled Cloudflare OAuth and point new connections to
   `/oauth/cloudflare/start`.
3. Continue showing existing `mcp_oauth` connections as connected, but prompt reconnect when they
   expire or fail refresh.
4. Do not silently convert existing `mcp_oauth` rows. There is no stored Cloudflare OAuth App grant
   to convert; users must authorize the new app.
5. After a stable reconnect window, remove legacy MCP OAuth start/callback code only if no live rows
   use `mcp_oauth`.
6. Update `specs/104_CLOUDFLARE_MCP_API_VALIDATION_SPEC.md` before making direct REST the default
   for standard `oauth`.

## Verification Plan

Docs and setup:

1. Create a private OAuth client first, then promote to public after domain verification and scope
   confirmation.
2. Use `GET /oauth/scopes` with an operator token to pin the exact API permission scope IDs for
   Workers and Workers Builds. Do not include protocol scopes such as `offline_access` in the
   application-requested permission scope list; Cloudflare adds or removes those automatically from
   the OAuth client based on `grant_types` and `response_types`.
3. Confirm the authorization consent screen allows selecting the intended user accounts and shows
   only the intended permissions.

Backend tests:

1. Unit-test Cloudflare OAuth authorize URL construction.
2. Unit-test token exchange response validation and redacted error formatting.
3. Convex-test `providerConnections` storage for `auth.method = "oauth"`.
4. Unit-test refresh success, invalid grant classification, and transient error token-health
   behavior.
5. Unit-test direct REST transport with the same OpenAPI response validators as the MCP transport.

Route and UI tests:

1. Add route tests for `/oauth/cloudflare/start` and callback error cases.
2. Update Providers UI tests for `oauth`, `mcp_oauth`, and `api_key` Cloudflare statuses.
3. Keep route-first validation for provider connection UI changes.

Live smoke:

1. Authorize Cloudflare from Samebase with the OAuth App.
2. List accounts through direct REST.
3. Select an account when multiple accounts are exposed.
4. Create or connect a Worker using the selected account.
5. Force token refresh and confirm status updates.
6. Revoke the app from Cloudflare's authorized applications page and confirm Samebase reports
   invalid token and prompts reconnect.

Optional smoke:

1. Try using the OAuth App access token against `https://mcp.cloudflare.com/mcp`.
2. If Cloudflare documents and supports that path, Samebase could keep MCP transport for all
   methods. Until then, direct REST is the safer standard OAuth App path.

## Open Questions

1. Exact Cloudflare OAuth API permission scope IDs for Workers Builds and script writes must be
   confirmed with `GET /oauth/scopes`. The docs intentionally make that endpoint the source of truth
   for API permission scopes; protocol scopes such as `offline_access` are not returned there.
2. Cloudflare's OAuth App token response schema is not fully shown in the high-level docs.
   Implementation should validate the live response before assuming refresh token and expiry
   behavior.
3. Public OAuth App promotion is permanent. Production should verify branding, client URL, logo,
   policy URL, terms URL, and scope list before promotion.
4. If Samebase wants Cloudflare Access to protect its own MCP endpoint later, that is a separate
   architecture decision involving Managed OAuth, not the Cloudflare API OAuth App migration.
