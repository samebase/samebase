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
  - [Cloudflare GitHub integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/)
  - [GitHub GraphQL check reference](https://docs.github.com/en/graphql/reference/checks)
  - [GitHub check retention and suite model](https://docs.github.com/en/rest/guides/using-the-rest-api-to-interact-with-checks)
  - [GitHub GraphQL pull request reference](https://docs.github.com/en/graphql/reference/pulls)
  - [GitHub GraphQL pagination](https://docs.github.com/en/graphql/guides/using-pagination-in-the-graphql-api)
  - [GitHub GraphQL query limits](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api)

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

The request joins live GitHub pull request data, the selected Cloudflare Worker proof source,
hosting comments, and Convex responses against the direct Worker and Convex project attachments. It
does not persist a pull request resource model. The browser caches one resource request for each
loaded GitHub page under the common vault-provider observation namespace, keyed by the exact
attachment coordinates and pull request node ids. Loading another page does not re-read resource
data for earlier pages.

The stable GitHub repository id proves repository identity. A repository coordinate rename does not
invalidate that identity. If one requested pull request closes, merges, or disappears between the
page read and the resource read, only that resource row becomes unavailable; the rest of the batch
still resolves. It has no provider rows, Cloudflare build status error, or per-Worker `Unavailable`
state.

One source-control constant selects Cloudflare Worker proof from `checks` or `comments`. Its shipped
value is `checks`. Changing it requires a Samebase deployment. Both source modules return the same
Worker build and branch-preview result. The resource assembly code reads only the selected result.
It does not fall back, merge, compare, or reconcile the two sources. Samebase does not read the
Cloudflare Worker API or Cloudflare Builds API for these facts. The browser uses the stored Worker
root to place an attached Worker in the repository tree. Live Cloudflare observations do not move
the pull request row automatically.

With `checks` selected, the pull request Worker status and links are a direct view of Cloudflare
check runs on commits that GitHub reports as part of the current pull request.

The initial batched pull request query reads the newest 100 current pull request commits. With
`checks` selected, Samebase follows older commit pages until it has the complete current commit
connection. Each page must keep the same open pull request id, repository id, base commit, head
commit, total count, and advancing cursor. Commit node ids and commit object ids cannot repeat.
Before Samebase accepts check runs, the batched check query verifies the open pull request,
repository, base commit, and head commit again. Any disagreement fails that pull request result
closed. This validation prevents a force-push or base change from mixing commit generations in one
result.

For each current commit, Samebase reads the one check suite from the exact Cloudflare GitHub App,
database id `85455` and slug `cloudflare-workers-and-pages`. The check-run connection uses GitHub's
`LATEST` filter and follows every page. This filter selects the latest check attempt and removes the
duplicate in-progress and completed records that Cloudflare can create for one build. Check-suite
and check-run counts, node identities, app identity, and cursors must remain complete and stable.

A Worker check name and title must both be `Workers Builds: <worker-name>`. The check summary must
contain matching `Build ID` and `Script` links. The details link must be an exact HTTPS Cloudflare
dashboard path for the same account, Worker, and build UUID. The check external id, summary build
UUID, and details-link build UUID must be equal. If present, the version, commit preview, and
preview alias must be internally consistent strict HTTPS `workers.dev` origins for that Worker. A
successful build can be valid without a preview because Cloudflare does not create preview URLs for
every Worker configuration.

Workers resolve independently by exact Cloudflare account and Worker name. Samebase examines current
pull request commits from newest to oldest. The newest matching Worker check is the visible result.
A newer failed, cancelled, skipped, or running check replaces an older successful check. A newer
commit with no check does not remove an older valid result because Cloudflare watch paths can skip a
Worker build. A check from a commit that is no longer in the current pull request cannot count.
Multiple Workers connected to one repository can therefore resolve from different commits.

With `comments` selected, Samebase uses the existing Cloudflare Worker comment parser without a
current-commit membership check. It validates the `Latest Commit` cell as a 7-to-64 character
hexadecimal commit prefix, but does not compare that value with the current pull request commits. It
keeps the comment's stable `Branch Preview URL`, build UUID, build state, logs URL, account, and
Worker name. Equal rows are deduplicated and conflicting rows fail closed. This mode preserves the
existing comment behavior. It does not add force-push filtering to comments.

The legacy comment read treats Cloudflare Worker and Pages comment parsing as one Cloudflare
boundary. In `comments` mode, any Cloudflare comment parse failure also makes Worker proof
unavailable. Check proof stays independent from Cloudflare comment parsing in `checks` mode.

The batched pull request query also reads comment node ids and author types for Cloudflare and
Netlify comments. It follows all metadata pages under the existing GitHub request deadline, selects
only the exact Cloudflare and Netlify Bot node ids, and then reads bodies only for those selected
comment ids. Every returned body must still belong to the same open pull request, repository, and
Bot identity. With `checks` selected, Samebase ignores Cloudflare Workers comments for Worker proof
and parsing diagnostics. With `comments` selected, the Worker comment module owns that proof and its
existing strict format diagnostics.

Cloudflare Pages reads the exact Pages deployment heading, dashboard log target, and
`Branch Preview URL` table row. Its URL must be a strict HTTPS `pages.dev` origin for that project.
Equal normalized URLs are one result. Distinct valid URLs for one provider resource are ambiguous
and fail closed. Samebase does not guess Cloudflare alias normalization from a branch name.

If the selected proof source has no matching Cloudflare Worker result, that attached Worker shows
`Unavailable`. If the selected proof read is incomplete, unsafe, or conflicting, the pull request
shows one message: `Could not load Cloudflare build status`. It does not show per-Worker
`Unavailable` rows for that failure. A Cloudflare Worker build failure does not hide valid Convex or
Netlify resources.

Netlify recovery reads an exact `Name` and `Link` table. The `Latest deploy log` row must identify
one Netlify site. The `Deploy Preview` row must contain one strict HTTPS link for the requested pull
request number. The standard Netlify hostname must also identify that site. A custom automatic
deploy domain is accepted only when its first hostname label is the exact
`deploy-preview-<pull-request-number>` label. Processing or failed comments without a deploy preview
are valid and produce no link. Malformed identity or URL output fails the Netlify provider result
closed.

Known comments without a ready preview do not produce a parse-failure signal. A trusted Cloudflare
Pages or Netlify comment with format drift, invalid output, or conflicting resource URLs emits a
compact `pull_request_hosting_comment_parse` marker to the Convex log stream. The marker contains
only a version, failed outcome, closed provider format, and closed failure kind. It never contains
the comment body, URL, repository, resource name, or provider account identity. PostHog Logs can
count these failed parse observations without persisting provider state in the Samebase database.
One action read emits at most one marker for each provider-format and failure-kind pair.

An attached Cloudflare Worker consumes its exact account-and-name match from the selected proof
source for build status and links. The UI uses the stored `rootDirectory` and `workerName` from
spec 115. Other parsed Cloudflare Workers, Cloudflare Pages projects, and Netlify sites have no
approved repository root. The UI lists them in an `Other previews` group and never invents a root.
An unattached Worker row links to the repository Settings page with a `Connect` action. Cloudflare
Pages and Netlify rows have no setup action because Samebase does not support attaching those
resources. Each row exposes the provider resource name and its branch or deploy preview link. The
comment text and provider result are not saved in the Samebase database.

For up to 100 pull requests, the first GitHub request batches pull request identity, the newest 100
current commits, and comment metadata. With `checks` selected, the normal six-pull-request page adds
one check query for each 100 distinct current commit nodes. Each pull request with more than 100
current commits adds one commit pagination query for each older 100-commit page. A check suite with
more than 100 latest runs adds one query for each later run page. Therefore check request count
grows by commit pages, not by one request for each commit. A live two-commit check batch cost one
GraphQL point. A nested probe with 100 commits cost two points. GitHub computes point cost from the
actual query, so these measurements are evidence, not a fixed billing contract.

When requested pull requests share one commit, Samebase reads that commit and its later check-run
pages once. Each later page request batches the current pull request ids that share the commit, so
Samebase can revalidate their base and head commits without reading the same check page again.

With `comments` selected, Samebase does not paginate the commit connection and does not request
check suites or check runs. It uses the Cloudflare comment bodies that the hosting-comment read
already needs.

Comment discovery adds no body request when there are no recognized bot comments. If recognized bot
comments exist, Samebase adds one batched body query for each provider that has selected comments,
with another query for each additional 100 selected comments. A pull request with more than 100
total comments adds metadata pagination queries until the scan is complete. Commit and comment
pagination run for at most six pull requests at one time. Check body queries batch up to 100
distinct commits.

Worker identity, build state, build navigation, and branch preview use only the selected proof
source. Samebase keeps no recovery state and does not reconcile comments with check runs. In
`checks` mode, GitHub archives check data after 400 days and deletes it 10 days later. An open pull
request older than that retention window needs a new Worker build before Samebase can show Worker
proof.

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
- the source-control constant selects exactly one Worker proof implementation, with no fallback,
  merge, or reconciliation;
- both Worker proof modules return the same resource shape and attached Worker resource state uses
  an exact Cloudflare account-and-name match;
- comment mode preserves the existing stable alias, validates `Latest Commit` syntax without a
  current-commit membership check, and preserves existing conflict and format-drift failures;
- all commits in the current pull request can provide Worker proof, while a later commit without a
  path-watched Worker check does not revoke an earlier current-commit result;
- a newer check result for one Worker replaces its older result, including failure after success and
  success after failure;
- a commit removed by force-push cannot provide Worker proof, and a base or head change during any
  commit or check page fails that pull request result closed;
- commit and check-run pagination rejects changed counts, repeated nodes, and cursors that do not
  advance;
- GitHub's latest-attempt check filter prevents duplicate Cloudflare lifecycle records from creating
  local recovery state;
- multiple attached Workers with different watch paths resolve independently across current commits;
- one attached-project Convex branch deployment with a provider-normalized reference remains
  reachable independently of Worker state and is visibly branch-scoped;
- a matching Cloudflare check exposes its exact provider logs link, visible status, and optional
  preview alias;
- a complete check set with no matching Worker result shows only that Worker as unavailable;
- an unreadable or unsafe Cloudflare check set shows one pull request Cloudflare build status error;
- comment metadata selects only the exact Cloudflare and Netlify Bots before any body is read;
- attached Workers stay grouped by their stored roots independently of Builds observations and check
  build states;
- attached Workers consume exact account-and-name matches while other hosting previews remain
  rootless;
- the `Other previews` group offers setup only for unattached Cloudflare Workers;
- live Cloudflare Worker checks and Cloudflare Pages and Netlify comments produce strict preview
  links;
- provider failures are isolated, while comment pagination, body identity, malformed URLs, unsafe
  Cloudflare check output, and distinct URL ambiguity fail closed;
- an exact branch tree uses the immutable tree SHA returned for that branch commit;
- no deleted table or action remains in generated Convex bindings, cleanup registries, or tests.

## Non-Goals

- Persisting provider API responses
- Webhook materialization
- Repository-wide branch discovery
- Server-side pull request search syntax
- A reusable domain-generic cache in this change
