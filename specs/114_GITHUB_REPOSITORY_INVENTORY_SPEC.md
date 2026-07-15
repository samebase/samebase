# 114 GitHub Repository Inventory Spec

## Document Control

- Status: Accepted
- Owner: Samebase vault dashboard repository freshness
- Last updated: 2026-07-15
- Supersedes: `archive/099_REPOSITORY_REFRESH_QUEUE_SPEC.md`
- Related docs:
  - `specs/045_VAULT_MULTI_BRANCH_DASHBOARD_AND_EDITOR_SPEC.md`
  - `specs/065_GITHUB_REPOSITORY_PICKER_DISCOVERY_SPEC.md`

## Current Contract

The active selected vault route stays as fresh as practical while showing a complete, internally
consistent view of its GitHub repository. A refresh must inventory every branch and every open pull
request, including drafts and pull requests from forks. Each row includes its latest head commit,
checks and commit statuses. Pull requests include every label. The dashboard must not hide
repository data merely because a branch also has a pull request.

The inventory collector uses GitHub GraphQL with the vault's existing GitHub connection credential.
GraphQL pagination continues until every requested branch, open pull request, check context, status
context, and label has been read. GitHub's stable repository identity is authoritative if a
repository is renamed or transferred. The canonical repository name returned by GitHub is used for
GitHub links.

Opening a selected vault route while the page is visible requests an inventory immediately. The
selected dashboard and FileView are mutually exclusive route owners of the same demand hook. While
that route remains mounted and visible, the client requests another inventory every 60 seconds. The
backend coalesces overlapping demand and applies GitHub's account-wide rate limits, pacing, and
cooldowns. Rate coordination is keyed by the stable GitHub account id, so token rotation does not
split a budget, switching accounts does not inherit another account's cooldown, and two Samebase
connections for the same GitHub user cannot crawl concurrently. Only the selected vault polls. A
hidden page does not poll, and becoming visible again requests an inventory immediately.

Completed inventory generations are immutable. The backend stages a new generation and publishes it
atomically only after the complete GraphQL crawl succeeds. The previously published generation
remains visible while a crawl runs, waits for rate capacity, or fails. If a crawl proves the
repository has not changed, the backend records the completed check without replacing the active
generation.

The dashboard derives its update state from the inventory lifecycle. It may show that an update is
running, waiting for GitHub capacity, or failed while retaining the last complete data. It must not
claim that data was updated before a complete generation has been published or an unchanged crawl
has completed.

Repository inventory freshness has one path. It does not use a manual refresh action, browser focus
fan-out, an all-vault dashboard fan-out, the legacy REST refresh queue, or branch-by-branch REST
discovery. Repository file trees remain a separate, branch-scoped operation because opening and
editing files requires different data and timing. FileView reads branch and pull request identity
and the selected branch head check summary from the published inventory. It does not run a separate
REST checks and statuses monitor. Its load, focus, and visibility refresh can fetch only the exact
selected branch tree. Compare preview and deleted-file restore use published inventory identity
before making their actual compare and file reads. Repository writes request a new inventory and
refresh only the affected branch trees.

The runtime cutover deletes every old reader and writer. Production rollout still requires two
schema deploys because Convex validates stored documents before accepting a narrower schema. Deploy
one temporarily retains exact validators for retired rows and provides five ordered, resumable
cleanup migrations. Canceling the retired Workpool starts a persisted 15-minute grace, covering
already-running work even if an old deletion removed its request row. After the grace, component
status, and an independent query prove the retired system empty, cleanup removes its temporary grace
marker and deploy two removes the validators, migrations, and migration component. That temporary
schema surface is migration machinery, not runtime compatibility.

GitHub connection behavior does not change. Existing API-key and OAuth connections continue to be
used, and connecting a public repository does not require a GitHub App installation or repository
administration solely for inventory polling.

## Non-Goals

- Preserve the old repository refresh queue, its request history, or its trigger vocabulary.
- Refresh every connected vault when the user is viewing one selected vault.
- Use inventory polling to load file contents or full branch trees.
- Add a webhook, GitHub App installation, or new GitHub authorization flow.
- Keep a manual reload control as a fallback for an unreliable automatic path.

## Validation

- A branch-heavy repository publishes all branches, all open pull requests, checks, statuses, and
  labels without partial dashboard data.
- Public inventory reads return at most ten rows and reconstruct at most 5,000 labels per pull
  request. A larger label set fails the crawl and preserves the prior complete generation instead of
  publishing truncated data.
- A newly opened, closed, or updated pull request appears after the next successful inventory crawl
  without a page reload or manual action.
- A direct FileView load requests an inventory immediately, keeps the 60-second visible cadence,
  renders published head checks, and performs no second REST checks poll. When the published branch
  head differs from the loaded tree commit, FileView refreshes that exact branch tree.
- Navigating between selected dashboard and FileView leaves exactly one active demand loop.
- A failed or rate-delayed crawl leaves the previous complete generation visible and reports the
  current lifecycle accurately.
- Concurrent demand produces one active crawl plus, when needed, one trailing crawl.
- Publication becomes visible in one atomic change; readers never combine rows from different
  generations.
- An unchanged crawl advances the last-checked time without rewriting the published generation.
- Fork pull requests link to their GitHub source and do not expose a Samebase file route for a head
  repository the vault does not own.
- API-key and OAuth-backed vaults use the same inventory contract.
- A GitHub account switch receives a new rate budget, while token rotation for the same account
  keeps the existing budget.
- The legacy cleanup migrations report completion and an independent query reports every retired
  table empty before the narrow schema deploy.
- The narrow schema deploy cannot begin until the persisted retired-Workpool grace has completed and
  its temporary marker has been finalized.
