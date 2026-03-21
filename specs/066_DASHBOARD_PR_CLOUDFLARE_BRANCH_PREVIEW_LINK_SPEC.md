# 066 Dashboard PR Cloudflare Branch Preview Link Spec

## Document Control

- Status: Proposed
- Owner: Vault dashboard + GitHub/Cloudflare integration
- Last updated: 2026-03-21
- Related specs:
  - `specs/045_VAULT_MULTI_BRANCH_DASHBOARD_AND_EDITOR_SPEC.md`
  - `specs/048_DASHBOARD_REMOTE_BRANCH_DELETE_SPEC.md`
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
- Related RFCs:
  - `rfcs/066_DASHBOARD_CLOUDFLARE_BRANCH_PREVIEW_LINKS_AND_THUMBNAILS.md`

## Summary

Show a Cloudflare branch preview link directly on each dashboard branch row when
that branch has a pull request with a Cloudflare Pages deploy comment.

This spec deliberately narrows the feature:

1. The source of truth is the Cloudflare Pages PR comment, not `vaultDomains`
   and not a generic Cloudflare deployment scan.
2. The dashboard displays the comment's `Branch Preview URL`.
3. Noter also stores the comment's immutable `Preview URL` for future
   screenshot/thumbnail work, but it is not the primary displayed link.
4. If a branch has no PR or no Cloudflare Pages comment, the dashboard shows no
   preview link for that branch.

## Product Decisions (Locked)

1. Dashboard branch preview links are PR-derived branch metadata.
2. The displayed/clicked URL is `Branch Preview URL`.
3. Noter stores both:
   - `Branch Preview URL`
   - `Preview URL`
4. `Latest commit` from the Cloudflare comment is stored as freshness metadata,
   but a mismatch does not block rendering the branch link.
5. This feature does not use `vaultDomains` as its storage surface.
6. Future thumbnail/screenshot work should use the immutable `Preview URL`, not
   the mutable `Branch Preview URL`.

## Why This Is The Right Scope

The operator requirement is branch-centric and PR-centric:

1. The expected workflow starts from a draft PR.
2. Cloudflare already posts the needed URLs into the PR.
3. The branch list already stores PR metadata in `vaultRemoteBranches`.
4. The dashboard only needs a user-facing branch link right now, not a full
   domain management system.

This makes a PR-comment-derived model smaller and less ambiguous than trying to
re-purpose `vaultDomains` for branch preview discovery.

## Current State

Today:

1. `vaultRemoteBranches` stores:
   - branch name
   - head commit SHA
   - PR URL
   - PR number
   - ahead/behind metadata
2. `VaultDashboard` already renders each branch row from that branch payload.
3. `vaultDomains` exists as an infra mapping table and currently receives the
   default branch production URL during provisioning.
4. No branch row today includes Cloudflare preview data.

## Source Comment Contract

The feature parses the Cloudflare Pages PR comment body. The current comment
format includes:

1. `Latest commit`
2. `Status`
3. `Preview URL`
4. `Branch Preview URL`
5. `View logs`

Example fields:

- `Preview URL`: immutable deployment URL for one deploy
- `Branch Preview URL`: mutable branch alias URL

The parser should treat the comment body as semi-structured provider output:

1. Match the Cloudflare Pages author/bot identity.
2. Parse the latest Cloudflare deploy comment for the PR.
3. Extract recognized fields if present.
4. Fail open when a field is missing or the comment format changes.

## Proposed Changes

### 1. Extend branch metadata with cached Cloudflare preview fields

Preferred storage surface:

- `vaultRemoteBranches`

Add optional fields such as:

- `cloudflareBranchPreviewUrl?: string`
- `cloudflarePreviewUrl?: string`
- `cloudflarePreviewCommitSha?: string`
- `cloudflarePreviewStatus?: string`
- `cloudflarePreviewLogsUrl?: string`
- `cloudflarePreviewCommentCreatedAt?: number`

Rationale:

1. This data is branch-scoped.
2. It is already adjacent to PR metadata.
3. It does not need `vaultDomains` semantics.

### 2. Add a PR-comment enrichment step

Add a dashboard-focused enrichment path that:

1. reads `vaultRemoteBranches`
2. skips branches with no `pullRequestNumber`
3. fetches PR issue comments from GitHub
4. finds the latest Cloudflare Pages comment
5. parses the relevant fields
6. patches the branch row with the cached preview data

Important scope rule:

- This enrichment should be dashboard-scoped or otherwise explicitly gated. It
  should not run on every generic editor/tree refresh path by default.

### 3. Extend `vault.getUserVaults()` branch payload

Add the cached Cloudflare preview fields to `remoteBranches[]` so the dashboard
can render them directly.

Minimal UI requirement:

- `cloudflareBranchPreviewUrl?: string`

Useful future-facing fields:

- `cloudflarePreviewUrl?: string`
- `cloudflarePreviewCommitSha?: string`
- `cloudflarePreviewStatus?: string`

### 4. Render the link in `VaultDashboard`

For each active branch row:

1. If `cloudflareBranchPreviewUrl` exists, render it in the metadata cluster.
2. If it does not exist, render nothing.
3. The displayed link should be the branch preview URL, not the immutable
   deployment URL.

## Freshness Rules

`cloudflarePreviewCommitSha` is a freshness signal, not a hard display gate.

Rules:

1. If the cached comment commit SHA matches the branch head SHA, both stored
   URLs are fully current.
2. If the commit SHA does not match:
   - still display `cloudflareBranchPreviewUrl`
   - treat `cloudflarePreviewUrl` as potentially stale for future screenshot or
     deploy-specific work
3. If the branch has a PR but no parsed Cloudflare comment yet, show no link.

This matches Cloudflare's dual-URL behavior:

1. branch alias stays useful for the branch
2. immutable preview URL is tied to one deploy/commit

## Explicit Non-Goals

1. Parsing Cloudflare deployments directly from the Pages API for this feature
2. Writing branch preview links into `vaultDomains`
3. Showing branch preview links for branches without PRs
4. Inline screenshots or thumbnails in this implementation
5. Solving custom branch domain selection in this implementation

## Data Model Guidance

`vaultDomains` remains an infra/domain mapping surface. This feature should not
depend on it.

That separation is intentional:

1. `vaultDomains` is about canonical infra/domain mappings
2. this feature is about PR-derived branch preview metadata
3. thumbnail/cache work can later build on the cached immutable preview URL
   without changing the displayed branch link source

## Validation

### Unit / integration coverage

1. Parse a Cloudflare Pages PR comment body into:
   - branch preview URL
   - immutable preview URL
   - latest commit SHA
   - status
   - logs URL
2. Verify branches without PRs are skipped.
3. Verify branches with PRs but without Cloudflare comments keep preview fields
   empty.
4. Verify `vault.getUserVaults()` returns the cached branch preview fields.

### Manual coverage

1. Branch with draft PR and Cloudflare comment shows the branch preview link.
2. Branch with draft PR and no Cloudflare comment shows no link.
3. Branch with no PR shows no link.
4. After a new push changes head SHA before Cloudflare posts a new comment, the
   branch preview link still renders while the immutable preview URL is treated
   as stale metadata.

## Recommended Implementation Order

1. Add a parser for the Cloudflare Pages PR comment body.
2. Add optional preview fields to branch metadata storage.
3. Add dashboard-scoped PR comment enrichment.
4. Extend `vault.getUserVaults()` with cached preview fields.
5. Render the branch preview link in `VaultDashboard`.
6. Add tests for parser, caching, and dashboard rendering.
