# 043 Remote MCP OAuth Provider + Convex Architecture Spec

## Document Control

- Status: Proposed
- Owner: Noter platform
- Last updated: 2026-03-08
- Related specs:
  - `specs/020_CONVEX_AGENT_ADOPTION_SPEC.md`
  - `specs/026_PROVIDER_CONNECTIONS_SPEC.md`
  - `specs/029_AUTHENTICATED_PROVIDERS_ROUTE_SPEC.md`
  - `specs/031_CLOUDFLARE_MCP_OAUTH_LOGIN_SPEC.md`
  - `rfcs/032_CLOUDFLARE_HOSTING_PILOT_SPEC.md`
  - `specs/036_MCP_CONNECTION_TOKEN_HEALTH_VISIBILITY_SPEC.md`
  - `rfcs/038_RAILWAY_REMOVAL_AND_DATA_CLEANUP_SPEC.md`

## Summary

Build a hosted remote MCP server for `noter.md` plus an OAuth provider for that server, with all
server-side MCP and OAuth logic living in Convex.

The default architecture is:

1. Cloudflare fronts `https://noter.md` and remains the proxy, TLS, routing, WAF, and observability
   layer.
2. Convex `httpAction`s own the MCP transport and OAuth provider routes: `/mcp`, `/oauth/mcp/*`, and
   the required `/.well-known/*` metadata endpoints.
3. Convex stores OAuth clients, auth requests, grants, authorization codes, access tokens, refresh
   tokens, and audit history.
4. The existing `noter.md` React app renders consent and revocation UI against that Convex-backed
   state.

This is the simplest architecture that still matches the remote MCP model: same-origin public URLs,
Cloudflare control at the edge, and one backend system to implement and operate.

## Goals

- Expose a remote MCP server that ChatGPT web can connect to with OAuth.
- Keep the public MCP surface same-origin on `https://noter.md/mcp`.
- Put all MCP server and OAuth provider logic in the existing Convex app.
- Reuse Convex for durable state, user identity, approvals, audit, and tool execution.
- Keep provider-issued MCP tokens first-party to `noter.md`.
- Support dynamic client registration for clients such as ChatGPT.
- Preserve approval-first behavior for sensitive Noter operations.

## Non-Goals

- Creating a separate `apps/noter-mcp` service or standalone edge runtime.
- Making public MCP access tokens valid against unrelated Convex routes or app APIs.
- Reusing the browser app session token as an MCP access token.
- Passing GitHub, Cloudflare, or Convex provider tokens through to the MCP client.
- Shipping every optional MCP feature in v1.

## External Constraints

### MCP client expectations

Current remote MCP clients, including ChatGPT web, expect:

1. A hosted MCP server over remote HTTP transport.
2. OAuth as a first-class auth option.
3. Dynamic client registration when the client does not have a pre-provisioned client ID.

### MCP authorization expectations

The current MCP auth guidance implies these baseline requirements:

1. Authorization code plus PKCE for public clients.
2. Authorization server metadata discovery.
3. Protected resource metadata discovery.
4. Resource or audience binding so tokens are meant for the MCP server.
5. Refresh token support for long-lived interactive sessions.
6. Dynamic client registration support.

### Convex integration constraints

Convex gives us the pieces we need for a simple provider implementation:

1. `httpAction` can serve custom HTTP routes and return `Response`.
2. The existing app already has OAuth routes in `apps/noter/convex/http.ts`.
3. Convex is a strong fit for durable OAuth state, audit, and business logic.
4. Convex request handling is naturally request/response oriented, so v1 should favor a narrow MCP
   surface instead of assuming we need advanced edge session machinery on day one.

### Cloudflare integration constraints

Cloudflare is still the front door, but not the MCP application runtime:

1. Cloudflare should proxy the same-origin MCP and OAuth paths for `https://noter.md`.
2. If a Cloudflare Worker is needed for path routing, it should remain a thin proxy only and should
   not own MCP or OAuth business logic.
3. Cloudflare Web Analytics is useful for browser-facing site traffic.
4. MCP and OAuth observability should primarily come from Convex logs and audit data, with
   Cloudflare proxy metrics as a secondary signal.

## Decision

Use a Convex-first, same-origin architecture.

### Why this is the recommended shape

