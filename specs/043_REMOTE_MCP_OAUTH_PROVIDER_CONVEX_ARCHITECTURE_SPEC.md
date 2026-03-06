# 043 Remote MCP OAuth Provider + Convex Architecture Spec

## Document Control

- Status: Proposed
- Owner: Noter platform
- Last updated: 2026-03-07
- Related specs:
  - `specs/020_CONVEX_AGENT_ADOPTION_SPEC.md`
  - `specs/026_PROVIDER_CONNECTIONS_SPEC.md`
  - `specs/029_PROVIDERS_PANEL_SETTINGS_SPEC.md`
  - `specs/031_CLOUDFLARE_MCP_OAUTH_LOGIN_SPEC.md`
  - `specs/032_CLOUDFLARE_HOSTING_PILOT_SPEC.md`
  - `specs/036_MCP_CONNECTION_TOKEN_HEALTH_VISIBILITY_SPEC.md`
  - `specs/038_RAILWAY_REMOVAL_AND_DATA_CLEANUP_SPEC.md`

## Summary

Build a hosted remote MCP server for `noter.md` plus an OAuth 2.1 provider for
that server, fronted by Cloudflare on the same public origin.

The recommended architecture is:

1. Cloudflare fronts `https://noter.md` and owns routing, proxying,
   observability, and access control.
2. A Cloudflare Worker route on `noter.md` owns the MCP transport and OAuth
   provider surface at path-based routes such as `/mcp` and `/oauth/mcp/*`.
3. Convex remains the system of record for users, grants, approvals, audit, and
   business operations.
4. The Worker talks to Convex as the authenticated user through a dedicated
   internal JWT audience, not through the public MCP access token.

This keeps the public integration surface same-origin and Cloudflare-controlled
while preserving Noter's existing Convex data model and approval-first backend
behavior.

## Goals

- Expose a remote MCP server that ChatGPT web can connect to with OAuth.
- Keep provider-issued MCP tokens first-party to `noter.md`.
- Reuse Convex for durable state, user identity, approvals, and tool
  implementations.
- Avoid giving MCP clients direct access to Convex deployment credentials or
  third-party provider tokens.
- Keep the design compatible with dynamic client registration.
- Preserve a clean path to richer transports, notifications, and revocation.

## Non-Goals

- Shipping every MCP feature in v1.
- Replacing existing in-app chat or approval flows.
- Letting MCP clients call Convex APIs directly.
- Reusing the browser app session token as an MCP access token.
- Passing GitHub, Cloudflare, Convex, or Netlify provider tokens through to the
  MCP client.

## External Constraints

### MCP client expectations

Current MCP clients, including ChatGPT web, expect a remote MCP server to
support remote auth patterns instead of local secrets. The relevant behaviors
from the current docs are:

1. Remote MCP over streaming HTTP is supported.
2. OAuth is a first-class auth option.
3. Dynamic client registration should be supported when the client does not have
   a pre-provisioned client ID.

### MCP authorization expectations

The current MCP auth guidance and Cloudflare's provider implementation align on
these requirements:

1. Authorization code with PKCE for public clients.
2. Authorization server metadata discovery.
3. Protected resource metadata discovery.
4. Resource or audience binding so access tokens are meant for the MCP server.
5. Refresh token support for long-lived interactive sessions.
6. Dynamic client registration support.

### Convex integration constraints

Convex gives us the pieces we need, but not as a turnkey OAuth provider:

1. `httpAction` can serve custom HTTP routes and return `Response`.
2. Convex supports custom domains.
3. Convex can verify JWTs from a custom issuer via `type: "customJwt"`.
4. `ConvexHttpClient` can set a JWT for server-side authenticated calls.
5. Convex is a strong fit for durable state and business logic, but MCP
   transport concerns like session fan-out, resumable streams, and transport
   compatibility are a better fit for a purpose-built front door.

### Cloudflare integration constraints

Cloudflare is the default front door, but the practical implementation details
matter:

1. Workers Routes are the right fit when `noter.md` already has an external
   origin and we want Cloudflare code to run on specific paths before proxying.
