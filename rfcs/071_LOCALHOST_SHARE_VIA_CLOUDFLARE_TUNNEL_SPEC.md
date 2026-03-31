# 071 Localhost Share via Cloudflare Tunnel Spec

## Document Control

- Status: Proposed
- Owner: Noter local workflow + Cloudflare integration
- Last updated: 2026-03-31
- Related specs:
  - `rfcs/062_NETLIFY_REMOVAL_AND_CLOUDFLARE_ONLY_HOSTING_SPEC.md`
  - `specs/031_CLOUDFLARE_MCP_OAUTH_LOGIN_SPEC.md`
  - `specs/066_DASHBOARD_PR_CLOUDFLARE_BRANCH_PREVIEW_LINK_SPEC.md`
  - `specs/019_NOTER_CLI_WORKTREE_PREVIEW_PROVISIONING_SPEC.md`

## Summary

Research whether Noter should support a lightweight "publish your localhost"
flow for people working locally with Codex and only occasionally needing to
share a work-in-progress app with someone they know.

Recommendation:

1. Keep the default local workflow tunnel-free. Local work should continue to
   require only Codex + Noter on `localhost`.
2. When a user explicitly wants to share, prefer a named Cloudflare Tunnel plus
   Cloudflare Access over ngrok and over Cloudflare Quick Tunnels.
3. Treat Cloudflare Quick Tunnels as an operator-only shortcut, not the product
   foundation, because the official limitations are too restrictive for a stable
   user-facing share flow.
4. Put share hostnames on a dedicated Cloudflare-managed share zone so Noter can
   use stable subdomains, Access policies, and the same Cloudflare control plane
   it already wants for hosted production apps.

## Why this RFC exists

Current local workflow assumptions are intentionally minimal:

1. The user should be able to work locally with Codex and Noter without first
   provisioning hosted infrastructure.
2. Branch previews and production hosting are already moving in a
   Cloudflare-first direction.
3. Users still sometimes need a simple "let one or two people open what I am
   building right now" flow.

That creates a product gap between:

1. local-only development on `localhost`, and
2. full hosted preview or production deploys.

The obvious commodity answer is ngrok. The question is whether Noter should
instead use Cloudflare Tunnel because Cloudflare is already becoming the
long-term hosting and routing platform for the product.

## Product problem

The target workflow is intentionally narrow:

1. User is already developing locally.
2. User does not want to deploy a real preview environment yet.
3. User wants to share a temporary URL with a known person.
4. The shared app should not become accidentally public.
5. The flow should feel lighter than a real deploy, but safer than "open a raw
   localhost tunnel to the Internet."

## Goals

1. Support an intentional, temporary "share my local app" workflow.
2. Reuse Cloudflare as the eventual front door instead of adding a separate
   permanent tunnel vendor for productized sharing.
3. Keep the recipient experience simple: open a URL, authenticate, view app.
4. Preserve a clean path from local sharing to branch previews and then to
   production domains.
5. Keep operator and security controls centralized in Cloudflare.

## Non-goals

1. Replacing branch preview deploys with tunnels.
2. Replacing production hosting with tunnels.
3. Making tunnel sharing the default local workflow.
4. Supporting arbitrary public sharing with no authentication.
5. Designing TCP/SSH/RDP sharing flows in this first pass.

## Research summary

### Option A: ngrok

ngrok remains strong for developer debugging:

1. The free plan includes a web inspection agent and request replay.
2. The product is optimized for "make localhost reachable quickly."

However, ngrok is a weaker fit for Noter's product direction:

1. The free plan is intentionally small: 1 user, 1 GB/month, 20k HTTP requests
   per month, and 1 development domain.
2. The free plan does not allow choosing a custom static domain or bringing your
   own custom domain.
3. Free OAuth/OIDC identity limits are tiny for a productized sharing path.
4. It would introduce a second durable edge platform even though Noter already
   wants Cloudflare for production hosting and routing.

