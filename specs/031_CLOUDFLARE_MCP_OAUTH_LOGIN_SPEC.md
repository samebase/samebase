# 031 Cloudflare MCP OAuth Provider Connection Spec

## Document Control

- Status: Proposed
- Owner: Noter platform + infra
- Last updated: 2026-03-02
- Related specs:
  - `specs/026_PROVIDER_CONNECTIONS_SPEC.md`
  - `specs/006_DNS_DOMAIN_STRATEGY_SPEC.md`
  - `specs/004_AI_PROD_ACCESS_POLICY_SPEC.md`
  - `specs/029_PROVIDERS_PANEL_SETTINGS_SPEC.md`

## Summary

Add Cloudflare as a first-class provider connection with a **third credential
method**:

1. `oauth` (existing)
2. `api_key` (existing; also used for dev seeding)
3. `mcp_oauth` (**new**, Cloudflare-only)

Cloudflare is the only provider in our stack (as of 2026-03) that offers a
hosted remote MCP endpoint with an OAuth consent flow. We want to use that flow
for end-user Cloudflare connectivity (no copy/paste tokens), while retaining a
seed-only API token path for local/dev seeding and non-interactive bootstrap.

**Product invariant:** normal users must be able to connect Cloudflare from the
web app without creating a Cloudflare API token. `mcp_oauth` is an internal
credential label; user-facing product copy should call this Cloudflare OAuth or
Cloudflare web auth.

**Key decision:** even when local/dev seeding connects Cloudflare via `api_key`,
Noter should still talk to Cloudflare **through the Cloudflare MCP server**
(single integration surface) rather than maintaining a parallel direct
Cloudflare REST integration.

## Goals

1. Allow users to connect Cloudflare without manually creating/pasting API
   tokens by using the Cloudflare web OAuth consent flow.
2. Keep a non-interactive, seed-friendly Cloudflare auth path using an API token
   (`api_key`) for `make anon` / worktree seeding only.
3. Make Cloudflare connection a first-class provider in `providerConnections`,
   consistent with GitHub/Convex provider connections.
4. Keep the runtime integration surface **one**: Cloudflare MCP.
5. Preserve least-privilege security and support easy disconnect/revocation.

## Non-Goals

1. Re-specifying noter-managed hosting in this spec (that belongs in hosting
   provider selection and infra provisioning specs).
2. Migrating apex DNS authority for `noter.md` (see DNS strategy spec).
3. Supporting arbitrary third-party MCP endpoints as a generic feature.
4. Building “local MCP bridge” infrastructure to talk to MCP servers running on
   a user’s laptop.

## Background / Current State

1. Noter already models provider credentials in `providerConnections` with
   auth-method union (`oauth` or `api_key`).
2. Noter already has OAuth state persistence via `oauthStates`.
3. Noter’s existing provider OAuth flows are direct for GitHub/Convex.
   Cloudflare differs:
   - Cloudflare’s “remote MCP server” provides OAuth consent and a stable hosted
     MCP endpoint.
   - Cloudflare also supports passing an API token as a bearer credential
     (useful for CI/dev seed, no OAuth callback needed).

## Locked Product Decisions

1. Only Cloudflare uses `mcp_oauth` in MVP.
2. Cloudflare connections must support **both**:
   - `mcp_oauth` (required for interactive user connect)
   - `api_key` (required for seed/bootstrap only)
3. Internally, Noter calls Cloudflare through **Cloudflare MCP** regardless of
   which Cloudflare auth method is used.
4. Cloudflare must be integrated as a provider connection, not as app-login.
5. Cloudflare API tokens must not be presented as the normal create-app
   prerequisite or fallback for users.

## Data Model

### 1) Provider kind

Add a new provider kind:

- `kind: "cloudflare"`

### 2) Auth method union

Add a third auth method:

- `method: "mcp_oauth"`

Proposed shape (illustrative):

```ts
type McpOAuthAuth = {
  method: "mcp_oauth";
  // OAuth credentials minted for the remote MCP server.
  credential: string;
  refreshCredential?: string;
  credentialExpiresAt?: number;
};
```

Notes:

1. `credentialExpiresAt` is optional because some flows may not return it.
2. `api_key` remains as-is. For Cloudflare seed/bootstrap, it represents a
   Cloudflare API token (not a global API key), stored in `auth.credential`.

### 3) Cloudflare provider connection document

Proposed minimal doc shape:

```ts
type CloudflareProviderConnection = {
  kind: "cloudflare";
  userId: Id<"users">;
  auth: ProviderAuth; // now includes mcp_oauth
  accountId?: string; // optional; populated post-connect if discoverable
  createdAt: number;
  updatedAt: number;
};
```

Why `accountId?`:

- Many Cloudflare APIs are account-scoped; having it cached avoids repeated
  discovery calls.
- It should be treated as “hint/cache”, not source-of-truth.

### 4) Indexing

Existing indexes remain correct:

- `by_user_kind`
- `by_kind_method` (must include `mcp_oauth`)