2. Cloudflare Web Analytics is available on all plans and works well for the
   browser-facing site, especially when traffic is proxied through Cloudflare.
3. Web Analytics is not enough for API or MCP traffic; `/mcp` and `/oauth/mcp/*`
   need Workers metrics and logs.
4. Origin Rules host-header and DNS override are not broadly available on lower
   plans, so a Worker route is a safer default than relying on origin rewrite
   features for Convex integration.

## Decision

Use a split architecture with Cloudflare as the same-origin edge layer on
`https://noter.md` and Convex as the authoritative backend.

### Why this is the recommended shape

1. It matches the way Cloudflare structures remote MCP auth: a hosted resource
   server plus hosted OAuth provider behavior.
2. It keeps the public `noter.md` origin under Cloudflare control, including
   routing, WAF, analytics, and observability.
3. It lets Convex remain focused on identity, grants, tool execution, and data.
4. It avoids making public MCP bearer tokens directly valid against Convex.
5. It gives us a clean place to support streaming HTTP, SSE if needed, and
   future transport upgrades without entangling them with Convex internals.

### Why same-origin on `noter.md` is now the default

1. The MCP spec allows the resource server and authorization server to share an
   origin.
2. ChatGPT does not require a dedicated `mcp.` subdomain.
3. Cloudflare can proxy or terminate the MCP and OAuth paths directly on
   `noter.md`.
4. Same-origin keeps consent and auth UX simpler.
5. Cloudflare becomes the single place to add edge auth protections, traffic
   controls, request tracing, and analytics.

### Rejected architecture: direct Convex-only public surface

A pure Convex design is possible for a narrow MVP, but it is not the preferred
end state.

Reasons:

1. Convex is not an OAuth provider framework.
2. We want Cloudflare, not Convex, to own the public edge behavior for
   `noter.md`.
3. MCP transport evolution is likely to move faster than Convex-specific HTTP
   ergonomics.
4. We want a clean issuer, JWKS, token surface, and resource paths that can be
   evolved behind Cloudflare without exposing Convex directly.

### Rejected architecture: Cloudflare Origin Rules as the primary bridge

Origin Rules are not the default bridge for this design.

Reasons:

1. The required host-header and DNS override controls are not broadly available
   on lower plans.
2. A Worker route gives us explicit code-level control over auth, headers,
   caching, observability, and error handling.
3. The Worker can call Convex directly with `ConvexHttpClient` instead of
   treating Convex as a blind HTTP origin.

### Acceptable spike: narrow Convex-only MVP

If we need the fastest possible integration spike, we can temporarily implement:

1. Metadata endpoints in Convex `http.ts`
2. DCR, authorize, and token endpoints in Convex `httpAction`
3. A stateless `/mcp` POST-only path in Convex for basic tool invocation

This should be treated as a spike, not the target architecture.

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
  - `/.well-known/jwks.json`

#### 3. Main app UI

- Origin: `https://noter.md`
- Responsibilities:
  - user login
  - consent UI
  - account settings
  - revocation UI

## Component Responsibilities

### Cloudflare Worker at `noter.md`

Responsibilities:

1. Serve MCP transport.
2. Serve OAuth metadata.
3. Handle dynamic client registration.
4. Issue authorization codes, access tokens, and refresh tokens.
5. Validate MCP access tokens on `/mcp`.
6. Mint a short-lived internal Convex JWT for backend calls.
7. Translate MCP tool calls into Convex actions or queries.

Recommended implementation target:

- A dedicated Worker app in this repo, for example `apps/noter-mcp`.

Recommended route shape:

- `noter.md/mcp`
- `noter.md/oauth/mcp/*`
- `noter.md/.well-known/oauth-protected-resource`
- `noter.md/.well-known/oauth-authorization-server`
- `noter.md/.well-known/jwks.json`

### Convex

Responsibilities:

1. Store OAuth clients, grants, refresh tokens, and audit events.
2. Resolve current user identity and account state.
3. Host consent-state mutations and revocation APIs.
4. Execute the real MCP tool logic.
5. Reuse existing provider connection, vault, infra, and approval-first
   behavior.