Conclusion: ngrok is still the better "debug webhooks and replay requests" tool,
but it is not the best foundation for Noter's user-facing share flow.

### Option B: Cloudflare Quick Tunnels

Cloudflare Quick Tunnels are attractive because they are very low friction:

1. `cloudflared tunnel --url http://localhost:5174` creates a public URL fast.
2. They do not require pre-creating a named tunnel.

But Cloudflare's current docs make them a poor product foundation:

1. Quick Tunnels have no uptime SLA.
2. They are limited to 200 in-flight requests.
3. They do not support Server-Sent Events.
4. They cannot be created if the user already has a `~/.cloudflared/config.yaml`
   file.
5. They use random `trycloudflare.com` hostnames instead of a stable Noter
   domain.

Conclusion: Quick Tunnels are acceptable as a local operator convenience, but
they should not be the primary Noter share feature.

### Option C: Named Cloudflare Tunnel plus Access

Named Cloudflare Tunnels fit the product much better:

1. Cloudflare Tunnel explicitly supports publishing internal applications to the
   Internet by mapping public hostnames to local services.
2. The hostname can live on a Cloudflare-managed domain instead of a random
   vendor URL.
3. Cloudflare's self-hosted app guidance recommends creating an Access
   application before setting up the tunnel route so the app is not publicly
   exposed.
4. Cloudflare Access supports email-based one-time PIN login, which is a good
   match for "share with someone I know."
5. Cloudflare also has account-level default-deny
   (`Require Cloudflare Access Protection`) to prevent accidental exposure when
   new hostnames are added.

Conclusion: named tunnels are the right shape for Noter if the share flow is
meant to feel productized and safe.

## Recommendation

Noter should adopt the following product stance:

1. Default local dev remains local-only.
2. "Share" is an explicit action that turns on a named Cloudflare Tunnel for a
   local service.
3. Every shared hostname gets a Cloudflare Access application by default.
4. The first shipping auth mode should be one-time PIN plus explicit recipient
   allowlisting.
5. Quick Tunnels are not used in the primary UX.
6. ngrok is not the default product path, though operators may still use it
   manually for webhook debugging.

## Proposed product shape

### User flow

1. User works locally as normal on `localhost`.
2. User chooses `Share local app`.
3. Noter asks for:
   - local port or local URL
   - recipient email addresses
   - optional expiry
4. Noter returns a stable URL on a Noter-controlled share domain.
5. Recipient opens the URL, passes Cloudflare Access, and reaches the local app
   through the tunnel.
6. User stops sharing, or the share expires automatically.

### Recommended architecture

1. Noter owns a dedicated Cloudflare-managed share zone.
2. Noter creates one named tunnel per share session, or a small reusable pool if
   operational evidence later justifies it.
3. Noter creates the published hostname and Access application before the share
   is considered active.
4. The local machine runs `cloudflared tunnel run` with a token delivered by
   Noter.
5. Noter tears down the route and Access app when the share ends.

### Hostname strategy

Use a dedicated share zone with single-label hostnames, for example:

- `abc123.share.noter.md`

Rationale:

1. Cloudflare's dashboard flow notes that multi-level subdomains require an
   Advanced Certificate.
2. A dedicated share zone keeps each shared hostname single-label relative to
   that zone.
3. This stays aligned with the repo's broader "separate zone for specific app
   surfaces" direction.

## Security model

### Baseline rules

1. Every shared app is private by default.
2. Cloudflare Access is created before the tunnel route is considered usable.
3. Recipient scope is explicit and narrow.
4. Shares should expire automatically unless the user deliberately extends them.

### Access policy recommendation

First shipping policy:

1. Use `One-time PIN` as the login method.
2. Allow only explicitly listed email addresses for the share.
3. Do not ship a policy equivalent to "all valid emails" or `Everyone`.

Why this matters:

1. Cloudflare documents that allowing `One-time PIN` as a broad login-method
   rule effectively permits all valid email addresses.
2. That is the opposite of the intended "share with one or a few known people"
   workflow.

### Default-deny recommendation

