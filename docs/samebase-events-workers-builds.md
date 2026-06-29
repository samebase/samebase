# samebase-events Workers Builds

`samebase-events` is the Cloudflare Worker defined by `apps/posthog-proxy/wrangler.jsonc`. It is the
first-party PostHog proxy for `https://e.samebase.com`, and its Workers Builds trigger settings live
in Cloudflare, not in Wrangler config.

The Worker source is based on PostHog's Cloudflare Worker reverse-proxy implementation:
https://posthog.com/docs/advanced/proxy/cloudflare. Keep the `/static/*` and `/array/*` asset-host
split aligned with that guide unless Samebase intentionally diverges.

Use these settings for the production trigger:

- Root directory: `apps/posthog-proxy`
- Build command: `pnpm run build`
- Deploy command: `pnpm run deploy`
- Non-production branch deploy command: `pnpm run deploy:preview`
- Production branch: `main`
- Include paths:
  - `apps/posthog-proxy/*`
  - `pnpm-lock.yaml`
  - `pnpm-workspace.yaml`
  - `package.json`
  - `.nvmrc`
- Exclude paths: none

The Samebase app production build derives `VITE_PUBLIC_POSTHOG_HOST=https://e.samebase.com` from
source control when `PROD_POSTHOG_PROJECT_TOKEN` is present. Do not configure
`VITE_PUBLIC_POSTHOG_HOST` directly in the `samebase` Workers build variables.

If `apps/posthog-proxy` starts importing workspace packages, add each transitive workspace package
directory to Include paths, such as `packages/dependent/*`. Keep root install inputs in the list so
runtime, package-manager, and lockfile changes still redeploy the Worker.