1. It is the simplest viable implementation that satisfies the remote MCP contract.
2. It avoids a second runtime and a second server codebase.
3. It keeps the MCP protocol, OAuth state, and tool execution in one backend.
4. Cloudflare still gives us the operational benefits we want at the edge.
5. It leaves room to move selective responsibilities to Cloudflare later without changing the public
   URLs.

### Why same-origin on `noter.md` is the default

1. The MCP spec allows the resource server and authorization server to share an origin.
2. ChatGPT does not require a dedicated `mcp.` subdomain.
3. Same-origin keeps consent, cookies, and user expectations simpler.
4. Cloudflare can still control, proxy, and observe the traffic at the edge.

### Rejected architecture: Worker-first split runtime

We are not making a Cloudflare Worker the main MCP or OAuth runtime in v1.

Reasons:

1. It adds a second place to implement auth, token issuance, and protocol behavior.
2. It forces a more complex token boundary before we know we need it.
3. The user explicitly wants the server logic to stay in Convex.
4. Convex already has the primitives needed for the first version.

### Rejected architecture: internal Convex JWT path in v1

We are not adding a second internal JWT audience or `customJwt` provider for the first
implementation.

Reasons:

1. It is useful only if we split the public MCP runtime away from Convex.
2. If Convex owns token issuance and token validation directly, the extra JWT hop adds complexity
   without buying much.
3. Opaque token lookup inside Convex is simpler to reason about and revoke.

### Acceptable future pivot

If we later need edge-issued JWTs, richer transport handling, or stronger edge rate controls, we can
move selective validation or transport work to Cloudflare. That should be a later optimization, not
the starting point.

## High-Level Architecture

### Public surfaces

#### 1. Protected resource

- Origin: `https://noter.md`
- Endpoints:
  - `/mcp`
  - `/.well-known/oauth-protected-resource`

#### 2. Authorization server

- Origin: `https://noter.md`
- Endpoints:
  - `/oauth/mcp/authorize`
  - `/oauth/mcp/token`
  - `/oauth/mcp/register`
  - `/.well-known/oauth-authorization-server`

#### 3. Main app UI

- Origin: `https://noter.md`
- Responsibilities:
  - user login
  - consent UI
  - grant management UI
  - revocation UI

### Request path

1. MCP client or browser hits `https://noter.md/...`.
2. Cloudflare proxies the MCP and OAuth paths to Convex.
3. Convex `httpAction`s validate the request, load or mutate OAuth state, and run the appropriate
   backend logic.
4. The React app uses normal app auth to let the signed-in user approve or revoke grants.

## Component Responsibilities

### Cloudflare

Responsibilities:

1. Proxy same-origin MCP and OAuth paths.
2. Provide TLS termination, WAF, caching policy, and traffic control.
3. Provide top-level request visibility for `noter.md`.
4. Keep control of the public edge without owning the application logic.

### Convex HTTP actions

Responsibilities:

1. Serve protected resource metadata.
2. Serve authorization server metadata.
3. Handle dynamic client registration.
4. Create and validate authorization requests.
5. Exchange auth codes for access and refresh tokens.
6. Validate access tokens on `/mcp`.
7. Execute MCP tools against existing Noter backend logic.

### Convex internal modules

Responsibilities:

1. Store OAuth clients, requests, grants, codes, tokens, and audit events.
2. Resolve the authenticated Noter user for consent decisions.
3. Reuse existing provider connection, vault, infra, and approval-first logic.
4. Centralize scope checks and grant revocation.

### Existing web app

Responsibilities:

1. Render consent UI for an authorization request.
2. Let the user approve or deny a client request.
3. Let the user review and revoke existing MCP grants.

## Cloudflare Routing Model

Default shape:

1. Cloudflare continues serving or proxying the main `noter.md` application.
2. Cloudflare proxies MCP and OAuth routes to Convex on the same public host.
3. Any Cloudflare Worker used for routing should stay a thin proxy and should not contain OAuth,
   token, or MCP business logic.

Recommended route patterns:

- `noter.md/mcp*`
- `noter.md/oauth/mcp/*`
- `noter.md/.well-known/oauth-protected-resource`
- `noter.md/.well-known/oauth-authorization-server`

## Observability and Analytics

The simple design should use the simplest matching telemetry sources:

1. Use Cloudflare Web Analytics for browser-facing page traffic on `noter.md`.
2. Use Convex logs and MCP audit tables for protocol-level visibility.
3. Use Cloudflare proxy metrics and request traces as a secondary network-level signal.

Implications:

1. We still get Cloudflare control and broad traffic visibility.
2. We do not need a Worker runtime just to gain analytics.
3. MCP-specific debugging should center on Convex because that is where token validation and tool
   execution happen.

## Token Model

The simplest viable v1 is fully opaque.

### 1. Browser session

This is the existing `noter.md` app session used only for login and consent UI.

### 2. Authorization code

Use a short-lived opaque authorization code stored in Convex.

Rules:

1. One-time use.
2. Bound to `client_id`, `redirect_uri`, PKCE challenge, resource, and user.
3. TTL must be 5-10 minutes (recommend 10 minutes in v1).

### 3. Access token

Use an opaque bearer token generated with at least 128 bits of entropy and stored only as the
SHA-256 hash in Convex.

Rules:

1. First-party to `noter.md`.
2. Bound to `client_id`, `grant_id`, `user_id`, resource, and scope.
3. TTL must be 1-24 hours (recommend 1 hour in v1; shorten further per threat model).
4. Validated by lookup inside Convex on every `/mcp` call.
5. Not accepted by unrelated app routes or internal Convex auth.

### 4. Refresh token

Use an opaque refresh token generated with at least 128 bits of entropy and stored only as the
SHA-256 hash in Convex.

Rules:

1. Rotated on use.
2. Revoked when the grant is revoked.
3. Never exposed back to the app except at issuance time.

### 5. No JWT access token in v1

We should not add JWT access tokens or a JWKS endpoint in the first version.

Reasons:

1. Convex is both the issuer and validator in this architecture.
2. Opaque tokens simplify revocation and reduce accidental reuse outside `/mcp`.
3. We can add JWT access tokens later if external validation becomes necessary.

## Convex Auth Configuration

No `apps/noter/convex/auth.config.ts` change is required for v1.

The existing app-login provider remains unchanged. MCP access tokens are not fed into `ctx.auth`;
they are validated explicitly inside the MCP HTTP routes.

## Convex Data Model Additions

Add new tables for provider-side MCP auth.

### 1. `mcpOauthClients`

Stores dynamic and static client registrations.

Fields:

- `clientId`
- `clientName?`
- `redirectUris`
- `grantTypes`
- `responseTypes`
- `tokenEndpointAuthMethod` (v1 must be `"none"`)
- `createdAt`
- `updatedAt`
- `createdBy` (`"dynamic_registration"` or `"manual"`)
- `registrationStatus` (`provisional`, `active`, `expired`, `disabled`)
- `provisionalExpiresAt?`
- `firstTokenExchangedAt?`
- `metadataJson`

### 2. `mcpAuthRequests`

Pending authorization requests before user approval.

Fields:

- `requestId`
- `clientId`
- `redirectUri`
- `resource`
- `scope`
- `state`
- `codeChallenge`
- `codeChallengeMethod` (must be `"S256"`; `"plain"` must be rejected)
- `userId?`
- `status` (`pending`, `approved`, `denied`, `expired`)
- `createdAt`
- `expiresAt`

### 3. `mcpAuthorizationCodes`

One-time opaque auth codes produced after approval.

Fields:

- `codeHash`
- `requestId`
- `grantId`
- `clientId`
- `userId`
- `redirectUri`
- `resource`
- `scope`
- `expiresAt`
- `usedAt?`

### 4. `mcpGrants`

Durable approved grants.

Fields:

- `grantId`
- `userId`
- `clientId`
- `resource`
- `scope`
- `status` (`active`, `revoked`)
- `createdAt`
- `updatedAt`
- `lastUsedAt?`
- `metadataJson?`

### 5. `mcpAccessTokens`

Opaque MCP access token records.

Fields:

- `tokenHash`
- `grantId`
- `clientId`
- `userId`
- `resource`
- `scope`
- `createdAt`
- `expiresAt`
- `lastUsedAt?`
- `revokedAt?`

### 6. `mcpRefreshTokens`

Opaque refresh token records.

Fields:

- `grantId`
- `clientId`
- `userId`
- `tokenHash`
- `status` (`active`, `rotated`, `revoked`, `expired`)
- `createdAt`
- `expiresAt?`
- `rotatedAt?`
- `replacedByTokenHash?`

### 7. `mcpAccessAudit`

Immutable audit trail for registration, approval, issuance, refresh, use, and revocation.

Fields:

- `grantId?`
- `clientId?`
- `userId?`
- `action`
- `createdAt`
- `detailsJson?`

## MCP Tool Surface

Start narrow and align the tools with real Noter value.

Initial tools:

1. `vaults.list`
2. `vaults.get`
3. `files.read`
4. `files.write`
5. `commits.propose`
6. `prod.read.propose`

Rules:

1. Existing approval-first operations must keep their approval step.
2. MCP can create a proposal, but it must not silently bypass approval.
3. If direct `files.write` feels too broad at launch, we should narrow it to a proposal-style write
   flow instead of widening scopes elsewhere.

## Protocol Flow

### 1. Client registration

1. MCP client discovers auth metadata.
2. MCP client calls `/oauth/mcp/register`.
3. Convex applies strict metadata validation before persistence:
   - reject malformed or oversized `redirect_uris`, `client_name`, and `contacts`
   - require https redirect URIs in production (with explicit localhost/dev exceptions only where
     intended)
   - enforce fixed v1 bounds for field lengths and list sizes
4. Convex enforces `tokenEndpointAuthMethod = "none"` in v1 and rejects registrations requesting
   other methods.
5. Cloudflare applies per-IP throttling for `/oauth/mcp/register` and optional per-client throttling
   once a `client_id` exists.
6. Dynamic registrations are created as `provisional` and auto-expire if no token exchange occurs
   before `provisionalExpiresAt` (TTL must be 24-48 hours; recommend 24 hours in v1).
7. Convex returns `client_id`.

### 2. Authorization request

1. MCP client redirects the user to `/oauth/mcp/authorize`.
2. Convex validates request parameters and PKCE input.
3. Convex creates an `mcpAuthRequest`.
4. If the user is not signed in, redirect to the normal Noter login flow.
5. Show consent UI in the main app.
6. On approval, create or reuse an `mcpGrant` and mint an authorization code.
7. Redirect back to the client with the code and original `state`.

### 3. Token exchange

1. Client posts the authorization code plus PKCE verifier to `/oauth/mcp/token`.
2. Convex validates the code, PKCE verifier, client, redirect URI, and resource.
3. Convex enforces registered `tokenEndpointAuthMethod`; in v1 this means:
   - registered method must be `"none"`
   - client-auth credentials in token requests are rejected
4. On successful exchange, provisional clients are promoted to `active` and `firstTokenExchangedAt`
   is set.
5. Convex issues:
   - short-lived opaque access token
   - long-lived opaque refresh token
6. Only SHA-256 token hashes are stored in Convex for both access and refresh tokens.
7. Issuance is recorded in `mcpAccessAudit`.

### 4. MCP call

1. Client calls `/mcp` with `Authorization: Bearer <mcp_access_token>`.
2. Convex hashes the token and looks up the active token record.
3. Convex validates expiry, scope, resource, and grant status.
4. Convex runs the tool implementation as the associated user and grant.
5. Convex returns the MCP response.

### 5. Refresh

1. Client posts the refresh token to `/oauth/mcp/token`.
2. Convex validates the stored hash and grant status.
3. Convex rotates the refresh token.
4. Convex issues a new access token.

### 6. Revocation

1. User revokes a client grant from `noter.md`.
2. Convex marks the grant revoked and invalidates refresh and access tokens.
3. Future `/mcp` and refresh calls fail immediately for that grant.

## Consent UX

The consent screen must show:

1. client name
2. requested scopes
3. requested resource
4. whether the client was dynamically registered
5. a plain-language explanation of what the client will be able to do

Recommended shape:

1. `GET /oauth/mcp/authorize` creates `mcpAuthRequests`.
2. Convex redirects into an existing React route on `noter.md` for consent UI.
3. The React app reads the pending request and lets the user approve or deny.
4. Approval writes back to Convex, which completes the OAuth redirect.

Initial scopes:

- `vaults.read`
- `files.read`
- `files.write`
- `commits.propose`
- `prod.read.propose`

