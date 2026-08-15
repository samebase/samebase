# Cloudflare Workers Single Stack Migration Spec

## Document Control

- Status: Accepted implementation plan
- Owner: Samebase hosting, generated app provisioning, and public template stack
- Created: 2026-05-15
- Last updated: 2026-08-14
- Related:
  - `research/2026-05-05-cloudflare-pages-workers-direction.md`
  - `research/2026-05-15-samebase-workers-provisioning-migration.md`
  - `docs/artifacts/samebase-app/README.md`
  - `docs/artifacts/samebase-app/cloudflare-workers-install.md`
  - `docs/artifacts/samebase-app/regeneration-prompt.md`
  - `specs/005_STARTER_TEMPLATE_STRATEGY_SPEC.md`
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
  - `specs/096_INITIALIZING_VAULT_GITHUB_PROVISIONING_SPEC.md`

## Summary

Move Samebase to one Cloudflare Workers-based stack:

1. the public `samebase/app` teaching template
2. Samebase-generated user apps
3. the Samebase production app itself

The supported stack is:

1. GitHub source repository
2. Vite+ frontend/tooling
3. TanStack Start for the generated app template
4. Convex for backend state and deploy-key-driven production/preview deploys
5. Cloudflare Workers Static Assets through Workers Builds

Cloudflare Pages is legacy after this migration. Samebase should not keep a permanent Pages/Workers
provider matrix unless implementation proves that a short-lived Pages helper is cheaper than
deleting it.

The Convex deploy-key naming contract is part of the stack. Manual template users,
Samebase-provisioned generated apps, and Samebase production should all select `CONVEX_DEPLOY_KEY`
for the production branch and `PREVIEW_CONVEX_DEPLOY_KEY` for non-production branches. Preview
builds must require the preview key instead of falling back to the production key.

Samebase-managed wiring also sets the non-secret
`SAMEBASE_CONVEX_PROJECT=version=1&teamId=<teamId>&projectId=<projectId>` marker on both triggers.
App build scripts consume only the two deploy-key secrets. The marker lets Samebase read which
Convex project the Cloudflare configuration declares without copying that relationship into its
database.

Generated app provisioning can move to Workers before Samebase production hosting moves. That is the
right first product step because it proves the user-facing automation path. The single-stack
guarantee is still incomplete until Samebase itself also deploys through Workers.

## Product Principle

Samebase sells one stack to users. The stack Samebase recommends, generates, and automates must be
the same stack the Samebase product uses in production.

The migration is not complete while Samebase itself still deploys through Cloudflare Pages. The
public template can move first, but the clean final artifact claim should wait until Samebase also
runs on Workers.

## Compatibility Policy

Samebase does not currently need external-user backwards compatibility for previously provisioned
Cloudflare Pages resources. The operator can clear or rewrite production data before rollout.

Implementation rules:

1. Optimize for the future Workers-only stack.
2. Prefer deleting Pages code over preserving hidden compatibility.
3. Keep Pages behavior only when it is a short-lived rollout helper and clearly less complex than
   immediate removal.
4. Treat old Pages resources and rows as an operational cleanup concern, not as a product
   compatibility requirement.
5. Git history and this PR are the recovery mechanism if a removed Pages path is needed later.

## Goals

1. Make `samebase/app` a Cloudflare Workers Static Assets template.
2. Make Samebase production deploy through Workers.
3. Make new Samebase-generated apps provision through Workers Builds.
4. Preserve Convex as the backend and keep production/preview Convex deployments connected to
   Cloudflare builds.
5. Keep the generated app client-first unless a real shipped requirement needs Worker code or SSR.
6. Remove Pages-specific product, provisioning, read, deletion, and setup copy after Workers
   behavior is proven.
7. Keep the template and Samebase toolchains aligned while this migration is active.

## Non-Goals

1. Supporting Cloudflare Pages as an alternate user-facing deploy provider.
2. Preserving old Pages rows indefinitely.
3. Adding a generic hosting-provider abstraction.
4. Adding another non-Cloudflare provider path.
5. Introducing server functions, SSR, or Worker runtime logic into the generated app template unless
   the template truly needs it.
6. Reworking Convex provider connection or GitHub repository creation outside the migration surface.

## Current State

This section records the baseline before the Workers implementation PRs land. Implementation PRs
should update or remove these facts as the code catches up.

### Template

`samebase/app@main` is still Pages-oriented. Samebase currently exports that branch into
`apps/samebase/convex/starterSeedManifest.generated.ts`.

The Workers branch is `samebase/app@v5-tanstack-start-workers`. That branch proves the rough shape:

1. TanStack Start in client-first mode
2. Convex backend
3. Cloudflare Workers Static Assets
4. `wrangler.jsonc` without a hard-coded Worker name
5. `pnpm run build`, `pnpm run deploy`, and `pnpm run deploy:preview`
6. Node 24 pin so small TypeScript helper scripts can run directly in Cloudflare Workers Builds

The branch is acceptable as the implementation input. Commit numbering, copy cleanup, and final
artifact polish can happen later. The immediate Samebase work is to consume this Workers-shaped
template and replace Pages auto-provisioning.