### Existing web app

Responsibilities:

1. Render consent UI.
2. Let the signed-in user approve or deny a client request.
3. Let the user review and revoke existing MCP grants.

## Cloudflare Routing Model

Default shape:

1. Cloudflare continues serving or proxying the main `noter.md` application.
2. A Worker Route handles MCP and OAuth paths only.
3. The Worker does not proxy raw public MCP tokens into Convex.
4. The Worker either:
   - calls Convex via `ConvexHttpClient`, or
   - proxies to narrowly-scoped Convex HTTP actions when that is the better fit
     for a given operation.

Recommended initial route patterns:

- `noter.md/mcp*`
- `noter.md/oauth/mcp/*`
- `noter.md/.well-known/oauth-protected-resource`
- `noter.md/.well-known/oauth-authorization-server`
- `noter.md/.well-known/jwks.json`

Convex custom domain note:

1. The MCP and OAuth slice does not require a Convex custom domain.
2. The Worker can call the Convex deployment URL directly.
3. If we later want the broader app and realtime Convex traffic to appear on a
   first-party domain, we should revisit Convex custom domains separately.

## Cloudflare Observability and Analytics

Cloudflare gives us useful built-in visibility, but the data sources are
different:

1. Use Cloudflare Web Analytics for browser-facing traffic on `noter.md`.
2. Use Workers metrics, logs, and traces for MCP and OAuth traffic.
3. Do not treat Web Analytics as a substitute for API-level or tool-level
   observability.

Implications:

1. We can get website analytics without adding a third-party script stack.
2. We can inspect `/mcp` request counts, errors, and durations at the Worker
   layer.
3. We can add request IDs, structured logs, and rate controls before Convex sees
   the request.
4. If we later remove Netlify entirely, Cloudflare becomes the natural place for
   routing, analytics, WAF, and edge policy enforcement.

## Token Model

### 1. Browser session token

This is the existing `noter.md` user session. It remains between the browser and
the main app only.

### 2. MCP access token

This is minted by the OAuth provider for the MCP client.

Rules:

1. It is first-party to `noter.md`.
2. It is audience-bound to `https://noter.md/mcp`.
3. It is accepted only by the MCP edge service.
4. It is never accepted directly by Convex.

Recommended shape:

- JWT access token

Required claims:

- `iss = https://noter.md`
- `sub = user:<convexUserId>`
- `aud = https://noter.md/mcp`
- `client_id`
- `scope`
- `jti`
- `iat`
- `exp`

### 3. Refresh token

Use opaque refresh tokens, stored only as hashes in Convex.

Rules:

1. Refresh tokens are never exposed back to the main app except at issuance.
2. Refresh tokens are rotated on use.
3. Revocation is grant-wide.

### 4. Internal Convex JWT

The edge service mints a short-lived JWT only for server-to-server calls into
Convex.

Rules:

1. It is never returned to the MCP client.
2. It uses a different audience from the public MCP access token.
3. Convex verifies it with a `customJwt` provider.

Recommended claims:

- `iss = https://noter.md`
- `sub = user:<convexUserId>`
- `aud = noter-mcp-internal`
- `grant_id`
- `client_id`
- `scope`
- `exp`

## Why the internal Convex JWT matters

This is the key integration point with Convex.

Without it, the edge service would need to:

1. use an admin credential, or
2. pass raw user IDs into privileged Convex functions

Both are weaker than letting Convex see an authenticated user identity on every
request.

With a dedicated internal audience:

1. the public MCP access token cannot be replayed against Convex,
2. Convex functions can still use `ctx.auth.getUserIdentity()`,
3. existing user-scoped logic can be reused with much less special casing.

## Convex Auth Configuration Change

Extend `apps/noter/convex/auth.config.ts` with an additional provider:

```ts
{
  type: "customJwt",
  issuer: "https://noter.md",
  applicationID: "noter-mcp-internal",
  jwks: "https://noter.md/.well-known/jwks.json",
  algorithm: "RS256",
}
```