Do not introduce a blanket `admin` scope.

## Security Rules

1. Never hand third-party provider tokens to the MCP client.
2. Require PKCE for public clients with `code_challenge_method = "S256"` only; reject `"plain"`.
3. Require resource or audience validation on token exchange and `/mcp` requests.
4. Store authorization codes, access tokens, and refresh tokens only as SHA-256 hashes of
   cryptographically random tokens (minimum 128-bit entropy) and verify in constant time.
5. Rotate refresh tokens.
6. Keep access token TTL short.
7. Audit registration, approval, issuance, refresh, use, and revocation.
8. Preserve approval-first semantics for sensitive Noter operations.
9. Keep Cloudflare proxy logic thin so there is one authoritative backend path.
10. Enforce strict dynamic-registration validation and route throttling in Phase 1.
11. Automatically expire never-used provisional dynamic registrations.
12. Enforce v1 `tokenEndpointAuthMethod = "none"` in both registration and token exchange.
13. Recommended TTL defaults can be tightened further based on the deployment threat model.

## Recommended Repo Layout

No new app is required.

Recommended additions inside `apps/noter/convex`:

- `http.ts`
- `mcp/http.ts`
- `mcp/oauth.ts`
- `mcp/protocol.ts`
- `mcp/tokens.ts`
- `mcp/grants.ts`
- `mcp/audit.ts`
- `mcp/tools.ts`

Responsibilities:

1. `http.ts` wires new public routes.
2. `mcp/http.ts` owns HTTP handlers and route-level parsing.
3. `mcp/oauth.ts` owns registration, authorize, token, and metadata behavior.
4. `mcp/protocol.ts` owns protocol validation and metadata shaping.
5. `mcp/tokens.ts` owns token creation, hashing, validation, and rotation.
6. `mcp/grants.ts` owns grant creation, listing, and revocation.
7. `mcp/audit.ts` owns immutable audit writes.
8. `mcp/tools.ts` maps MCP tool calls into existing Noter backend operations.

Frontend additions can stay inside the existing app for:

1. consent UI
2. grant management UI
3. revoke flow

## Rollout Plan

### Phase 1: data model and metadata skeleton

1. Add the new Convex tables.
2. Add metadata and registration routes in `convex/http.ts`.
3. Add authorize route scaffolding and a minimal consent flow.
4. Implement dynamic-registration abuse controls in v1:
   - strict metadata validation
   - Cloudflare throttling for `/oauth/mcp/register`
   - provisional-registration expiry for never-used clients

### Phase 2: token issuance and narrow MCP server

1. Implement opaque auth code, access token, and refresh token handling.
2. Implement `/mcp` with a minimal tool surface.
3. Validate ChatGPT web connection end to end through the Cloudflare-fronted same-origin path.

### Phase 3: user controls

1. Add consent polish.
2. Add connected-client management UI.
3. Add revoke flow and audit visibility.

### Phase 4: hardening

1. Add cleanup jobs for expired auth codes and tokens.
2. Add tighter Cloudflare proxy rules and rate controls if needed.
3. Expand scopes and tools carefully based on real usage.

## Implementation Policy

This is the required execution approach for this project:

1. Work phase-by-phase in order.
2. For each phase, write phase-scoped automated tests first.
3. Implement only enough code to make that phase pass.
4. Run manual smoke checks for that phase before moving to the next one.
5. Keep CI green; do not keep intentionally failing future-phase tests in the branch.

Rules:

1. Future-phase coverage should be recorded as docs/checklists, not failing tests.
2. Do not remove tests that already passed in earlier phases; adapt only when behavior changes with
   explicit spec updates.
3. Each checkpoint commit should include code + tests + tracker update in this spec.

## Test Strategy

### Test organization

1. Keep a full test matrix documented up front in this spec and `manual-tests/`.
2. Add automated tests incrementally per phase in `apps/noter/convex/*.test.ts` and related frontend
   test files when needed.
3. Keep manual test playbooks in `manual-tests/` as stable smoke checks.

Recommended manual test docs to add:

1. `manual-tests/MCP-001-phase1-foundation-and-discovery.md`
2. `manual-tests/MCP-002-phase2-token-and-mcp-flow.md`
3. `manual-tests/MCP-003-phase3-consent-and-revocation.md`
4. `manual-tests/MCP-004-phase4-hardening-and-operations.md`

