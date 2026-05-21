# 066 Dashboard Cloudflare Branch Preview Links and Thumbnails

## Document Control

- Status: Proposed
- Owner: Noter dashboard/frontend + Convex infra
- Last updated: 2026-05-12
- Related specs:
  - `specs/099_REPOSITORY_REFRESH_QUEUE_SPEC.md`
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
  - `specs/004_AI_PROD_ACCESS_POLICY_SPEC.md`
  - `specs/066_DASHBOARD_PR_CLOUDFLARE_BRANCH_PREVIEW_LINK_SPEC.md`
  - `specs/045_VAULT_MULTI_BRANCH_DASHBOARD_AND_EDITOR_SPEC.md`
  - `rfcs/046_VAULT_MULTI_BRANCH_ROLLOUT_PLAN.md`

## Summary

This RFC now captures research and future guidance for dashboard preview surfaces beyond the
accepted direct-link implementation.

The accepted implementation plan for direct branch preview links now lives in:

- `specs/066_DASHBOARD_PR_CLOUDFLARE_BRANCH_PREVIEW_LINK_SPEC.md`

This RFC remains useful for two related exploratory ideas:

1. Show the Cloudflare preview link directly on each branch row in the vault dashboard.
2. Explore a future branch-specific mini preview surface in the dashboard, likely as a cached
   thumbnail rather than a live embedded app.

The thumbnail idea is still viable, but only with a separate cache model keyed by immutable
deployment identity. It should not be attempted as a live iframe per branch.

## Why this RFC exists

Today the dashboard shows GitHub branch metadata, but not the hosted preview URL for that branch.

Relevant current-state findings:

1. `vaultDomains` already exists and explicitly supports `kind: "branch_preview"`.
2. Cloudflare provisioning already enables preview deployments and provides preview-specific Convex
   environment wiring.
3. Runtime provisioning only writes the main production URL into `vaultDomains`; preview branch rows
   are never populated.
4. `vault.getUserVaults()` returns branch metadata from GitHub plus one vault-level
   `infraProductionUrl`, but no branch-level hosting URL.
5. `VaultDashboard` renders each branch row with a branch route, commit link, pull request link, and
   ahead/behind counts only.

That means the product concept is aligned with the schema, but the runtime data path stops short of
exposing preview URLs where the user would want them.

## Current implementation snapshot

### Data model

The existing `vaultDomains` schema is already sufficient for one URL per branch:

- `vaultId`
- `branch`
- `kind: "main" | "branch_preview"`
- `url`
- `source`
- `active`
- `lastSyncedAt`

Current limitation:

- The `by_vault_and_branch` lookup effectively makes this a single-row-per- branch store. That is
  acceptable for one default preview link per branch, but it is not enough if Noter later wants to
  store both the default `branch.project.pages.dev` alias and a custom branch domain at the same
  time.

### Provisioning path

Cloudflare provisioning already configures preview deployments:

1. `hostingProviders.ensureCloudflareResources(...)` sets `preview_deployment_setting: "all"`.
2. The same path injects preview-specific environment variables using the preview Convex deployment.
3. After provisioning, `infraProvisioning.provisionVaultInfrastructure(...)` writes only the main
   branch URL into `vaultDomains`.

There is currently no sync that reads Cloudflare deployments and maps the latest preview alias for
each active GitHub branch into Convex.

### Dashboard path

`vault.getUserVaults()` returns:

- `remoteBranches[]` from GitHub
- `infraProductionUrl` at the vault level

It does not join `vaultDomains`, so `VaultDashboard` has nothing branch-specific to render besides
GitHub metadata.

## Cloudflare behavior verified

Cloudflare Pages documentation confirms the shape Noter should rely on:

1. Preview deployments create both:
   - an immutable hash-based deployment URL
   - a mutable branch alias that tracks the latest deployment for that branch
2. Branch aliases are normalized:
   - lowercased
   - non-alphanumeric characters replaced with `-`
