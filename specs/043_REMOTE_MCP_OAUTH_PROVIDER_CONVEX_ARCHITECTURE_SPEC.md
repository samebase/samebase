# 043 Remote MCP OAuth Provider + Convex Architecture Spec

## Document Control

- Status: Proposed
- Owner: Noter platform
- Last updated: 2026-03-06
- Related specs:
  - `specs/020_CONVEX_AGENT_ADOPTION_SPEC.md`
  - `specs/026_PROVIDER_CONNECTIONS_SPEC.md`
  - `specs/029_PROVIDERS_PANEL_SETTINGS_SPEC.md`
  - `specs/031_CLOUDFLARE_MCP_OAUTH_LOGIN_SPEC.md`
  - `specs/036_MCP_CONNECTION_TOKEN_HEALTH_VISIBILITY_SPEC.md`

## Summary

Build a hosted remote MCP server for `noter.md` plus an OAuth 2.1 provider for
that server.

The recommended architecture is:

1. `mcp.noter.md` runs a dedicated edge service that owns the MCP transport and
   OAuth provider surface.
2. Convex remains the system of record for users, grants, approvals, audit, and
   business operations.
3. The edge service talks to Convex as the authenticated user through a
   dedicated internal JWT audience, not through the public MCP access token.

This mirrors the shape of Cloudflare's remote MCP strategy closely enough to be
compatible with current MCP clients, while preserving Noter's existing Convex
data model and approval-first backend behavior.

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

## Decision

Use a split architecture with a dedicated edge service on `mcp.noter.md` and
Convex as the authoritative backend.

### Why this is the recommended shape

1. It matches the way Cloudflare structures remote MCP auth: a hosted resource
   server plus hosted OAuth provider behavior.
2. It keeps the protocol boundary narrow and explicit.
3. It lets Convex remain focused on identity, grants, tool execution, and data.
4. It avoids making public MCP bearer tokens directly valid against Convex.
5. It gives us a clean place to support streaming HTTP, SSE if needed, and
   future transport upgrades without entangling them with Convex internals.

### Rejected architecture: direct Convex-only final design

A pure Convex design is possible for a narrow MVP, but it is not the preferred
end state.

Reasons:

1. Convex is not an OAuth provider framework.
2. MCP transport evolution is likely to move faster than Convex-specific HTTP
   ergonomics.
3. We want a clean issuer, JWKS, token surface, and resource domain that can be
   evolved independently from the main app.

### Acceptable spike: narrow Convex-only MVP

If we need the fastest possible integration spike, we can temporarily implement:

1. Metadata endpoints in Convex `http.ts`
2. DCR, authorize, and token endpoints in Convex `httpAction`
3. A stateless `/mcp` POST-only path in Convex for basic tool invocation

This should be treated as a spike, not the target architecture.

## High-Level Architecture

### Public surfaces

#### 1. Protected resource

- Origin: `https://mcp.noter.md`
- Endpoints:
  - `/mcp`
  - `/.well-known/oauth-protected-resource`

#### 2. Authorization server

- Origin: `https://mcp.noter.md`
- Endpoints:
  - `/authorize`
  - `/token`
  - `/register`
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

### Edge service at `mcp.noter.md`

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

## Token Model

### 1. Browser session token

This is the existing `noter.md` user session. It remains between the browser and
the main app only.

### 2. MCP access token

This is minted by the OAuth provider for the MCP client.

Rules:

1. It is first-party to `noter.md`.
2. It is audience-bound to `https://mcp.noter.md`.
3. It is accepted only by the MCP edge service.
4. It is never accepted directly by Convex.

Recommended shape:

- JWT access token

Required claims:

- `iss = https://mcp.noter.md`
- `sub = user:<convexUserId>`
- `aud = https://mcp.noter.md`
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

- `iss = https://mcp.noter.md`
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
  issuer: "https://mcp.noter.md",
  applicationID: "noter-mcp-internal",
  jwks: "https://mcp.noter.md/.well-known/jwks.json",
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
3. Edge service validates metadata and persists the client in Convex.
4. Edge service returns `client_id`.

### 2. Authorization request

1. MCP client redirects user to `/authorize`.
2. Edge service validates request parameters and stores `mcpAuthRequests`.
3. If the user is not authenticated in `noter.md`, redirect to sign-in.
4. Show consent UI in the main app.
5. On approval, create or reuse an `mcpGrant`.
6. Return the authorization code redirect.

### 3. Token exchange

1. Client posts authorization code plus PKCE verifier to `/token`.
2. Edge service validates code, PKCE, client, redirect URI, and resource.
3. Edge service issues:
   - short-lived JWT access token
   - long-lived opaque refresh token
4. Refresh token hash is stored in Convex.
5. Access issuance is recorded in `mcpAccessAudit`.

### 4. MCP call

1. Client calls `/mcp` with `Authorization: Bearer <mcp_access_token>`.
2. Edge service validates signature, issuer, audience, expiry, and scopes.
3. Edge service mints a short-lived internal Convex JWT.
4. Edge service calls Convex using `ConvexHttpClient.setAuth(...)`.
5. Convex runs the tool implementation as the user.
6. Edge service maps the result into MCP response format.

### 5. Refresh

1. Client posts refresh token to `/token`.
2. Edge service validates the stored hash and grant status.
3. Edge service rotates refresh token.
4. Edge service issues a new access token.

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
4. Implement metadata, registration, authorize, token, and JWKS endpoints.

### Phase 2: narrow MCP server

1. Implement `/mcp` with a minimal tool surface.
2. Support only the scopes needed for those tools.
3. Validate ChatGPT web connection end-to-end.

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
   `https://mcp.noter.md/mcp` using OAuth.
2. Dynamic client registration works for a new client.
3. The issued MCP access token is not directly usable against Convex.
4. The edge service can call Convex as the user through the internal JWT path.
5. Existing approval-first behavior for sensitive operations is preserved.
6. Users can revoke grants and block refresh.

## Open Questions

1. Should access tokens be JWTs from day one, or opaque with lookup in Convex?
2. Should consent UI live fully on `mcp.noter.md` or deep-link into `noter.md`?
3. Do we want immediate access-token revocation via denylist in v1 or only
   natural expiry plus refresh revocation?
4. Do we want to expose `files.write` directly, or only proposal-style write
   tools at launch?
5. Which initial scopes are acceptable for the first public integration?

## Source Notes

Primary references used for this design:

1. OpenAI remote MCP and custom connector docs
2. MCP authorization and streamable HTTP specs
3. Cloudflare remote MCP auth guidance and `workers-oauth-provider`
4. Convex docs for HTTP actions, custom JWT auth providers, custom domains, and
   `ConvexHttpClient`

Reference links:

- `https://developers.openai.com/api/docs/guides/developer-mode`
- `https://platform.openai.com/docs/guides/connectors-custom`
- `https://modelcontextprotocol.io/specification/2025-06-18/basic/transports`
- `https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization`
- `https://developers.cloudflare.com/agents/guides/remote-mcp-server/`
- `https://github.com/cloudflare/workers-oauth-provider`
- `https://docs.convex.dev/functions/http-actions`
- `https://docs.convex.dev/auth/advanced/custom-jwt`
- `https://docs.convex.dev/production/hosting/custom-domains`
- `https://docs.convex.dev/api/classes/browser.ConvexHttpClient`