### Phase gates

Phase 1 gate:

1. `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server` return
   valid JSON.
2. `/oauth/mcp/register` validates input and persists clients.
3. `/oauth/mcp/authorize` validates request shape and produces deterministic redirect/error
   behavior.
4. Dynamic-registration abuse controls are active:
   - strict field validation and bounds
   - Cloudflare per-IP throttling for `/oauth/mcp/register`
   - provisional-registration expiry for never-used clients
5. v1 registration rejects unsupported `tokenEndpointAuthMethod` values.

Phase 2 gate:

1. Authorization code + PKCE exchange works at `/oauth/mcp/token`.
2. Opaque access and refresh tokens are stored as hashes and audited.
3. `/mcp` rejects missing/invalid tokens and enforces scope/resource checks.
4. Minimal tool call (`vaults.list`) works with a valid scoped token.
5. Refresh token rotation is enforced.

Phase 3 gate:

1. Consent UI can approve/deny pending auth requests.
2. Connected-client list and revoke flow work for signed-in users.
3. Revoked grants immediately block refresh and new MCP calls.

Phase 4 gate:

1. Expired auth artifacts are cleaned up by scheduled jobs.
2. Cloudflare proxy and rate-control rules are documented and validated.
3. Audit and logs are sufficient to trace failures end to end.

### Standard test run per checkpoint

1. `pnpm check`
2. `pnpm test`
3. Phase-specific manual smoke checklist in `manual-tests/`

## Execution Tracker

Use this as the chat-independent implementation tracker so a new session can resume without relying
on conversation context.

- Last updated: 2026-03-08
- Overall status: `2/4 phases complete`
- Current next step: `Phase 3`
- Latest checkpoint commit: `a581061`
- Test policy: `Phase-by-phase tests first; no long-lived failing future tests`

Phase status:

- [x] Phase 1: data model and metadata skeleton
- [x] Phase 2: token issuance and narrow MCP server
- [ ] Phase 3: user controls
- [ ] Phase 4: hardening

Phase 3 progress notes:

- 2026-03-08: `/oauth/mcp/authorize` redirect-to-app flow now targets the React app origin (instead
  of Convex `"/"`), and the app handles `mcp_consent_request` with explicit client/resource/scope
  consent (Approve/Deny) before redirecting back to the MCP client callback.

Checkpoint rule:

- After each implementation checkpoint commit, update this section with the new status and the
  latest commit SHA.

## Acceptance Criteria

1. ChatGPT web can connect to `https://noter.md/mcp` using OAuth.
2. Dynamic client registration works for a new client.
3. All server-side MCP and OAuth logic lives in Convex in v1.
4. No separate MCP service or Worker-owned auth runtime is required.
5. Existing approval-first behavior for sensitive operations is preserved.
6. Users can revoke grants and block future refreshes.

## Open Questions

1. Do we want direct `files.write` at launch, or only proposal-style writes?
2. Should consent always redirect into the React app, or should Convex also be able to render a
   minimal fallback approval page?
3. What access-token TTL is short enough for safety without making ChatGPT refresh too aggressively?
4. Do we need any non-POST transport support in v1, or is a narrow HTTP shape enough for the first
   ChatGPT integration?
5. At what scale would it be worth moving token validation or rate limiting from Convex into
   Cloudflare?

## Source Notes

Primary references used for this design:

1. OpenAI remote MCP and custom connector docs
2. MCP authorization and streamable HTTP specs
3. Cloudflare remote MCP guidance plus Cloudflare routing and analytics docs
4. Convex docs for HTTP actions and auth

Reference links:

- `https://developers.openai.com/api/docs/guides/developer-mode`
- `https://platform.openai.com/docs/guides/connectors-custom`
- `https://modelcontextprotocol.io/specification/2025-06-18/basic/transports`
- `https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization`
- `https://developers.cloudflare.com/agents/guides/remote-mcp-server/`
- `https://developers.cloudflare.com/workers/configuration/routing/routes/`
- `https://developers.cloudflare.com/web-analytics/get-started/`
- `https://developers.cloudflare.com/workers/observability/`
- `https://docs.convex.dev/functions/http-actions`
- `https://docs.convex.dev/auth`
