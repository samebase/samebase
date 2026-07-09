# 111 Agent Browser Handoff Spec

Status: Accepted

Related: `rfcs/096_AGENT_BROWSER_HANDOFF_PLAN.md`

## Current Contract

Samebase exposes an MCP tool named `create_browser_handoff` for clients that need to open the
Samebase web UI as the same user behind the current MCP grant.

The tool is listed and callable only when all of these conditions hold:

1. The OAuth grant includes `access_browser_login_handoff`.
2. The grant and MCP OAuth client are still active.
3. The grant user still has current Samebase role access to `access_browser_login_handoff`.

Successful URL creation also requires `SITE_URL` to be configured to the Samebase app origin for the
deployment. It must be an origin URL with no path, query, or fragment. HTTPS is required for
deployment URLs; HTTP is accepted only for loopback local development. Missing or unsafe `SITE_URL`
returns a tool error instead of hiding the tool. The same parser protects MCP consent redirects and
provider OAuth return URLs, so those paths cannot accept a weaker spelling of the app origin.

The MCP consent UI must render `access_browser_login_handoff` as
`Open Samebase in a browser as your account`.

The tool returns a Samebase app URL on `/agents/connect`. The trailing-slash spelling
`/agents/connect/` is treated identically. The one-time handoff token is carried in the URL fragment
under `handoff`, not in the query string. The optional `returnTo` fragment value is normalized to a
Samebase-relative app path and defaults to `/vault/`.

The backend stores only a SHA-256 token hash. A handoff expires after five minutes. Redemption is
single use:

1. Successful redemption consumes the row and signs the browser into Convex Auth as the grant user.
2. If the browser is already signed in as the same user, redemption may reuse that existing auth
   session.
3. If the browser is already signed in as a different user, redemption consumes the row and rejects
   the login.
4. If the grant, client, scope, or user access is no longer valid, redemption consumes the row and
   rejects the login.
5. Missing, expired, or already consumed tokens do not create a browser session.

The browser route waits for Convex Auth to finish loading the existing session before it consumes
the one-time handoff. A rejected handoff must reject the Convex Auth action instead of returning an
empty credential result, because an empty result can clear a valid browser session. A different-user
failure leaves that browser account signed in and displays the account-mismatch recovery message.

Creation, consumption, and terminal rejection events write `mcpAccessAudit` events without raw
tokens, provider credentials, emails, file paths, or the browser return path. The return path stays
in the URL fragment and per-tab browser state only. Unknown tokens and repeated observations of
already-consumed tokens do not write audit rows, so random-token spraying and replay do not create
an unbounded database write stream. Each handoff schedules deletion at expiry; consumed rows
therefore remain available for the short audit window and are then removed.

Handoff creation is limited to ten rows per MCP grant in a rolling five-minute window. The limit
counts consumed rows until their expiry cleanup, so consuming a link cannot reopen the creation
budget early.

The browser route must remove the handoff fragment before React hydration can report pageviews or
render the app. It stores the token only in per-tab browser state long enough for the route
component to call Convex Auth, then clears that state. PostHog pageview capture must also strip
`/agents/connect#handoff=...` if a fragment survives to app code.

Cloudflare response headers for both `/agents/connect` spellings and both `/oauth/mcp/consent`
spellings must send `Cache-Control: no-store`, block referrers, prevent indexing, and disallow
framing. `no-store` tells browsers and downstream intermediaries not to retain the response;
Cloudflare Pages may still serve the deployment's static shell from its managed asset cache.

## MCP Grant Revocation

The authenticated `/providers` page lists the viewer's active MCP grants in bounded pages. Each row
names the OAuth client, resource, scopes, creation time, and last use when available. Only the grant
owner may revoke it.

The grant status is the authoritative revocation boundary. The first `active` to `revoked`
transition writes one `grant_revoked` audit event. Repeated revocation is a write-free no-op. Access
token validation, refresh exchange, authorization-code exchange, browser handoff creation, and
browser handoff redemption all recheck the active grant, so revocation blocks every derived
credential immediately without scanning or rewriting an unbounded token history.

Presenting a rotated refresh token is treated as credential-family compromise. If its grant is still
active, Samebase revokes the grant and writes one `refresh_token_replay_detected` event. Repeated
replay does not append audit events, and containment does not walk the attacker-controlled
refresh-token replacement chain.

## Non-Goals

- The handoff URL is not an MCP access token, refresh token, Convex Auth JWT, or Convex Auth refresh
  token.
- The tool does not create or modify GitHub, Convex project, Cloudflare, or repository resources.
- The browser route does not support cross-user account switching. A mismatch requires a fresh
  handoff, and the route tells the user to sign out of the other account and request one.
- The token is not durable state. Expired or failed links should be recreated through MCP.

## Validation

- `apps/samebase/convex/agentBrowserHandoff.convex.test.ts` covers creation, single-use redemption,
  account mismatch consumption, same-session reuse, missing or expired tokens, audit write bounds,
  and expiry cleanup.
- `apps/samebase/shared/agentBrowserHandoff.test.ts` covers URL construction, return path
  normalization, and fragment parsing.
- `apps/samebase/src/lib/agentBrowserHandoffPrehydration.test.ts` covers fragment removal and
  storage fallback before hydration.
- `apps/samebase/src/lib/posthogClient.test.ts` covers analytics URL sanitization.
- `apps/samebase/src/lib/appRouter.test.tsx` covers route registration for `/agents/connect`.
- `apps/samebase/convex/mcp/http.convex.test.ts` covers MCP tool listing and trusted invocation
  argument boundaries.
- `apps/samebase/convex/mcp/grants.convex.test.ts` covers paginated ownership, idempotent
  revocation, audit behavior, and immediate invalidation of access, refresh, and browser-handoff
  credentials.
- `apps/samebase/convex/mcp/oauth.convex.test.ts` covers refresh-token replay containment and
  write-free repeated or unknown replay.
- `apps/samebase/src/components/ProviderConnectionsPage.test.tsx` covers MCP grant presentation,
  pending revocation, and failure handling.
- `apps/samebase/shared/siteOrigin.test.ts` covers the shared `SITE_URL` boundary.
