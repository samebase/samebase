# 096 Agent Browser Handoff Plan

## Document Control

- Status: Implemented. Current behavior is defined in `specs/111_AGENT_BROWSER_HANDOFF_SPEC.md`.
- Owner: Nicu Chiciuc
- Created: 2026-07-08
- Origin: operator research request about letting an authenticated MCP client open `samebase.com` in
  a visible browser session without adding a broad production password backdoor.
- Related rfcs:
  - `rfcs/063_MCP_PREACCOUNT_ONBOARDING_FLOW_SPEC.md`
  - `rfcs/085_ACCESS_MODEL_ROLES_AND_GRANTS_SPEC.md`
  - `rfcs/089_MCP_CONVEX_FUNCTION_EXPOSURE_SPEC.md`
  - `rfcs/093_AGENT_NATIVE_ONE_BASE_PLAN.md`
- Related specs:
  - `specs/111_AGENT_BROWSER_HANDOFF_SPEC.md`
- Related docs:
  - `docs/repo-documentation-standard.md`
  - `docs/agent-workflows.md`
- Related code:
  - `apps/samebase/convex/http.ts`
  - `apps/samebase/convex/mcp/http.ts`
  - `apps/samebase/convex/mcp/oauth.ts`
  - `apps/samebase/convex/mcp/protocol.ts`
  - `apps/samebase/convex/mcp/tokens.ts`
  - `apps/samebase/convex/schema.ts`
  - `apps/samebase/convex/auth.ts`
  - `apps/samebase/src/components/McpConsentRoutePage.tsx`
  - `apps/samebase/src/components/MachineConnectPage.tsx`
  - `apps/samebase/src/routeSearch/machineConnect.ts`