The existing app-login provider remains unchanged.

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
- `tokenEndpointAuthMethod`
- `createdAt`
- `updatedAt`
- `createdBy` (`"dynamic_registration"` or `"manual"`)
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
- `codeChallengeMethod`
- `userId?`
- `status` (`pending`, `approved`, `denied`, `expired`)
- `createdAt`
- `expiresAt`

### 3. `mcpGrants`

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

### 4. `mcpRefreshTokens`

Opaque refresh token records.

Fields:

- `grantId`
- `clientId`
- `tokenHash`
- `status` (`active`, `rotated`, `revoked`, `expired`)
- `createdAt`
- `expiresAt?`
- `rotatedAt?`
- `replacedByTokenHash?`

### 5. `mcpAccessAudit`

Immutable audit trail for token issuance, refresh, use, and revocation.

Fields:

- `grantId?`
- `clientId?`
- `userId?`
- `action`
- `createdAt`
- `detailsJson?`

## MCP Tool Surface

Start narrow.

Initial MCP tools should map to existing user value without bypassing approvals:

1. `vaults.list`
2. `vaults.get`
3. `files.read`
4. `files.write`
5. `commits.propose`
6. `prod.read.propose`

Rules:

1. Tools that already require user approval inside Noter must keep doing so.
2. The MCP tool result can create a proposal, but must not silently skip the
   approval layer.

## Protocol Flow

### 1. Client registration

1. MCP client discovers auth metadata.
2. MCP client calls `/register`.
3. Cloudflare Worker validates metadata and persists the client in Convex.
4. Cloudflare Worker returns `client_id`.

### 2. Authorization request

1. MCP client redirects user to `/oauth/mcp/authorize`.
2. Cloudflare Worker validates request parameters and stores `mcpAuthRequests`.
3. If the user is not authenticated in `noter.md`, redirect to sign-in.
4. Show consent UI in the main app.
5. On approval, create or reuse an `mcpGrant`.
6. Return the authorization code redirect.

### 3. Token exchange

1. Client posts authorization code plus PKCE verifier to `/oauth/mcp/token`.
2. Cloudflare Worker validates code, PKCE, client, redirect URI, and resource.
3. Cloudflare Worker issues:
   - short-lived JWT access token
   - long-lived opaque refresh token
4. Refresh token hash is stored in Convex.
5. Access issuance is recorded in `mcpAccessAudit`.

### 4. MCP call

1. Client calls `/mcp` with `Authorization: Bearer <mcp_access_token>`.
2. Cloudflare Worker validates signature, issuer, audience, expiry, and scopes.
3. Cloudflare Worker mints a short-lived internal Convex JWT.
4. Cloudflare Worker calls Convex using `ConvexHttpClient.setAuth(...)`.
5. Convex runs the tool implementation as the user.
6. Cloudflare Worker maps the result into MCP response format.

### 5. Refresh

1. Client posts refresh token to `/oauth/mcp/token`.
2. Cloudflare Worker validates the stored hash and grant status.
3. Cloudflare Worker rotates refresh token.
4. Cloudflare Worker issues a new access token.

### 6. Revocation

1. User revokes a client grant from `noter.md`.
2. Convex marks the grant revoked and invalidates refresh tokens.
3. Existing access tokens expire naturally.
4. Optional follow-up: maintain a short-lived denylist keyed by `jti` for
   immediate cut-off.

## Consent UX

The consent screen must show:

1. client name
2. requested scopes
3. requested resource
4. whether the client is using dynamic registration
5. a plain-language explanation of what the client will be able to do

Initial scopes:

- `vaults.read`
- `files.read`
- `files.write`
- `commits.propose`
- `prod.read.propose`

Do not introduce a blanket `admin` scope.

## Security Rules

1. Never hand third-party provider tokens to the MCP client.
2. Never accept the public MCP access token directly in Convex.
3. Require PKCE for public clients.
4. Require resource or audience validation on every token exchange and MCP
   request.
5. Rotate refresh tokens.
6. Hash stored refresh tokens.
7. Keep access token TTL short.
8. Audit every grant approval, refresh, and revocation.
9. Preserve approval-first semantics for sensitive Noter operations.