### Generated App Seeding

Runtime app creation does not clone `samebase/app`. It seeds one generated commit from
`starterSeedManifest.generated.ts`.

This preserves runtime reliability but means the public template history and the generated user
repository history intentionally have different jobs:

1. `samebase/app` teaches the stack through small commits.
2. generated user repositories start from one clean snapshot commit.

### Pre-Migration Provisioning

Before this migration, Samebase provisioned Cloudflare Pages in the `ensure_cloudflare` step. The
Pages implementation owned:

1. Pages project create/patch/read/delete endpoints
2. Pages build config
3. Pages production and preview env vars
4. Pages deployment trigger
5. Pages preview PR comment parsing
6. Pages status, logs, and project inventory reads
7. `cloudflare_pages_default` and `cloudflare_pages_custom` domain sources
8. Pages-oriented dashboard and setup copy

### Samebase Production Hosting

Samebase production hosting still needs to move from Pages to Workers. This is part of the
single-stack guarantee, not follow-up cleanup.

## Target State

### Template Target

`samebase/app` main should be a Workers teaching artifact. For the first Samebase implementation
pass, the current `v5-tanstack-start-workers` branch is good enough to consume directly or promote
to main. Clean commit numbering and copy are polish, not blockers.

Requirements:

1. uses TanStack Start
2. stays client-first
3. keeps Convex as backend
4. includes minimal Convex Auth guest sessions, single-word guest display names reserved through a
   database index-backed exact-match lookup, user-owned example data, and no external auth provider
   requirement
5. deploys with Workers Static Assets
6. includes a minimal `wrangler.jsonc`
7. does not hard-code the Worker name
8. supports production deploys and preview-version uploads through repo-owned scripts
9. documents manual self-deploy without Samebase
10. has clean, numbered commits and `REPO_HISTORY.md`
11. avoids generator leftovers such as `.cta.json` and `.cursorrules`

### Samebase Production Target

Samebase itself should deploy through Workers using the same platform direction as generated apps.

Requirements:

1. Cloudflare Workers Static Assets serves the Samebase frontend.
2. Samebase production build and deploy commands are repo-owned scripts.
3. Preview builds use the same production/preview distinction expected from the generated template.
4. Runtime environment variables and deploy keys are explicit and documented.
5. Pages dashboard/build settings are no longer required for Samebase production.

### Generated App Provisioning Target

New Samebase-managed app creation should:

1. create the GitHub repository
2. seed the Workers template snapshot
3. create or resolve Convex production deployment
4. create or resolve Convex preview deployment
5. create production and preview Convex deploy keys
6. create or reuse a Cloudflare Worker
7. connect the GitHub repository to Workers Builds
8. require one account Workers Builds token selected by its exact UUID
9. configure production build/deploy commands
10. configure non-production branch build/deploy commands
11. set production and preview build variables/secrets
12. trigger the first production build
13. record the Worker tag and read the Workers production URL from Cloudflare
14. surface preview URLs, status, and logs from Workers-compatible data

## Implementation Plan

### Phase 1: Select Workers Template Source

1. Use `samebase/app@v5-tanstack-start-workers` as the implementation source, or promote that branch
   to `samebase/app@main`.
2. Verify local commands:
   - `pnpm install --frozen-lockfile`
   - `vp run check`
   - `vp run build`
   - production deploy dry run
   - preview deploy dry run
3. Verify manual Cloudflare Workers Builds setup from a clean Cloudflare/Convex state.

Template history polish remains valuable, but it should not block Samebase auto-provisioning work.

### Phase 2: Export Workers Template Snapshot

After selecting the Workers template source, refresh the generated starter manifest:

```bash
pnpm run template:export -- --branch v5-tanstack-start-workers
```

Update tests that assert starter files. Expected starter files should include the Workers config and
scripts.

### Phase 3: Replace Pages Provisioning With Workers Provisioning

Replace the Pages-specific Cloudflare implementation with Workers behavior.

Required Workers operations:

1. resolve or create the Worker
2. connect the GitHub repository to Workers Builds
3. list the account's non-secret Workers Builds token records
4. require the selected token UUID and verify that Cloudflare still lists it for the exact account
5. create or patch the production build trigger with that UUID
6. create or patch the preview/non-production build trigger with the same UUID
7. set Convex deploy-key secrets in Workers Builds: both `CONVEX_DEPLOY_KEY` and
   `PREVIEW_CONVEX_DEPLOY_KEY` on the production and preview triggers
8. set the same non-secret `SAMEBASE_CONVEX_PROJECT=version=1&teamId=<teamId>&projectId=<projectId>`
   marker on both triggers
9. do not set `VITE_CONVEX_URL` in Workers Builds; Convex deploy supplies it to the child build
10. trigger the first production build
11. read build status, logs, and production URL directly from Cloudflare when needed
12. rediscover and delete Worker build triggers when deleting a Samebase-managed vault

For generated single-repository apps, use these Workers Builds commands:

1. build command: `pnpm run build`
2. production deploy command: `pnpm run deploy`
3. preview deploy command: `pnpm run deploy:preview`

For older monorepo-shaped Samebase-generated apps, a temporary fallback can use `apps/samebase` as
the root with direct Wrangler commands while the template surface converges.

User-facing Cloudflare management access must stay web-authenticated. A Workers Builds token is a
separate Cloudflare-owned build setting. If the account has no token record, Samebase sends the user
to Cloudflare to create one and then reloads the non-secret list. Samebase never asks for or stores
that user API token secret. Local and preview environments may continue to use operator-provided
seeded Cloudflare credentials, but those credentials must include the equivalent of Workers Scripts
edit, Workers Builds Configuration edit, and Account Settings read.

Avoid a generic provider matrix. The target implementation may rename `cloudflareResources.ts` or
replace its contents, but the shipped behavior should be Workers-only unless a temporary Pages
cleanup helper is explicitly needed.

### Phase 4: Replace Preview Metadata Path

Inspect real Workers Builds PR behavior before coding the final preview metadata source.

Preferred order:

1. use Workers Builds API for build status/logs/URLs if it exposes enough data
2. use GitHub checks if Cloudflare writes stable useful check-run metadata
3. parse Cloudflare PR comments only if the Workers comment shape is stable

The existing Pages comment parser should not be treated as the long-term source without
verification.

### Phase 5: Move Samebase Production Hosting To Workers

1. Add the minimal Workers config and repo-owned deploy scripts Samebase itself needs.
2. Configure Workers Builds for Samebase production and preview branches.
3. Validate production deploy, preview deploy, logs, and rollback/version behavior.
4. Update Samebase operator docs to use Workers terms.
5. Remove Pages assumptions from Samebase production deployment docs/config.

This phase proves the stack Samebase sells is also the stack Samebase uses. It should not block the
generated-app provisioning migration, but it must happen before the migration is considered
complete.

### Phase 6: Remove Pages Product Surface

Remove or rewrite the Pages product surface instead of preserving parallel provider state:

1. Pages domain source literals
2. Pages project deletion
3. Pages project inventory reads
4. Pages status/log endpoints
5. Pages dashboard labels
6. Pages setup docs and landing-preview copy
7. Pages-specific visual fixtures and tests

If a Pages cleanup helper is needed, isolate it as operational cleanup rather than a supported app
path.

## Data And Rollout

Before deploying the Workers-only provisioning path, choose one rollout data strategy:

1. clear affected production Convex rows and Cloudflare Pages resources manually
2. run a one-off cleanup/migration
3. keep a temporary Pages cleanup path for one deploy, then remove it

Do not design the runtime model around indefinite Pages compatibility. Do not keep duplicate
infrastructure status fields that can disagree with the vault provider states. `vaultInfrastructure`
must be removed rather than repurposed. Stable Cloudflare Worker identity belongs in
`vaultCloudflareWorkers`; current Worker, URL, Builds, root, and marker state is observed live from
Cloudflare.

The selected build-token UUID stays in the provisioning plan so an unfinished retry preserves the
user's exact choice. If Cloudflare removes that record before managed setup finishes, Samebase does
not select a replacement during retry. It tells the user to remove the failed app and create it
again with another token. After setup, the production and preview triggers are the source of truth.
Samebase fetches the current name from Cloudflare and never infers token health from list
membership.

Rollout checklist:

1. old Pages resources accounted for
2. old Pages rows removed or migrated
3. Samebase production Workers deployment verified
4. generated Workers app production deploy verified
5. generated Workers app preview deploy verified
6. Convex production and preview deploy keys verified
7. dashboard branch preview links verified
8. cleanup/deletion verified

## Validation

Template validation:

1. local build/check commands pass
2. Cloudflare Workers production deploy succeeds
3. Cloudflare Workers non-production preview deploy succeeds
4. todo flow works after reload against Convex
5. README self-deploy instructions work from clean provider state

Samebase production validation:

1. production Workers deployment serves the app
2. preview Workers deployment serves the app
3. logs and build history are accessible
4. rollback/version workflow is understood

Generated app provisioning validation:

1. create a new Samebase-managed app
2. confirm GitHub repo seeded from Workers template snapshot
3. confirm Convex production deployment exists
4. confirm Convex preview deployment exists
5. confirm Cloudflare Worker exists
6. confirm production URL opens
7. open a PR and confirm preview URL/status/logs
8. delete the vault and confirm Samebase-managed resources are removed

Use Chrome to verify Cloudflare dashboard behavior where API responses are not enough to prove the
user/operator flow.

## Open Questions

1. Which Workers Builds API response is the most reliable source for preview URL and logs?
2. What exact Cloudflare reconnect copy should Samebase show when MCP OAuth lacks Workers Builds
   access?
3. Which Pages cleanup strategy should be used immediately before rollout?
4. What exact Workers Builds setup should Samebase production use?

## Sources

- [Cloudflare Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Cloudflare Workers build branches](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/)
- [Cloudflare Workers Builds API reference](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/)
- [Cloudflare Workers versions and deployments](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/)
- [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
