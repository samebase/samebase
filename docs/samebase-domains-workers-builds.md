# samebase-domains Workers Builds

`samebase-domains` is the Cloudflare Worker defined by `apps/domain-router/wrangler.jsonc`. Its
Workers Builds trigger settings live in Cloudflare, not in Wrangler config.

Use these settings for the production trigger:

- Root directory: `apps/domain-router`
- Build command: `pnpm run build`
- Deploy command: `pnpm run deploy`
- Preview command: `pnpm run deploy:preview`
- Production branch: `main`
- Include paths:
  - `apps/domain-router/*`
  - `pnpm-lock.yaml`
  - `pnpm-workspace.yaml`
  - `package.json`
  - `.nvmrc`
- Exclude paths: none

`pnpm run build` must remain non-deploying. Workers Builds runs the build command before the
production or non-production deploy command, so the package build script uses Wrangler's dry-run
mode to validate and bundle without changing the live Worker.

If `apps/domain-router` starts importing workspace packages, add each transitive workspace package
directory to Include paths, such as `packages/dependent/*`. Keep root install inputs in the list so
runtime, package-manager, and lockfile changes still redeploy the Worker.
