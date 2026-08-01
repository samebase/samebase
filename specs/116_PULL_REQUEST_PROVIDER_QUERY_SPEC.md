# Pull Request Provider Query Spec

## Document Control

- Status: Accepted
- Owner: Samebase dashboard and provider boundaries
- Last updated: 2026-07-31
- Related work:
  - [PR #1243: Simplify vault provider resource truth](https://github.com/samebase/samebase/pull/1243)
  - [PR #1234: Replace dashboard branch mirrors with live pull requests](https://github.com/samebase/samebase/pull/1234)
  - [Vault route surface spec](./110_VAULT_ROUTE_SURFACE_SPEC.md)

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

For pull requests in the loaded provider pages, the browser may request the attached Worker build
and Convex preview resources. The browser sends only opaque GitHub pull request node ids. The server
re-reads those open pull requests from GitHub, verifies their repository identity against the vault,
and derives fork, head repository, branch, and commit identity from that response. Client data never
proves resource ownership.

The request joins live GitHub, Cloudflare, and Convex responses against the direct Worker and Convex
project attachments. It does not persist a pull request resource model. The browser caches one
resource request for each loaded GitHub page under the common vault-provider observation namespace,
keyed by the exact attachment coordinates and pull request node ids. Loading another page does not
re-read resource data for earlier pages.

The stable GitHub repository id proves repository identity. A repository coordinate rename does not
invalidate that identity. If one requested pull request closes, merges, or disappears between the
page read and the resource read, only that row becomes unavailable; the rest of the resource batch
still resolves.

A Worker build belongs to a row only when Cloudflare agrees on the immutable Worker tag, build UUID,
GitHub repository id, live normalized Builds root, preview trigger, pull request URL, head SHA,
branch, and the deploy command reported by both the trigger and build metadata. Samebase does not
compare that provider-owned command with a locally generated template. If Samebase cannot observe
the Worker and its Builds repository, the row exposes only stable Worker identity and does not
invent a root. An available build exposes its state and a direct Cloudflare dashboard link to the
exact build's logs. That URL is derived from the verified account, Worker, and build identities in
the same live resource result.

The resource read asks GitHub for check suites filtered to Cloudflare's stable GitHub App id on the
pull request head commit. A Cloudflare branch preview belongs to a build only when one filtered
check run has an `externalId` equal to the verified Cloudflare build UUID and names the same Worker.
The row links the `Preview Alias URL` published by that exact check because it remains stable as new
commits build on the branch. The version-specific `Preview URL` is not the row's navigation target.
Missing, incomplete, malformed, or contradictory exact-check output fails closed.

GitHub can omit that check from a later pull request head when the commit does not build an attached
Worker. The same resource request can recover stable preview links from hosting-provider pull
request comments without storing provider state. The batched pull request query always reads only
comment node ids and author types. It follows all metadata pages under the existing GitHub request
deadline, selects only the exact Cloudflare and Netlify Bot node ids, and then reads bodies only for
those selected comment ids. Every returned body must still belong to the same open pull request,
repository, and Bot identity. A failed or changing metadata scan makes comment recovery unavailable
only for that pull request. Provider body reads and parsers fail independently, so malformed
Cloudflare output does not hide valid Netlify output, and malformed Netlify output does not hide
valid Cloudflare output.

Cloudflare Workers recovery reads only Markdown table rows with exact `Status`, `Name`, and
`Latest Commit` columns. A `Preview URL` column can also be present. An exact `View logs` link
identifies the Cloudflare account, Worker, and build. The exact abbreviated commit must match the
current pull request head before Samebase exposes that link. This lets a row link to the build while
Cloudflare is still building and before a branch preview exists. An exact `Branch Preview URL`
anchor supplies a strict HTTPS `workers.dev` origin for that Worker. Cloudflare Pages recovery reads
the exact Pages deployment heading, dashboard log target, and `Branch Preview URL` table row. Its
URL must be a strict HTTPS `pages.dev` origin for that project. A malformed identity, log link, or
preview link fails the Cloudflare provider result closed. Equal normalized URLs are one result.
Distinct valid URLs for one provider resource are ambiguous and fail closed. Samebase does not guess
Cloudflare alias normalization from a branch name.

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

An attached Cloudflare Worker consumes its matching comment preview through the rooted Worker row.
The match uses the exact Cloudflare account and Worker name. The Worker row keeps that link when its
Cloudflare API observation is unavailable, without claiming a repository root. Other parsed
Cloudflare Workers, Cloudflare Pages projects, and Netlify sites have no verified repository root.
The UI lists them in an `Other previews` group and never invents a root. An unattached Worker row
links to the repository Settings page with a `Connect` action. Cloudflare Pages and Netlify rows
have no setup action because Samebase does not support attaching those resources. Each row exposes
the provider resource name and its branch or deploy preview link. The comment text and provider
result are not saved in the Samebase database.

For up to 100 pull requests, the normal GitHub cost is one repository REST request plus one batched
head and comment-metadata query. Comment discovery adds no request when there are no recognized bot
comments. If recognized bot comments exist, Samebase adds one batched body query for each provider
that has selected comments, with another query for each additional 100 selected comments. A pull
request with more than 100 total comments adds metadata pagination requests until the scan is
complete. Metadata pagination runs for at most six pull requests at one time.

Worker identity, current build, build navigation, and branch preview are independent results. A
verified Worker and Builds repository can expose an absent or unavailable current build together
with a recovered build link or branch preview. A comment build link is navigation only. It does not
claim a build status or replace the stronger Worker Builds API observation. The recovered preview
URL is branch navigation only. It does not claim that the latest pull request commit was built. An
exact Worker Builds API result has priority over comment recovery.

A Convex branch deployment belongs to a row only when the pull request head is in the vault
repository, the project is directly attached to the vault, the current Convex credential can read
that exact project, and exactly one provider deployment matches the branch identifier and reference.
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
- exact Worker resource state requires exact cross-provider identity;
- one attached-project Convex branch deployment remains reachable independently of Worker state and
  is visibly branch-scoped;
- an exact Cloudflare build exposes its provider logs link;
- an exact Cloudflare build check exposes its stable branch preview instead of its version preview;
- a recovered Cloudflare branch preview can remain visible without claiming a current build;
- comment metadata selects only the exact Cloudflare and Netlify Bots before any body is read;
- attached Workers consume exact account-and-name matches while other hosting previews remain
  rootless;
- the `Other previews` group offers setup only for unattached Cloudflare Workers;
- live Cloudflare Workers, Cloudflare Pages, and Netlify comment formats produce strict preview
  links;
- provider failures are isolated, while comment pagination, body identity, malformed URLs, and
  distinct URL ambiguity fail closed;
- an exact branch tree uses the immutable tree SHA returned for that branch commit;
- no deleted table or action remains in generated Convex bindings, cleanup registries, or tests.

## Non-Goals

- Persisting provider API responses
- Webhook materialization
- Repository-wide branch discovery
- Server-side pull request search syntax
- A reusable domain-generic cache in this change
