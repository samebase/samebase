# 037 Cloudflare Branch Deployments Research

## Document Control

- Status: Research
- Owner: Noter platform
- Last updated: 2026-03-05
- Related specs:
  - `specs/032_CLOUDFLARE_HOSTING_PILOT_SPEC.md`
  - `specs/006_DNS_DOMAIN_STRATEGY_SPEC.md`
  - `specs/027_HOSTING_PROVIDER_ABSTRACTION_AND_RAILWAY_PILOT_SPEC.md`
  - `specs/031_CLOUDFLARE_MCP_OAUTH_LOGIN_SPEC.md`

## Summary

This document captures focused research for implementing branch deployments with
Cloudflare and resolving GitHub PR messaging like:

> This branch has not been deployed

The short conclusion is:

1. Cloudflare Pages already supports branch and PR preview deployments.
2. GitHub shows deployment cards only when GitHub Deployment objects/statuses
   are created.
3. Noter currently provisions Cloudflare production URLs but does not yet sync
   Cloudflare branch preview URLs into `vaultDomains`.

## Current State In Noter (as of 2026-03-05)

### GitHub PR deployment card behavior

- Repository CI exists at `.github/workflows/ci.yml`.
- No deployment workflow currently creates GitHub Deployments for PR branches.
- Result: PRs can show all checks green while still showing "This branch has not
  been deployed".

### Cloudflare provisioning behavior in Convex

- Cloudflare provisioning config already enables preview behavior:
  - `preview_deployment_setting: "all"` in
    `apps/noter/convex/hostingProviders.ts`.
- Provisioning stores Cloudflare main URL and hosting state, and upserts only
  the `main` domain row for the default branch:
  - `apps/noter/convex/infraProvisioning.ts`
- `vaultDomains` already supports `kind="branch_preview"` and Cloudflare domain
  sources:
  - `apps/noter/convex/schema.ts`
- Cloudflare hosting state currently has no dedicated persisted branch-preview
  map:
  - `apps/noter/convex/hostingState.ts`

### Existing product/spec intent

- Cloudflare preview branch mapping is explicitly deferred in pilot spec phase
  6:
  - `specs/032_CLOUDFLARE_HOSTING_PILOT_SPEC.md`
- Older DNS strategy spec is Netlify-centric for preview sync and does not yet
  define Cloudflare-specific branch sync behavior:
  - `specs/006_DNS_DOMAIN_STRATEGY_SPEC.md`

## External Research Findings

## 1) Cloudflare Pages supports branch previews

Cloudflare Pages supports:

- Preview deployments from non-production branches.
- Branch deployment controls:
  - `preview_deployment_setting` (`all`, `none`, `custom`)
  - `preview_branch_includes` / `preview_branch_excludes`
- PR comments/status behavior controls (`pr_comments_enabled`).

These are exposed via both product docs and API schema.

## 2) Cloudflare API supports branch-aware deployment workflows

Pages API supports:

- Creating/updating projects with branch preview controls.
- Listing deployments with `env=preview`.
- Creating deployments with an explicit `branch` parameter.
- Deployment payloads containing:
  - `deployment_trigger.metadata.branch`
  - preview/production environment
  - `url`
  - `aliases` (branch alias URL, typically `branch.project.pages.dev`)
  - latest stage/status fields

This is sufficient for deterministic branch -> preview URL sync.

## 3) GitHub PR deployment cards require GitHub Deployments

GitHub’s PR deployment UI is tied to Deployment objects/statuses, not check runs
alone.

Practical consequence:

- A workflow can pass CI and still show "This branch has not been deployed" if
  no deployment status is posted for that ref/environment.

## 4) Wrangler Action can bridge Cloudflare deploy + GitHub deployment status

`cloudflare/wrangler-action` supports:

- `gitHubToken` (with `deployments: write`) to create/update GitHub deployment
  status.
- Pages outputs including branch alias URL (`pages-deployment-alias-url`) and
  deployment URL.

This enables direct PR deployment cards and a "View deployment" URL when wired
into workflow `environment.url`.

## 5) Operational caveats to account for

- Cloudflare Pages does not generate preview deploys for PRs from forks.
- Build quotas and concurrent build limits still apply by plan.
- If Noter stores preview URLs in Convex, sync must be idempotent and tolerate
  delayed deployment completion/state transitions.

## Implementation Options

## Option A: Fastest path to remove PR "not deployed" message

Add a GitHub Actions deployment workflow for this repository using
`cloudflare/wrangler-action`:

1. Trigger on `pull_request` and relevant `push` events.
2. Deploy Pages with branch context.
3. Set workflow permissions including `deployments: write`.
4. Pass `gitHubToken: ${{ secrets.GITHUB_TOKEN }}` to wrangler action.
5. Set `jobs.<job_id>.environment.url` to:
   - `steps.deploy.outputs.pages-deployment-alias-url`
   - fallback to deployment URL output when alias is unavailable.

Outcome:

- GitHub PRs show deployment card and avoid "This branch has not been deployed"
  when workflow runs successfully.

## Option B: Product-level branch preview tracking in Noter

Add a Cloudflare preview domain sync action:

1. Read Cloudflare Pages deployments (`env=preview`) for vault project.
2. Extract branch + alias URL (`deployment_trigger.metadata.branch`,
   `aliases[0]` with fallback to `url`).
3. Upsert `vaultDomains` with:
   - `kind: "branch_preview"`
   - `source: "cloudflare_pages_default"` (or custom source when needed)
   - `branch` and `url`
4. Mark stale branch previews inactive as needed.

Outcome:

- Noter UI/data model can display and reason about branch preview URLs for
  Cloudflare-hosted vaults, not just main production URL.

## Recommended Rollout

1. Implement Option A first (repository workflow): immediate PR UX fix.
2. Implement Option B second (Convex sync): product-level branch preview
   observability and automation.
3. Update `specs/032_*` phase checkboxes and extend DNS/domain spec to include
   Cloudflare branch preview sync behavior.

## Validation Checklist

- PRs on internal branches show a deployment card in GitHub.
- Deployment card links to live branch preview URL.
- Cloudflare preview deploy exists for branch and is reachable.
- (When Option B ships) `vaultDomains` gets/updates `branch_preview` records for
  Cloudflare branches.
- Re-runs are idempotent and do not create duplicate/conflicting domain rows.

## References

- Cloudflare Pages GitHub integration:
  `https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/`
- Cloudflare Pages branch deployment controls:
  `https://developers.cloudflare.com/pages/configuration/branch-build-controls/`
- Cloudflare Pages preview deployments:
  `https://developers.cloudflare.com/pages/configuration/preview-deployments/`
- Cloudflare Pages CI/direct upload guide:
  `https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/`
- Cloudflare Pages platform limits:
  `https://developers.cloudflare.com/pages/platform/limits/`
- Cloudflare Pages known issues:
  `https://developers.cloudflare.com/pages/platform/known-issues/`
- Cloudflare Pages API (project update):
  `https://developers.cloudflare.com/api/resources/pages/subresources/projects/methods/edit/`
- Cloudflare Pages API (create deployment):
  `https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/deployments/methods/create/`
- GitHub Actions deployment environments:
  `https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments`
- GitHub Actions workflow syntax (`jobs.<job_id>.environment`):
  `https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax`
- GitHub REST deployment statuses:
  `https://docs.github.com/en/rest/deployments/statuses`
- Wrangler Action: `https://github.com/cloudflare/wrangler-action`
