# samebase-domains Workers Builds

`samebase-domains` is the Cloudflare Worker defined by `apps/domain-router/wrangler.jsonc`. Its
Workers Builds trigger settings live in Cloudflare, not in Wrangler config.

Use these Workers Builds settings:

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

## Switch to Worker Previews

Commit the Worker Previews update on a new branch. Push the branch only after the Cloudflare switch.

In Cloudflare, open `samebase-domains` > **Settings** > **Builds**. Select **Set up** in the **Set
up Worker Previews** banner. Set the Preview command to `pnpm run deploy:preview`, then select
**Switch to Worker Previews**. This switch cannot be reversed.

This Worker needs no preview variables, secrets, or bindings. Preview deployments do not change the
production routes. The preview URL returns `404` because the router accepts only registered
`json.md` and `xml.md` hostnames.