## OAuth State / Callback Flow (Cloudflare MCP OAuth)

### New OAuth provider label

Extend `oauthStates.provider` union with:

- `"cloudflare_mcp"`

Rationale:

- We already key `oauthStates` by a `provider` label. Cloudflare MCP OAuth is a
  distinct flow vs any future “direct Cloudflare OAuth” (if it ever exists).

### Endpoints (conceptual)

Frontend should trigger:

- `GET /oauth/cloudflare-mcp/start` → returns redirect URL (or redirects)
- `GET /oauth/cloudflare-mcp/callback?code=...&state=...` → completes exchange,
  persists `providerConnections(kind="cloudflare", auth.method="mcp_oauth")`

### Environment contract

We should not add a pile of env vars prematurely. MVP assumption:

1. Cloudflare MCP OAuth uses dynamic client registration / PKCE under the hood
   (or is handled by the chosen MCP client library), so we do not require
   “Cloudflare OAuth client ID/secret” as Noter runtime env vars.
2. We _do_ require a stable redirect URL for the callback route, consistent with
   our existing provider OAuth flows.

MVP requires one env var:

- `PROVIDER_CLOUDFLARE_MCP_REDIRECT_URL`

If we learn Cloudflare requires explicit client registration for non-IDE use, we
will add env vars similar to other providers:

- `PROVIDER_CLOUDFLARE_MCP_CLIENT_ID`
- `PROVIDER_CLOUDFLARE_MCP_CLIENT_SECRET`

Note: Convex enforces an env-var name length limit (<40 chars), so keep these
names short.

## API Token Seed Flow

### Dev seed support

Add dev seed input:

- `DEV_SEED_CLOUDFLARE_API_KEY`

Optional additional seed hints (only if needed by bootstrap code):

- `DEV_SEED_CLOUDFLARE_ACCOUNT_ID`

Seed behavior mirrors existing seed strategy in
`specs/026_PROVIDER_CONNECTIONS_SPEC.md`:

1. Seed path writes provider connection row for Cloudflare if env var present.
2. No attempt to perform OAuth in seed.

## Runtime Integration: Cloudflare MCP Client

### Single surface: MCP tools

All Cloudflare operations in Noter should route through a single internal
module, conceptually:

- `apps/noter/convex/cloudflareMcp.ts` (or similar)

Responsibilities:

1. Accept a `providerConnections` record for Cloudflare.
2. Normalize credentials to a bearer token:
   - `mcp_oauth` → `auth.credential`
   - `api_key` → `auth.credential`
3. Call the Cloudflare MCP endpoint and invoke tools.

### Token refresh

If `mcp_oauth` issues refresh tokens, refresh should be implemented centrally:

1. If `credentialExpiresAt` is present and near-expiry, refresh before tool
   calls.
2. Persist refreshed credentials back to `providerConnections`.

If refresh is not supported/available:

1. Detect auth failures and surface “Reconnect Cloudflare” UX.

## UX / Frontend Contract

Add Cloudflare to the existing providers panel (see spec 029):

1. Show connection status: connected/disconnected.
2. If connected, show method label:
   - `OAuth` for `mcp_oauth`
   - `API key` only for dev/operator seeded `api_key` connections
3. Provide “Disconnect” action that deletes the provider connection row.
4. For least surprise, keep the Cloudflare connect action as a web auth button.
   Do not show a Cloudflare API-token button in the normal providers UI.

## Security / Privacy

1. Least privilege:
   - Default requested permissions should be the minimum required for the
     current feature set (DNS-only vs Pages-only vs both).
2. Do not expose credentials to the model:
   - Provider tokens must remain server-side.
   - Any AI-driven Cloudflare reads must go through the prod-access approval
     policy spec (if/when added).
3. Store credentials in `providerConnections` only.
4. Disconnect must fully remove stored credentials.

## Rollout Plan

Phase 1 (Auth + Connection):

1. Add `ProviderKind.cloudflare`.
2. Add `ProviderAuth.method="mcp_oauth"`.
3. Add Cloudflare connect/disconnect UI (web OAuth, no Cloudflare API-token
   button).
4. Add seed support via `DEV_SEED_CLOUDFLARE_API_KEY`.

Phase 2 (First capability):

1. Implement one small Cloudflare-backed feature to validate:
   - Example: list zones, or validate DNS access for `noter.md`.
2. Wire observability and helpful errors for permission mismatches.

Phase 3 (Infra provisioning integration; optional):

1. Decide whether to pilot Cloudflare Pages provisioning for managed vault apps
   (likely requires a separate spec + acceptance criteria).

## Open Questions

1. What is the minimum permission set we need for MVP?
   - DNS only?
   - Pages only?
   - Both?
2. Does Cloudflare MCP OAuth reliably provide refresh tokens for long-lived
   sessions? If not, what reconnection UX is acceptable?
3. Should we cache `accountId` and/or `zoneId` in the Cloudflare connection row,
   or discover per operation?