If Noter uses a shared Cloudflare account for tunnel hostnames, strongly
consider enabling `Require Cloudflare Access Protection` on the share zone or
account surface once all shipped public hostnames are modeled correctly.

Why:

1. It prevents a hostname from becoming public before an Access application
   exists.
2. Cloudflare documents this as the way to avoid accidental exposure of new
   hostnames.

## Operational guidance

### Why this is a better fit than ngrok for Noter

1. Same edge platform as future production hosting.
2. Same DNS and access-control surface as broader Cloudflare work.
3. Stable branded URLs instead of a vendor-branded random hostname.
4. Cleaner story from local share to preview to production.

### What ngrok still does better

1. Request inspection and replay.
2. Fast debugging for webhook-style integrations.

That means Noter should not frame Cloudflare Tunnel as a perfect ngrok clone.
The goal is a safer, branded, product-shaped share flow, not a webhook debugging
lab.

### Local runtime handling

When Noter starts `cloudflared` locally:

1. Prefer token-file based startup over putting the token directly in the
   process command line when the installed `cloudflared` version supports it.
2. Treat the tunnel process as ephemeral session state, not durable machine
   setup.
3. Stop the local process when the share ends.

## Rollout proposal

### Phase 1: Manual operator validation

1. Prove the flow with one dedicated Cloudflare share zone.
2. Validate Vite dev server behavior through a named tunnel.
3. Validate recipient login with Access one-time PIN.
4. Confirm that the local app works well enough through the tunnel for the
   intended "show someone what I built" use case.

### Phase 2: Thin product slice

1. Add an explicit `Share local app` action.
2. Ask for recipient emails and expiry only.
3. Create one hostname, one Access app, and one local tunnel session.
4. Show a single share URL plus active/inactive state.

### Phase 3: Hardening

1. Add cleanup guarantees and stale-share expiry.
2. Add auditability for who created the share and who was allowed.
3. Add quotas and abuse controls.
4. Evaluate whether a pooled tunnel model is worth the complexity.

## Open questions

1. Should the first implementation use a Noter-owned Cloudflare account or the
   user's connected Cloudflare account?
2. Should share hostnames live under `share.noter.md`, `preview.noter.md`, or
   another dedicated zone?
3. How much session duration should Access grant by default for casual shares?
4. Should Noter validate Access tokens at the origin through Cloudflare Tunnel's
   Access integration in the first shipping version, or is edge-only protection
   sufficient for the initial slice?
5. What is the smallest cleanup contract that still avoids stale exposed
   hostnames?
6. Do we want a later "public share link" mode at all, or should this remain
   explicitly person-scoped?

## Decision

Adopt Cloudflare as the intended direction for Noter's productized localhost
sharing flow, but only through named tunnels plus Access. Do not build the main
feature on Cloudflare Quick Tunnels. Keep ngrok as a valid manual tool for
debugging-heavy workflows, not as Noter's primary user-facing share platform.

## References

- Cloudflare Tunnel overview:
  - https://developers.cloudflare.com/tunnel/
- Cloudflare Quick Tunnels:
  - https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/
- Cloudflare create tunnel flow:
  - https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/
- Cloudflare self-hosted apps with Access:
  - https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/
- Cloudflare Access one-time PIN:
  - https://developers.cloudflare.com/cloudflare-one/identity/one-time-pin/
- Cloudflare Access policies:
  - https://developers.cloudflare.com/cloudflare-one/access-controls/policies/
- Cloudflare Require Access protection:
  - https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/require-access-protection/
- Cloudflare account limits:
  - https://developers.cloudflare.com/cloudflare-one/account-limits/
- Cloudflared run parameters:
  - https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/cloudflared-parameters/run-parameters/
- ngrok free plan limits:
  - https://ngrok.com/docs/pricing-limits/free-plan-limits
- ngrok traffic inspection:
  - https://ngrok.com/docs/obs/traffic-inspection
- ngrok pricing:
  - https://ngrok.com/pricing
