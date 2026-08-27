# Pull Request Provider Query Spec

## Document Control

- Status: Accepted
- Owner: Samebase dashboard and provider boundaries
- Last updated: 2026-08-27
- Related work:
  - [PR #1243: Simplify vault provider resource truth](https://github.com/samebase/samebase/pull/1243)
  - [PR #1234: Replace dashboard branch mirrors with live pull requests](https://github.com/samebase/samebase/pull/1234)
  - [Vault route surface spec](./110_VAULT_ROUTE_SURFACE_SPEC.md)
  - [Vault resource attachment model](./115_VAULT_RESOURCE_ATTACHMENT_MODEL_SPEC.md)

## Current Contract

The selected-vault dashboard has two independent primary features: a durable default-branch surface
rooted in `vault.defaultBranch`, and a live open pull request list read from GitHub. The dashboard
is a thin authenticated client for provider facts, not a normalized repository, branch, pull
request, check, Worker, or deployment database.

Samebase persists only state it owns:

- vault and repository identity, including the durable default branch;
- stable Worker and Convex project attachments;
- durable workflow plans, runs, events, and locks for operations Samebase performs.

GitHub owns pull request fields and checks. Cloudflare owns Workers and builds. Convex owns
production and preview deployments. Samebase reads those facts when a screen needs them and does not
mirror them into Convex tables.

The dormant `ui_vaultPullRequests_filters` row and its APIs remain available for a possible future
filter design. The current vault overview does not read or apply those saved preferences.

## GitHub Page Boundary

`repositoryPullRequests.listOpenPullRequests` performs one GitHub GraphQL request for one provider
page. Its input is the vault id, GitHub's `first`, and GitHub's nullable `after` cursor. Its result
keeps GitHub's repository, pull request connection, `totalCount`, `pageInfo`, and node structure.

The action may validate the provider response and remove fields the product never reads. It must not
add repository scan budgets, synthetic continuation kinds, freshness taxonomies, observation
generations, server-side filter scans, or persisted rows.

The browser owns pagination and presentation:

- the first page loads the six most recently updated open pull requests;
- the section label shows the provider `totalCount`, including pull requests not loaded yet;
- later six-item pages load automatically when the scroll sentinel enters view;
- one TanStack infinite query owns all loaded pages and refreshes them together;
- every loaded open pull request is shown, including drafts;
- no saved label or draft filter is applied;
- check counts are converted to display state in the browser;
- TanStack Query caches responses for 60 seconds and discards unused entries after 5 minutes;
- loading a later page does not renew the first page's observation time;
- a failed background refresh may show the previous response as stale.

Stale pull requests and deploy resources do not expose separate retry controls. Reloading the
document recreates their provider requests.

The default-branch surface is not part of this pull request resource query. It is a separate,
always-visible dashboard feature sourced from `vault.defaultBranch`; its production resource group
joins the stable Worker and Convex attachments to the vault-level live provider observations. No
default branch, production Worker, or production Convex deployment is fabricated as a pull request
or copied into pull request state. Its attached Convex projects retain Samebase Data links and
access-gated Schema links for the production deployment.

## Visible Provider Resources

For pull requests in the loaded provider pages, the browser may request attached Worker build and
Convex preview resources. The browser sends only opaque GitHub pull request node ids. The server
re-reads those open pull requests from GitHub, verifies their repository identity against the vault,
and derives fork, head repository, and branch identity from that response. Client data never proves
resource ownership.

The request joins live GitHub data and Convex responses against the direct Worker and Convex project
attachments. It does not persist a pull request resource model. The browser caches one resource
request for each loaded GitHub page under the common vault-provider observation namespace, keyed by
the exact attachment coordinates and pull request node ids. Loading another page does not re-read
resource data for earlier pages.

The stable GitHub repository id proves repository identity. A repository coordinate rename does not
invalidate that identity. If one requested pull request closes, merges, or disappears between the
page read and the resource read, only that resource row becomes unavailable; the rest of the batch
still resolves. It has no provider rows, Cloudflare build status error, or per-Worker `Unavailable`
state.

One source-control constant selects Cloudflare Worker proof from GitHub checks or pull request
comments. Its shipped value is `checks`. Changing the value requires a Samebase deployment. The two
sources use separate modules and return the same Worker proof shape. Samebase reads only the
selected source. It does not merge the sources or fall back from one source to the other.

With checks selected, Samebase reads Cloudflare Worker checks from every commit that is still part
of the current pull request. It accepts only the exact Cloudflare GitHub App. Workers resolve
independently by exact Cloudflare account and Worker name. The newest matching check for each Worker
is the visible result. A later commit with no matching check does not revoke an earlier result from
the current pull request because Cloudflare path filters can skip that Worker. A check from a commit
removed by a force-push cannot count.

Before Samebase accepts the result, it verifies that the pull request is still open and that its
repository, base commit, and head commit are unchanged. A failed read or changed identity fails the
Worker proof closed.

The check name, build link, external build id, Cloudflare account, Worker name, and build UUID must
agree. Samebase keeps the exact provider logs link. A preview alias is optional. When present, it
must be a strict HTTPS `workers.dev` origin for the same Worker and preview zone.

With comments selected, Samebase keeps the existing Cloudflare Worker comment behavior. It does not
add current-commit membership checks to comments. Samebase validates the abbreviated commit syntax,
but it keeps the stable branch alias and deployment history that the comment presents.

The browser uses the stored Worker root to place an attached Worker in the repository tree. Live
Cloudflare observations do not move the pull request row automatically. Samebase does not read the
Cloudflare Worker API or Cloudflare Builds API for pull request Worker proof.

The batched pull request query reads only comment node ids and author types. It follows all metadata
pages under the existing GitHub request deadline, selects only the exact Cloudflare and Netlify Bot
node ids, and then reads bodies only for those selected comment ids. Every returned body must still
belong to the same open pull request, repository, and Bot identity.

Cloudflare Workers comments use Markdown table rows with exact `Status`, `Name`, and `Latest Commit`
columns. A `Preview URL` column can also be present. One exact `View logs` link in the status cell
must identify the Cloudflare account, Worker, and build UUID. Samebase preserves that exact URL for
the visible logs link. The status cell maps successful deployment to Built, failed build to Failed,
and building to Building. An unknown safe status remains Unknown. Samebase validates the comment row
shape but does not compare its abbreviated commit with the current pull request head.

An attached Worker uses proof only when the Cloudflare account and Worker name exactly match its
attachment. Cloudflare Pages reads the exact Pages deployment heading, dashboard log target, and
`Branch Preview URL` table row. Its URL must be a strict HTTPS `pages.dev` origin for that project.
Equal normalized URLs are one result. Distinct valid URLs for one provider resource are ambiguous
and fail closed. Samebase does not guess Cloudflare alias normalization from a branch name.

If the selected proof source is available but has no matching Worker, that attached Worker shows
`Unavailable`. If the selected proof read fails or contains conflicting identity, the pull request
shows one message: `Could not load Cloudflare build status`. It does not show per-Worker
`Unavailable` rows for that failure. A Worker proof failure does not hide valid Cloudflare Pages,
Convex, or Netlify resources.

Netlify recovery reads an exact `Name` and `Link` table. The `Latest deploy log` row must identify
one Netlify site. The `Deploy Preview` row must contain one strict HTTPS link for the requested pull
request number. The standard Netlify hostname must also identify that site. A custom automatic
deploy domain is accepted only when its first hostname label is the exact
`deploy-preview-<pull-request-number>` label. Processing or failed comments without a deploy preview
are valid and produce no link. Malformed identity or URL output fails the Netlify provider result
closed.

Known comments without a ready preview do not produce a parse-failure signal. A trusted bot comment
with format drift, invalid output, or conflicting resource URLs emits a compact
`pull_request_hosting_comment_parse` marker to the Convex log stream. The marker contains only a
version, failed outcome, closed provider format, and closed failure kind. It never contains the
comment body, URL, repository, resource name, or provider account identity. PostHog Logs can count
these failed parse observations without persisting provider state in the Samebase database. One
action read emits at most one marker for each provider-format and failure-kind pair.

An attached Cloudflare Worker consumes its matching proof for build status and links. The UI uses
the stored `rootDirectory` and `workerName` from spec 115. Other parsed Cloudflare Workers,
Cloudflare Pages projects, and Netlify sites have no approved repository root. The UI lists them in
an `Other previews` group and never invents a root. An unattached Worker row links to the repository
Settings page with a `Connect` action. Cloudflare Pages and Netlify rows have no setup action
because Samebase does not support attaching those resources. Each row exposes the provider resource
name and its branch or deploy preview link. The comment text and provider result are not saved in
the Samebase database.

Comment discovery adds no request when there are no recognized bot comments. If recognized bot
comments exist, Samebase adds one batched body query for each provider that has selected comments,
with another query for each additional 100 selected comments. A pull request with more than 100
total comments adds metadata pagination queries until the scan is complete. Metadata pagination runs
for at most six pull requests at one time.

A Convex branch deployment belongs to a row only when the pull request head is in the vault
repository, the project is directly attached to the vault, the current Convex credential can read
that exact project, and exactly one preview deployment has a `previewIdentifier` equal to the GitHub
head branch. The provider-owned deployment reference is not reconstructed from the GitHub branch.
This discovery is independent of Worker build state. The direct attachment proves that the project
belongs to the vault, while the branch match selects a useful recovery destination. It does not
prove that the deployment came from the current head or is current. The UI labels this state as
potentially belonging to an earlier commit.

The branch deployment exposes the provider dashboard and its Data page. Pull request resources do
not expose Samebase Schema because the current Schema refresh flow reads the production deployment.
Production Convex resources retain their access-gated Schema link.

## Exact Branch Trees

The editor still needs a repository tree for one exact branch. That cache remains in
`observations_vaultRepository_branchTrees`, keyed by `(vaultId, branch)`. It is not a branch catalog
and is never used to generate the pull request list.

The durable `vault.defaultBranch` resolves omitted branch arguments. Opening a pull request or file
route hydrates only its exact branch and reads the immutable tree SHA named by the observed commit.
Every stored row requires its commit SHA, stores the tree SHA only as `treeData.sha`, and rejects a
truncated recursive tree.

GitHub connection and exact-tree readiness are separate axes. A connected vault may list live pull
requests while initial tree hydration is still running or failed. Editor and file affordances remain
gated on connected repository identity and hydrate the exact branch tree they need. Source setup
status remains visible, but it does not revoke an already established GitHub connection.

## Deleted Model

The application has no runtime or schema contract for:

- a repository refresh queue;
- a persisted remote branch catalog;
- persisted pull request rows;
- persisted commit check rows or summaries;
- repository-wide metadata scans;
- `vaultDomains` as a provider URL mirror.

Internal backwards compatibility for those tables or response shapes is an error. Existing rows may
be deleted when deploying the schema.

### Production Cutover

Immediately before the first production deploy of this schema:

- remove `lastTreeRefreshAt` from existing `vaults` documents;
- clear `observations_vaultRepository_branchTrees` so exact branch trees rehydrate without the
  removed top-level `treeSHA` field;
- clear or delete `ui_vaultBranches_filters`, `observations_vaultRepository_branches`,
  `vaultDomains`, `derived_githubCommit_checkSummaries`, `observations_githubCommit_checks`, and
  `vaultRepositoryRefreshRequests`.

This is a destructive one-user cutover, not an application compatibility contract. Old production
code can recreate the removed shapes, so cleanup happens immediately before the schema deploy. Do
not retain optional validators, readers, writers, or migration code after the cutover.

## Validation

Tests must prove:

- one action call maps to one GitHub page request and forwards the provider cursor;
- the first provider page requests six pull requests;
- filter state is absent from the server request;
- drafts and labeled pull requests from loaded provider pages remain visible;
- a background failure retains stale browser data without calling it current;
- refreshing a multi-page query retains all previous pages if any provider request fails;
- same-repository and fork heads stay distinct;
- resource enrichment derives head identity from a server-side GitHub read, never browser fields;
- a pull request that leaves the open set during resource enrichment does not fail sibling rows;
- the source constant selects one Worker proof module without merge or fallback;
- Worker checks from any current pull request commit can count, but checks from removed commits do
  not count;
- a later commit without a Worker check keeps the newest matching check from an earlier current
  commit;
- multiple Workers resolve independently by exact Cloudflare account and Worker name;
- a changed pull request base or head fails Worker check proof closed;
- the comment source keeps its existing stable alias and does not add commit membership logic;
- one attached-project Convex branch deployment with a provider-normalized reference remains
  reachable independently of Worker state and is visibly branch-scoped;
- matching Worker proof exposes its exact provider logs link, visible status, and optional preview;
- available Worker proof with no matching Worker shows only that Worker as unavailable;
- unreadable or unsafe Worker proof shows one pull request Cloudflare build status error;
- comment metadata selects only the exact Cloudflare and Netlify Bots before any body is read;
- attached Workers stay grouped by their stored roots independently of Builds observations and
  comment build states;
- attached Workers consume exact account-and-name matches while other hosting previews remain
  rootless;
- the `Other previews` group offers setup only for unattached Cloudflare Workers;
- live Cloudflare Worker checks and Cloudflare Pages and Netlify comments produce strict preview
  links;
- provider failures are isolated, while comment pagination, body identity, malformed URLs, unsafe
  Worker proof, and distinct URL ambiguity fail closed;
- an exact branch tree uses the immutable tree SHA returned for that branch commit;
- no deleted table or action remains in generated Convex bindings, cleanup registries, or tests.

## Non-Goals

- Persisting provider API responses
- Webhook materialization
- Repository-wide branch discovery
- Server-side pull request search syntax
- A reusable domain-generic cache in this change
