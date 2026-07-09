# 111 Agent Browser Handoff Spec

Status: Accepted

Related: `rfcs/096_AGENT_BROWSER_HANDOFF_PLAN.md`

## Current Contract

Samebase exposes an MCP tool named `create_browser_handoff` for clients that need to open the
Samebase web UI as the same user behind the current MCP grant.

The tool is available only when all of these conditions hold:

1. The OAuth grant includes `access_browser_login_handoff`.
2. The grant and MCP OAuth client are still active.
3. The grant user still has current Samebase role access to `access_browser_login_handoff`.
4. `SITE_URL` is configured to the Samebase app origin for the deployment.

The tool returns a Samebase app URL on `/agents/connect`. The one-time handoff token is carried in
the URL fragment under `handoff`, not in the query string. The optional `returnTo` fragment value is
normalized to a Samebase-relative app path and defaults to `/vault/`.

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

Creation, consumption, and rejected redemption attempts write `mcpAccessAudit` events without raw
tokens, provider credentials, emails, or file paths.

The browser route must remove the handoff fragment before React hydration can report pageviews or
render the app. It stores the token only in per-tab browser state long enough for the route
component to call Convex Auth, then clears that state. PostHog pageview capture must also strip
`/agents/connect#handoff=...` if a fragment survives to app code.

Cloudflare response headers for `/agents/connect` and `/oauth/mcp/consent` must disable browser and
intermediary caching, block referrers, prevent indexing, and disallow framing.

## Non-Goals

- The handoff URL is not an MCP access token, refresh token, Convex Auth JWT, or Convex Auth refresh
  token.
- The tool does not create or modify GitHub, Convex project, Cloudflare, or repository resources.
- The browser route does not support cross-user account switching. A mismatch requires a fresh
  handoff.
- The token is not durable state. Expired or failed links should be recreated through MCP.

## Validation

- `apps/samebase/convex/agentBrowserHandoff.convex.test.ts` covers creation, single-use redemption,
  account mismatch consumption, and same-session reuse.
- `apps/samebase/shared/agentBrowserHandoff.test.ts` covers URL construction, return path
  normalization, and fragment parsing.
- `apps/samebase/src/lib/agentBrowserHandoffPrehydration.test.ts` covers fragment removal and
  storage fallback before hydration.
- `apps/samebase/src/lib/posthogClient.test.ts` covers analytics URL sanitization.
- `apps/samebase/src/lib/appRouter.test.tsx` covers route registration for `/agents/connect`.
- `apps/samebase/convex/mcp/http.convex.test.ts` covers MCP tool listing and trusted invocation
  argument boundaries.