## Recommended Repo Layout

### New app

- `apps/noter-mcp`

Responsibilities:

1. edge runtime entrypoint
2. MCP protocol handling
3. OAuth provider endpoints
4. JWT signing and JWKS serving
5. Convex client wrapper

### Convex modules

Recommended additions:

- `apps/noter/convex/mcpOAuth.ts`
- `apps/noter/convex/mcpGrants.ts`
- `apps/noter/convex/mcpAudit.ts`
- `apps/noter/convex/mcpTools.ts`

These modules should own:

1. durable OAuth state
2. grant listing and revocation
3. audit
4. backend tool execution

## Rollout Plan

### Phase 1: protocol and auth skeleton

1. Add the new spec-backed data model in Convex.
2. Add the internal `customJwt` provider to Convex auth config.
3. Scaffold `apps/noter-mcp`.
4. Implement Cloudflare Worker metadata, registration, authorize, token, and
   JWKS endpoints.

### Phase 2: narrow MCP server

1. Implement `/mcp` with a minimal tool surface.
2. Support only the scopes needed for those tools.
3. Validate ChatGPT web connection end-to-end through the Cloudflare route.

### Phase 3: user controls

1. Add consent UI.
2. Add “connected MCP clients” management UI.
3. Add revoke flow and audit visibility.

### Phase 4: richer transport and tooling

1. Add richer streaming support if required by clients.
2. Add notifications or long-running operations only when proven necessary.
3. Expand scopes and tools carefully.

## Acceptance Criteria

1. ChatGPT web can connect to the hosted `noter.md` MCP server at
   `https://noter.md/mcp` using OAuth.
2. Dynamic client registration works for a new client.
3. The issued MCP access token is not directly usable against Convex.
4. The Cloudflare Worker can call Convex as the user through the internal JWT
   path.
5. Existing approval-first behavior for sensitive operations is preserved.
6. Users can revoke grants and block refresh.

## Open Questions

1. Should access tokens be JWTs from day one, or opaque with lookup in Convex?
2. Should consent UI live fully inside the Cloudflare Worker response path, or
   deep-link into the main React app on `noter.md`?
3. Do we want immediate access-token revocation via denylist in v1 or only
   natural expiry plus refresh revocation?
4. Do we want to expose `files.write` directly, or only proposal-style write
   tools at launch?
5. Which initial scopes are acceptable for the first public integration?
6. Do we ever want to move the MCP surface to `mcp.noter.md`, or is same-origin
   good enough permanently?

## Source Notes

Primary references used for this design:

1. OpenAI remote MCP and custom connector docs
2. MCP authorization and streamable HTTP specs
3. Cloudflare remote MCP auth guidance and `workers-oauth-provider`
4. Cloudflare Workers Routes, Web Analytics, and Workers Observability docs
5. Convex docs for HTTP actions, custom JWT auth providers, custom domains, and
   `ConvexHttpClient`

Reference links:

- `https://developers.openai.com/api/docs/guides/developer-mode`
- `https://platform.openai.com/docs/guides/connectors-custom`
- `https://modelcontextprotocol.io/specification/2025-06-18/basic/transports`
- `https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization`
- `https://developers.cloudflare.com/agents/guides/remote-mcp-server/`
- `https://github.com/cloudflare/workers-oauth-provider`
- `https://developers.cloudflare.com/workers/configuration/routing/routes/`
- `https://developers.cloudflare.com/rules/origin-rules/features/`
- `https://developers.cloudflare.com/web-analytics/get-started/`
- `https://developers.cloudflare.com/web-analytics/limits/`
- `https://developers.cloudflare.com/workers/observability/`
- `https://developers.cloudflare.com/workers/observability/logs/workers-logs/`
- `https://docs.convex.dev/functions/http-actions`
- `https://docs.convex.dev/auth/advanced/custom-jwt`
- `https://docs.convex.dev/production/hosting/custom-domains`
- `https://docs.convex.dev/api/classes/browser.ConvexHttpClient`
