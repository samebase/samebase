# 016 Frontend Hosting Provider Selection Spec

## Document Control

- Status: Proposed
- Owner: Noter platform
- Last updated: 2026-02-18
- Related specs:
  - `specs/003_REPOSITORY_INFRA_PROVISIONING_SPEC.md`
  - `rfcs/006_DNS_DOMAIN_STRATEGY_SPEC.md`
  - `archive/015_BYO_CONVEX_OAUTH_AND_WORKTREE_PROVISIONING_SPEC.md`

## Summary

Noter-managed vault apps are static Vite + React frontends (no SSR). We need a hosting provider that
supports high-frequency production deploys, preview deployments, custom domains, and automation.
Netlify remains the current default because infra is already in place and switching providers would
slow delivery. Cloudflare Pages is a strong alternative and is planned as an opt-in pilot path (not
an immediate default switch).

This spec documents the decision, the Netlify constraint, and alternative providers that are viable
(including GitHub Pages).

Note: Cloudflare Pages is now a planned pilot option using Cloudflare MCP OAuth provider
connections. See:

- `archive/031_CLOUDFLARE_MCP_OAUTH_LOGIN_SPEC.md`
- `archive/032_CLOUDFLARE_HOSTING_PILOT_SPEC.md`

## Goals

1. Support frequent production deploys (100s/day).
2. Provide preview deployments for review workflows.
3. Keep a low-cost path for testers.
4. Support custom domains.
5. Support both managed hosting (Noter-operated) and BYO hosting (user-operated).

## Non-Goals

1. Server-side rendering (SSR) or dynamic hosting.
2. Re-platforming existing vaults in this phase.
3. Supporting all possible static hosting providers.

## Decision

### Default host: Netlify

Netlify is the default static host for noter-managed vault apps because existing infra already
provisions Netlify sites and environment wiring. This minimizes near-term migration work.

### Cloudflare Pages: Pilot option (behind a feature flag)

Cloudflare Pages remains a viable alternative for cost/scale. With Cloudflare MCP OAuth now
available, the next step is an opt-in pilot, not an immediate default switch.

## Cloudflare Pages (Pilot Option)

### Cost and scale

- Cloudflare Pages pricing: Free ($0), Pro ($25/month), Business ($250/month). All plans include
  unlimited sites, seats, requests, and bandwidth (as of 2026-03-02).
- Cloudflare Pages build quotas per month: Free 500, Pro 5,000, Business 20,000. Concurrent builds
  per plan: Free 1, Pro 5, Business 20 (as of 2026-03-02).
- Netlify production deploys cost 15 credits each (as of 2026-03-02). Netlify plan credits and
  pricing: Free ($0) includes 300 credits/month, Personal ($9/month) includes 1,000 credits/month,
  Pro ($20 per member/month) includes 3,000 credits/month (as of 2026-03-02). This yields ~200
  production deploys/month on Pro before add-on credits, which is incompatible with 100s/day
  workflows.

### Deploy volume and preview support

- Cloudflare Pages allows unlimited preview deployments per project and provides build limits per
  month (Free: 500, Pro: 5,000, Business: 20,000) (as of 2026-03-02).

### Custom domain capacity

- Cloudflare Pages supports high custom-domain limits per project (Free: 100, Pro: 250,
  Business: 500) (as of 2026-03-02).
- For apex domains, Cloudflare requires the domain to be added as a Cloudflare zone with nameservers
  pointed to Cloudflare. For subdomains, a CNAME is sufficient without moving DNS. This supports a
  managed default subdomain strategy and optional BYO domains.

### Operational constraints to track

- Cloudflare Pages has a soft limit of 100 projects per account and may temporarily disable creation
  if many projects are created quickly (as of 2026-03-02). Limit increases require a request. This
  is a scaling consideration for a fully managed “one project per vault” approach.

## Netlify Constraint (Known Issue)

Netlify now prices production deploys as a credit-based resource:

- Production deploys cost 15 credits each (as of 2026-03-02).
- Pro includes 3,000 credits per month per team (as of 2026-03-02).

This means even paid Pro only supports ~200 production deploys/month before add-ons, which makes it
unsuitable for high-frequency deploy workflows.

## Alternative Providers (Viable Options)

### 1. GitHub Pages (lowest-friction for GitHub users)

- Pros:
  - Native to GitHub; easy integration for static sites.
  - 10 builds/hour limit does not apply if using a custom GitHub Actions workflow.
- Pricing:
  - Available on GitHub Free for public repos and on paid tiers for private repos.
- Constraints:
  - Intended for personal/educational use only; not permitted for commercial SaaS or similar online
    business use.
  - 1 GB site size, 100 GB/month bandwidth (soft limit), 10-minute build timeout.

### 2. Render Static Sites (simple static hosting, free tier)

- Pros:
  - Static sites are free to deploy and auto-deploy on push.
  - Custom domains supported.
  - Pull request previews supported.
- Pricing:
  - Hobby workspaces include 500 pipeline minutes/month.
- Constraints:
  - Static sites consume pipeline minutes and outbound bandwidth from the workspace’s monthly
    included amounts.
  - Hobby workspaces are limited to two custom domains across all services.

### 3. Firebase Hosting (Google CDN + pay-as-you-go)

- Pros:
  - Generous free tier for small static sites.
  - Paid usage (Blaze) scales cleanly when needed.
- Pricing:
  - Free quotas: 10 GB hosting storage and 10 GB/month data transfer.
- Constraints:
  - When not on Blaze, exceeding free quotas disables deployments or site access until the next
    billing period.
  - Individual files are limited to 2 GB.

### 4. GitLab Pages (if GitLab is acceptable)

- Pros:
  - Free static hosting on GitLab with CI/CD integration.
  - Custom domains supported.
- Constraints:
  - Requires GitLab repo and CI/CD pipeline; not aligned with GitHub-only workflows.

## Recommendation

1. Default: Netlify for managed hosting of noter-managed vault apps (existing infra).
2. Low-friction fallback: GitHub Pages (for non-commercial or personal use only, with GitHub Actions
   publishing).
3. Optional alternative: Render or Firebase Hosting for users who want a non-Cloudflare managed host
   without Netlify/Vercel.

## Risks and Mitigations

- Risk: Netlify deploy credits cap production deploy volume.
  - Mitigation: Monitor deploy volume; revisit hosting strategy if credits become prohibitive.
- Risk: GitHub Pages commercial-use restriction prevents paid SaaS hosting.
  - Mitigation: Use Render or Firebase Hosting for commercial use cases.

## References

- Cloudflare Pages limits (future evaluation):
  https://developers.cloudflare.com/pages/platform/limits/
- Cloudflare Pages pricing (future evaluation):
  https://www.cloudflare.com/developer-platform/products/pages/
- Cloudflare Pages plan details (future evaluation): https://pages.cloudflare.com/?type=standard
- Cloudflare Pages custom domains (future evaluation):
  https://developers.cloudflare.com/pages/configuration/custom-domains/
- Netlify pricing (credits, production deploy cost): https://www.netlify.com/pricing/
- GitHub Pages limits and commercial-use restriction:
  https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
- Render static sites: https://render.com/docs/static-sites
- Render build pipeline minutes: https://render.com/docs/build-pipeline
- Firebase Hosting usage quotas/pricing:
  https://firebase.google.com/docs/hosting/usage-quotas-pricing
- GitLab Pages overview: https://docs.gitlab.com/ee/user/project/pages/