- External references:
  - [OAuth 2.0 for Native Apps, RFC 8252](https://datatracker.ietf.org/doc/html/rfc8252)
  - [OAuth 2.0 Security Best Current Practice, RFC 9700](https://datatracker.ietf.org/doc/html/rfc9700)
  - [OAuth 2.0 Token Exchange, RFC 8693](https://www.rfc-editor.org/info/rfc8693/)
  - [Convex Auth `ConvexCredentials`](https://labs.convex.dev/auth/api_reference/providers/ConvexCredentials)
  - [Convex Auth server API](https://labs.convex.dev/auth/api_reference/server)

## Summary

Samebase should support a vendor-neutral agent browser handoff:

1. A user connects a Samebase MCP server in any MCP-capable agent.
2. The user explicitly grants a new browser-handoff scope.
3. The agent calls an MCP tool that creates a short-lived, one-time browser handoff URL.
4. The agent opens that URL in a browser when its host can do so, or shows the URL to the user when
   it cannot.
5. The browser redeems the one-time handoff into a normal Convex Auth browser session for the same
   Samebase user.

This lets a user ask Codex, Claude, ChatGPT, a terminal MCP client, or a future agent to make
Samebase changes through MCP while the user watches the web app reflect those changes in a normal
browser session.

This should not be implemented by widening production email/password sign-in. Password auth remains
useful for local, preview, and reviewer-specific flows, but it does not solve the general problem:
the user has already authenticated the agent through MCP, and the browser needs a narrowly scoped
handoff from that grant into Convex Auth.

## Goals

1. Let an authenticated MCP client create a browser login URL for the same Samebase user.
2. Keep the flow vendor-neutral. No `codex`, `claude`, or `chatgpt` route names or query params.
3. Create real Convex Auth browser sessions instead of teaching the web app to accept MCP tokens.
4. Keep MCP access tokens, MCP refresh tokens, Convex Auth JWTs, and Convex Auth refresh tokens out
   of URLs and MCP tool results.
5. Require explicit consent for the browser-handoff capability.
6. Preserve current MCP role-shrink behavior: a grant can become less powerful when the user's
   current role or approval changes.
7. Make the visible browser route resilient in desktop browsers, in-app browsers, and mobile
   browsers.
8. Leave enough audit trail to answer who created a handoff, which client created it, when it was
   consumed, and why a failed handoff failed.

## Non-Goals

1. No general production password login surface for arbitrary users.
2. No direct exchange from MCP access tokens to browser Convex Auth tokens.
3. No browser storage of MCP access or refresh tokens.
4. No MCP tool argument that chooses a `userId`, grants a scope, or overrides the authenticated
   caller's account.
5. No agent-specific browser integration in the Samebase backend. Codex Desktop can open the URL
   automatically, but the Samebase contract is just a URL.
6. No guarantee that revoking an MCP grant immediately deletes browser sessions already created from
   that grant. That can be added later if Convex Auth session metadata supports it cleanly.

## Existing System

Samebase already has two separate token systems:

1. Convex Auth browser sessions, registered by `auth.addHttpRoutes(http)` in
   `apps/samebase/convex/http.ts`.
2. Samebase MCP OAuth grants and opaque bearer tokens, registered at `/oauth/mcp/register`,
   `/oauth/mcp/authorize`, `/oauth/mcp/token`, and `/mcp` in `apps/samebase/convex/http.ts`.

The MCP schema is already separate from Convex Auth. It includes OAuth clients, auth requests,
one-time authorization codes, durable grants, access tokens, refresh tokens, and audit rows in
`apps/samebase/convex/schema.ts`. The MCP token helpers already create opaque token values and store
only hashes through `sha256Hex` in `apps/samebase/convex/mcp/tokens.ts`.

The MCP OAuth implementation already has important controls:

- PKCE S256 validation.
- exact registered redirect URI matching.
- MCP resource binding to `/mcp`.
- one-time authorization codes.
- hashed access and refresh tokens.
- grant and client status checks during access-token validation.
- current access-key checks during `tools/list` and again during `tools/call`.

Those controls should be reused, not bypassed. The browser handoff is a third token system: a
short-lived bridge from a consented MCP grant to a browser Convex Auth sign-in.

## Proposed Product Contract

### Browser Route

Add one vendor-neutral route:

```text
/agents/connect
```

States:

1. No handoff or request:
   - show a compact "Connect an agent" page.
   - show the MCP server URL, [https://api.samebase.com/mcp](https://api.samebase.com/mcp).
   - link to agent action docs.
2. Handoff present:
   - consume `#handoff=<token>` from the URL fragment.
   - strip the fragment before app hydration and before analytics can observe the URL.
   - redeem the token through Convex Auth sign-in.
   - navigate to a Samebase-relative `returnToPath`, defaulting to the authenticated dashboard or
     vault list.
3. Expired, consumed, missing, or invalid handoff:
   - show "This request is no longer available. Ask the agent to start again."
4. Browser is signed in as the same user:
   - consume the handoff.
   - reuse the current session when Convex Auth can do so.
   - navigate to the return path.
5. Browser is signed in as a different user:
   - consume or revoke the handoff without creating a session for the target user.
   - show "This request is no longer available. Ask the agent to start again."

The route uses a fragment instead of a query parameter because fragments are not sent in the HTTP
request line or normal referrers. The browser still treats the URL as sensitive, so the app must
strip it before React route code, analytics, third-party scripts, or nonessential subresources can
observe the full URL. A route-component `history.replaceState` is too late because root-level
instrumentation can run first; the control belongs in pre-hydration code and in analytics route
exclusion.

### MCP Tool

Add one MCP tool, exposed only when the grant includes a new access key:

```text
create_browser_handoff
```

The long-term catalog id and the MCP wire name should be snake_case. Existing camelCase-style MCP
tool names can remain as compatibility aliases for existing tools, but this new surface should use
the direction proposed by the action catalog in `rfcs/093_AGENT_NATIVE_ONE_BASE_PLAN.md`.

Input:

```ts
{
  returnToPath?: string;
}
```

Output:

```ts
{
  url: string;
  expiresAt: number;
}
```

Rules:

- `returnToPath` must be a Samebase-relative path. No absolute URLs.
- the server validates the return path before minting the handoff URL.
- the URL may include the validated return path as a non-secret fragment value so the browser knows
  where to navigate after `signIn`. Auth redemption never trusts that fragment value; browser
  navigation validates it again and falls back to the dashboard default.
- the tool result contains only the one-time URL and expiry. It never returns browser tokens or MCP
  tokens.
- the tool description must tell the agent the URL is sensitive and expires quickly.

### Access Key

Add a dedicated access key:

```text
access_browser_login_handoff
```

This key must not be part of the default MCP scope. Existing clients that omit `scope` currently get
a fixed v1 default surface in `apps/samebase/convex/mcp/protocol.ts`. Browser handoff must be an
explicit new consent because it lets the client cause a web browser to become signed in as the
Samebase user.

The MCP consent page should describe the capability directly:

```text
Open Samebase in a browser as your account
```

Do not describe dynamically registered clients as trusted. Show the client name if present, but
treat it as self-reported.

## Proposed Backend Model

Add a table for handoff rows:

```ts
agentBrowserHandoffs: defineTable({
  tokenHash: v.string(),
  userId: v.id("users"),
  grantId: v.string(),
  clientId: v.string(),
  returnToPath: v.string(),
  createdAt: v.number(),
  expiresAt: v.number(),
  consumedAt: v.optional(v.number()),
})
  .index("by_token_hash", ["tokenHash"])
  .index("by_grant_id", ["grantId"]);
```

Use a 32-byte random opaque token with a distinct prefix, for example `agbh_`. Store only its
SHA-256 hash. The full token leaves the backend exactly once, inside the returned URL fragment.

Record audit events for state transitions and terminal decisions:

- handoff created.
- handoff consumed.
- handoff rejected because expired.
- handoff rejected because the current browser user is different.
- handoff rejected because the grant, client, user, or access key is no longer valid.

Unknown tokens and repeated presentations of already-terminal tokens must return a generic failure
without inserting an audit row. Otherwise an attacker can turn random-token or replay traffic into
an unbounded database write stream.

Reuse `mcpAccessAudit` for these events with new `action` strings and reason details in
`detailsJson`. Do not add a parallel audit table. Audit rows should include `userId`, `clientId`,
`grantId`, event time, and a reason code. Do not store raw tokens, full URLs, full user-agent
strings, or provider credentials in audit fields.

## Convex Auth Integration

Redeem the handoff through a dedicated Convex Auth `ConvexCredentials` provider:

```text
provider id: agent-browser-handoff
```

The browser calls the normal Convex Auth client `signIn` with that provider id and the handoff
token. The provider's `authorize` handler validates and consumes the handoff, then returns the
existing Samebase `userId` for a successful login.

This keeps session creation inside Convex Auth:

- Convex Auth creates `authSessions`.
- Convex Auth creates and rotates `authRefreshTokens`.
- Convex Auth returns the browser JWT and refresh token through the normal client sign-in path.
- Samebase does not manually write Convex Auth internals.

The provider must not create new users. A valid handoff is always tied to an existing Samebase
`users` row. If that user no longer exists or no longer has the needed access, sign-in fails.

The provider should validate in this order:

1. Parse and hash the presented handoff token.
2. Find a live handoff row by `tokenHash`.
3. Reject expired or consumed rows.
4. Load and validate the user.
5. Load and validate the MCP grant.
6. Load and validate the MCP client.
7. Recompute current access keys for the user and require `access_browser_login_handoff`.
8. Check the current browser auth identity if present:
   - same user: return the existing session id so Convex Auth can reuse the session.
   - different user: consume or revoke the handoff, audit `browser_user_mismatch`, and fail.
9. Atomically mark `consumedAt`.
10. Return the existing `userId` to Convex Auth.

The consume path should be written so two simultaneous redemption attempts cannot both create
sessions. The first write to `consumedAt` wins. Every successful redemption consumes the handoff,
including same-user redemption that reuses the existing browser session.

## Security Requirements

### Consent And Scope

Browser handoff is stronger than an ordinary read tool. It lets an MCP client create a link that
logs a browser into Samebase as the user. It therefore requires a dedicated scope and explicit MCP
consent.

Existing grants must not inherit this scope. The default scope remains fixed. A user who wants the
feature reconnects or reconsents with the new scope.

MCP authorize may auto-issue an authorization code for an existing grant only when the requested
scope is a subset of the already-granted scope. A request that adds `access_browser_login_handoff`
must return to consent unless that exact scope was previously approved for the same client,
resource, and user.

### Token Containment

The handoff token is a short-lived bearer credential. Required controls:

- token value has at least 256 bits of entropy before prefixing.
- token is stored only as a hash.
- token TTL is short, initially 5 minutes to support manual copy from terminal-only agents.
- token is one-time use.
- token is carried in a URL fragment, not a query parameter.
- route strips the fragment immediately.
- route does not emit the full URL to logs, analytics, screenshots, or error reporting.
- route does not call third-party scripts before stripping and submitting the token.
- failed responses do not distinguish "hash not found" from "expired" to anonymous callers.

### Browser Headers

Set strict headers for `/agents/connect` and MCP consent or callback surfaces before enabling live
handoff redemption:

```text
Cache-Control: no-store
Referrer-Policy: no-referrer
Content-Security-Policy: frame-ancestors 'none'
```

The current static `_headers` file is minimal and only sets content type for `/samebase.ts` plus
immutable caching for assets. This flow needs explicit browser-page protections.

### Clickjacking And CSRF

The handoff consume operation must not be a GET endpoint. Loading `/agents/connect` is not enough to
consume the token. The browser JS calls Convex Auth `signIn`, which performs the validated
server-side consume.

The consent page should also get `frame-ancestors 'none'`. MCP authorize can currently auto-issue a
code for an existing grant; that is acceptable only if the original OAuth request still carries
PKCE, exact redirect URI matching, resource binding, state, and a requested scope that does not
exceed the existing grant.

### Role Shrink And Revocation

The create path and the consume path both recheck current user access. A handoff minted before a
role change must fail after the role change if the user no longer has the handoff access key.

Grant or client revocation must prevent future handoff creation and future handoff consumption.
Whether it should invalidate already-created browser sessions remains an open follow-up unless the
implementation can tie Convex Auth sessions to the handoff without coupling to Convex Auth
internals.

### Rate Limiting

Add rate limits for:

- MCP dynamic registration.
- MCP authorize.
- MCP token exchange.
- browser handoff creation per grant and per client.
- browser handoff redemption at the edge or auth ingress. A token-hash lookup alone cannot limit
  random-token sprays because the request does not carry a trustworthy client identity. The Convex
  redemption mutation must still audit only terminal state transitions.

The machine registration bootstrap limiter in `apps/samebase/convex/connectedMachines.ts` is the
local precedent.

### Refresh Token Replay

Current MCP refresh token replay handling rejects invalid grant use but does not treat replay as a
token-family compromise. That is not introduced by this proposal, but browser handoff makes MCP
grants more sensitive. Before shipping the handoff scope broadly, refresh-token replay should revoke
the grant or token family and write an audit event.

## Edge Cases

### Agent Can Open A Browser

Codex Desktop and other local agent hosts may open a side browser directly. They call
`create_browser_handoff`, open the URL, and the user sees the Samebase account in the browser.

Samebase should not special-case these hosts. The URL is the contract.

### Agent Cannot Open A Browser

Cloud agents and terminal-only clients may only show the URL. The result remains useful: the user
opens it manually before expiry or asks the agent to mint a fresh one. The 5-minute initial TTL is
for this manual delivery case.

### Existing Browser User Differs

Do not silently switch accounts. Consume or revoke the handoff and tell the user that the browser is
signed in to a different account, then instruct them to sign out and ask for a fresh link. This
prevents an account mismatch from leaving a live bearer URL available in terminal scrollback, chat
history, or a private window.

### Link Scanner Or Preview Bot

The URL fragment and JS-only redemption make ordinary link scanners less likely to consume the
handoff. A scanner that executes JavaScript in a full browser can still consume it. The small TTL,
one-time use, no GET consume rule, and audit trail are the practical controls.

### Multiple Tabs

Only one tab can consume. Other tabs show the expired or already used state.

### Private Browsing Or Storage Blocked

If the browser cannot persist Convex Auth storage, the route should fail with a clear message. Do
not depend on popup openers, cross-window `postMessage`, or localStorage token copying.

### Preview And Production Deployment Mixups

Handoffs are deployment-scoped by construction because each deployment has its own Convex database.
A production token is not found on a preview or local deployment. The minting tool must build the
URL from that deployment's canonical frontend `SITE_URL` so users do not receive a production token
inside a preview or local frontend URL.

### Return Path Abuse

The server validates a normalized Samebase-relative return path before placing it in the URL
fragment. No absolute URLs, protocol-relative URLs, `javascript:` URLs, or unrecognized routes. The
browser validates again before navigation. If validation fails at either layer, use the dashboard
default.

## Rollout Plan

### Phase 1: Public Agent Connect Page

Add `/agents/connect` as a public route with the MCP server URL and compact setup copy. It does not
yet redeem browser handoffs.

Update `llms.txt` or agent docs so agents find `/agents/connect` as the human setup page and
[https://api.samebase.com/mcp](https://api.samebase.com/mcp) as the protocol endpoint.

Validation:

- route renders logged out and logged in.
- route exposes [https://api.samebase.com/mcp](https://api.samebase.com/mcp).
- [https://api.samebase.com/mcp](https://api.samebase.com/mcp) remains the JSON-RPC endpoint.

### Phase 2: Handoff Storage And Tool

Add the access key, schema table, token helper, create mutation/action, audit events, and MCP tool.
The tool returns a URL, but the browser route can still show "not enabled" until Phase 3.

Validation:

- client without `access_browser_login_handoff` cannot list or call the tool.
- client with scope can create one handoff.
- token hashes are stored, raw tokens are not.
- expired and consumed handoffs fail.

### Phase 3: Convex Auth Redemption

Add strict headers for both `/agents/connect` spellings and both `/oauth/mcp/consent` spellings,
safe `SITE_URL` validation, the `agent-browser-handoff` `ConvexCredentials` provider, pre-hydration
fragment stripping, analytics exclusion, expiry cleanup, and route redemption behavior.

Validation:

- logged-out browser redeems a live link and reaches the dashboard.
- same-user browser consumes the handoff and navigates without account disruption.
- different-user browser consumes or revokes the handoff without switching accounts.
- two simultaneous redemptions result in one success.
- expired, consumed, wrong-deployment, and wrong-scope links fail.
- headers are present on `/agents/connect` and MCP consent.
- the handoff fragment is stripped before PostHog or route pageview capture.

### Phase 4: Hardening And Grant Management

Add grant revocation UI, token-family replay handling, and complete audit views.

Validation:

- grant revocation prevents handoff creation and redemption.
- refresh-token replay revokes the relevant grant or token family.
- audit rows exist for create, consume, reject, and revoke.

## Validation Expectations

Implementation PRs should include:

- Convex tests for token creation, hashing, expiry, consume race behavior, role shrink, and grant
  revocation.
- Auth provider tests for successful sign-in and all rejection variants.
- Route tests for pre-hydration fragment stripping, PostHog exclusion, return path validation,
  same-user behavior, and different-user consumption.
- MCP tool tests for scope filtering and execution rechecks.
- Manual browser validation through a real local route after `pnpm dev`.
- A security-focused checklist in the PR body for headers, logs, analytics, and audit fields.

## Open Questions

1. Can Convex Auth session metadata cleanly record `agentBrowserHandoffId` without extending or
   depending on internal auth table behavior? If not, audit the handoff separately and leave browser
   sessions as normal Convex Auth sessions.
2. Should users approve the browser handoff scope once per MCP grant, or should each generated
   handoff require a browser-side confirmation click? The initial proposal is grant-level consent
   plus one-time URLs. Add per-handoff confirmation only if scanner risk proves material.
3. Should the first route after redemption be the dashboard root, the last used vault, or an MCP
   tool-provided Samebase-relative path? The proposed implementation accepts a validated
   `returnToPath` fragment value minted by the server, with a dashboard default.
4. Should `create_browser_handoff` be excluded from ChatGPT app review metadata until the UX has a
   public revocation surface? The safer first launch is Codex and local MCP clients only, then widen
   once grant management is visible.
