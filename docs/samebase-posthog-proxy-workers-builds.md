# samebase-posthog-proxy Workers Builds

`samebase-posthog-proxy` is the Cloudflare Worker defined by `apps/posthog-proxy/wrangler.jsonc`. It
is the first-party PostHog proxy for `https://e.samebase.com`, and its Workers Builds trigger
settings live in Cloudflare, not in Wrangler config.

The Worker source is based on PostHog's Cloudflare Worker reverse-proxy implementation:
https://posthog.com/docs/advanced/proxy/cloudflare. Keep the `/static/*` and `/array/*` asset-host
split aligned with that guide unless Samebase intentionally diverges.

The Worker adds browser-facing CORS headers for `https://samebase.com` because Samebase loads
PostHog remote config from the `https://e.samebase.com` subdomain.

Use these Workers Builds settings:

- Project name: `samebase-posthog-proxy`
- Root directory: `apps/posthog-proxy`
- Build command: `pnpm run build`
- Deploy command: `pnpm run deploy`
- Preview command: `pnpm run deploy:preview`
- Production branch: `main`
- Include paths:
  - `apps/posthog-proxy/*`
  - `pnpm-lock.yaml`
  - `pnpm-workspace.yaml`
  - `package.json`
  - `.nvmrc`
- Exclude paths: none

`pnpm run build` must remain non-deploying. Workers Builds runs the build command before the
production or non-production deploy command, so the package build script uses Wrangler's dry-run
mode to validate and bundle without changing the live Worker.

The Samebase app production build derives `VITE_PUBLIC_POSTHOG_HOST=https://e.samebase.com` from
source control when `PROD_POSTHOG_PROJECT_TOKEN` is present. Do not configure
`VITE_PUBLIC_POSTHOG_HOST` directly in the `samebase` Workers build variables.

If `apps/posthog-proxy` starts importing workspace packages, add each transitive workspace package
directory to Include paths, such as `packages/dependent/*`. Keep root install inputs in the list so
runtime, package-manager, and lockfile changes still redeploy the Worker.

## Switch to Worker Previews

Commit the Worker Previews update on a new branch. Push the branch only after the Cloudflare switch.

In Cloudflare, open `samebase-posthog-proxy` > **Settings** > **Builds**. Select **Set up** in the
**Set up Worker Previews** banner. Set the Preview command to `pnpm run deploy:preview`, then select
**Switch to Worker Previews**. This switch cannot be reversed.

This Worker needs no preview variables, secrets, or bindings. Preview deployments do not change the
`e.samebase.com` production route. The proxy still forwards to the same PostHog service, so do not
send test capture events to its preview URL.