3. Pages API responses expose:
   - deployment `url`
   - deployment `aliases`
   - branch metadata under `deployment_trigger.metadata.branch`

Useful official references:

- Preview deployments: `https://developers.cloudflare.com/pages/configuration/preview-deployments/`
- Branch custom domains: `https://developers.cloudflare.com/pages/how-to/custom-branch-aliases/`
- Pages API project/deployment schema:
  `https://developers.cloudflare.com/api/resources/pages/subresources/projects/methods/edit/`
- Browser Rendering overview: `https://developers.cloudflare.com/browser-rendering/`
- Browser Rendering REST API: `https://developers.cloudflare.com/browser-rendering/rest-api/`

## Recommendation 1: Show branch preview links directly in the dashboard

### Product recommendation

Show the Cloudflare preview URL on each active branch row. This should be the first shipped change
because it is high-value and low-risk compared to branch thumbnails.

The branch link should appear in the same metadata cluster that currently holds:

- commit SHA
- PR link
- ahead/behind counts

### Backend recommendation

Do not synthesize the preview URL in the client from the branch name. The alias shape is
predictable, but the authoritative source should remain Cloudflare because:

1. A branch may not have deployed yet.
2. Preview branch controls may exclude the branch.
3. Alias normalization is Cloudflare-owned behavior.
4. Custom branch domains may later override the preferred display URL.

Instead:

1. Add a Cloudflare sync that reads project deployments for the vault’s Pages project.
2. Group deployments by `deployment_trigger.metadata.branch`.
3. Resolve the latest branch alias or preferred URL for each branch.
4. Upsert one `vaultDomains` row per branch with `kind: "branch_preview"`.
5. Expose that URL through `vault.getUserVaults()` in each `remoteBranches[]` item.

### Best place to sync

Current refresh ownership changed after this RFC was written. The dashboard now reports repository
refresh demand to Convex, and backend policy chooses GitHub metadata and provider-link work.

If this RFC resumes, integrate branch preview syncing behind the backend repository refresh policy
in `specs/099_REPOSITORY_REFRESH_QUEUE_SPEC.md`.

This keeps branch-sync work in one place instead of inventing a separate dashboard polling loop.

### Minimal query shape

Extend `remoteBranches[]` in `vault.getUserVaults()` with something like:

- `cloudflarePreviewUrl?: string`

That is enough to render the link inline without changing the rest of the vault card shape.

## Recommendation 2: Prefer cached thumbnails over live branch embeds

### Product recommendation

If Noter later wants a small visual preview for each branch in the dashboard, it should use cached
screenshots or small cached preview cards.

It should not render a live iframe or embedded running app for every branch by default.

Why a live embed is the wrong default:

1. Too expensive in network and browser work for many branches.
2. Too fragile when preview deployments are protected by Cloudflare Access.
3. Too noisy for a dense dashboard layout.
4. Hard to make stable when the app boot sequence is asynchronous.

### Recommended UX progression

Phase A:

- Show only the branch preview link.

Phase B:

- Add branch preview metadata:
  - page title
  - favicon
  - last capture time
  - deploy status if useful

Phase C:

- Add cached thumbnail preview on hover, expand, or selected rows only.

Inline thumbnails for every branch row should not be the initial behavior.

## Thumbnail architecture brainstorming

### Core rule: do not key thumbnails by branch name alone

Branch aliases are mutable pointers to the latest deployment. Thumbnail cache identity should
instead prefer immutable deployment identity.

Recommended key order:

1. Cloudflare deployment ID
2. Immutable deployment URL (`<hash>.<project>.pages.dev`)
3. GitHub head commit SHA as fallback

This separates two concerns:

- `displayUrl`: the branch alias users click
- `captureUrl`: the immutable deployment URL used to create the thumbnail

### Why immutable deployment identity matters

If the cache is keyed only by branch name:

1. New deployments overwrite previous branch state ambiguously.
2. Race conditions between multiple background capture jobs become harder to reason about.
3. A stale image can be misattributed to a new deployment.

Using deployment ID or immutable deployment URL makes cache freshness and backfills much easier to
reason about.

## Suggested preview-cache model

Do not overload `vaultDomains` for thumbnails. Keep URL mapping and preview cache state separate.

Suggested additional table or cache document shape:

- `vaultId`
- `branch`
- `displayUrl`
- `deploymentUrl`
- `deploymentId`
- `headCommitSha`
- `pageTitle?`
- `faviconUrl?`
- `captureStatus`
- `screenshotStorageId?`
- `lastCapturedAt?`
- `lastSeenAt`
- `nextRefreshAt?`
- `lastError?`

This keeps:

- `vaultDomains` = durable branch-to-URL mapping
- preview cache = ephemeral render artifact state

## Capture lifecycle recommendation

### Fetch policy

Use stale-while-revalidate semantics.

Rules:

1. If deployment ID is unchanged, reuse the cached preview.
2. If deployment ID is missing but head commit SHA is unchanged, reuse the cached preview.
3. If head commit SHA changes, mark the preview stale but keep showing the old artifact until a new
   one is captured.
4. If the latest deployment failed, keep the last successful preview and attach failure metadata
   instead of dropping to empty.
5. If the branch is deleted upstream, stop refreshing and expire later.

### Trigger policy

Do not eagerly capture every branch on dashboard load.

Instead:

1. Return rows immediately with links and any cached metadata.
2. Capture only for:
   - visible rows
   - expanded rows
   - the default branch
   - the current/active branch
   - a very small number of most recently updated branches
3. Queue background refresh when the cache is stale.

### Backoff policy

Reasonable starting windows:

- metadata refresh: every 5 to 15 minutes
- screenshot recapture after new deployment: immediate background job
- failure retry backoff: 15 minutes, then 1 hour, then 6 hours
- idle branch artifact retention: 7 to 30 days

## Capture runtime options

### Preferred first approach

Keep the orchestration in Convex and call Cloudflare Browser Rendering only when needed.

Why:

1. This repo already prefers keeping server logic in Convex by default.
2. The work remains scoped to dashboard preview capture, not a broad new edge service.
3. A dedicated Worker service is only justified if screenshot volume or rendering complexity grows
   substantially.

### Browser Rendering notes

Cloudflare Browser Rendering is a workable fit for screenshot generation, but it should be treated
as a bounded, costed feature rather than a free dashboard ornament.

Cost and control implications:

1. Capturing every branch on every dashboard load will not scale.
2. Authentication and Access-protected previews may need specialized handling.
3. Rendering should wait for stable page readiness before capture to avoid loading-state
   screenshots.

## Open product questions

1. Should branch preview links appear for all active branches or only branches that have confirmed
   Cloudflare deployments?
2. Should a missing preview deployment render as nothing or as an explicit “not deployed” state?
3. If a branch has both a default Pages alias and a custom branch domain, which one should be
   preferred in the row UI?
4. Should thumbnails be visible inline by default, or only on hover/expand?
5. Should preview capture happen for Cloudflare-managed repos only, or also for other future hosting
   surfaces?

## Recommended rollout order

1. Sync Cloudflare branch preview URLs into `vaultDomains`.
2. Expose branch preview URLs in `vault.getUserVaults()`.
3. Render direct branch links in `VaultDashboard`.
4. Optionally add lightweight metadata-only preview cards.
5. Add cached screenshots only after real usage proves the direct-link version is not enough.

## Decision summary

1. Direct branch preview links are worth shipping now.
2. The backend should sync Cloudflare deployment aliases instead of client-synthesizing URLs.
3. Thumbnails should use a separate cache model, not `vaultDomains`.
4. Cache identity should prefer immutable deployment identity over branch name.
5. Any visual branch preview should be cached and on-demand, not live and eager.
