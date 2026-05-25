# samebase-domains Workers Builds

`samebase-domains` is the Cloudflare Worker defined by `apps/domain-router/wrangler.jsonc`. Its
Workers Builds trigger settings live in Cloudflare, not in Wrangler config.

Use these settings for the production trigger:

- Root directory: `apps/domain-router`
- Build command: `pnpm run build`
- Deploy command: `pnpm run deploy`
- Version command: `pnpm run build:preview`
- Production branch: `main`
- Include paths:
  - `apps/domain-router/*`
  - `pnpm-lock.yaml`
  - `pnpm-workspace.yaml`
  - `package.json`
  - `.nvmrc`
- Exclude paths: none

If `apps/domain-router` starts importing workspace packages, add each transitive workspace package
directory to Include paths, such as `packages/dependent/*`. Keep root install inputs in the list so
runtime, package-manager, and lockfile changes still redeploy the Worker.
