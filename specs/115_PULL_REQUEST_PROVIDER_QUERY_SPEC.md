# Pull Request Provider Query Spec

## Document Control

- Status: Accepted
- Owner: Samebase dashboard and provider boundaries
- Last updated: 2026-07-21
- Related work:
  - [PR #1243: Simplify vault provider resource truth](https://github.com/samebase/samebase/pull/1243)
  - [PR #1234: Replace dashboard branch mirrors with live pull requests](https://github.com/samebase/samebase/pull/1234)
  - [Vault route surface spec](./110_VAULT_ROUTE_SURFACE_SPEC.md)

## Current Contract

The selected-vault dashboard is a pull request surface. It is a thin authenticated client of the
GitHub API, not a normalized repository, branch, pull request, or check database.

Samebase persists only state it owns:

- vault and repository identity;
- saved pull request filter preferences;
- stable app, Worker, and Convex project attachments;
- durable workflow plans, runs, events, and locks for operations Samebase performs.

GitHub owns pull request fields and checks. Cloudflare owns Worker builds. Convex owns preview
deployments. Samebase reads those facts when a screen needs them and does not mirror them into
Convex tables.

## GitHub Page Boundary

`repositoryPullRequests.listOpenPullRequests` performs one GitHub GraphQL request for one provider
page. Its input is the vault id, GitHub's `first`, and GitHub's nullable `after` cursor. Its result
keeps GitHub's repository, pull request connection, `totalCount`, `pageInfo`, and node structure.

The action may validate the provider response and remove fields the product never reads. It must not
add repository scan budgets, synthetic continuation kinds, freshness taxonomies, observation
generations, server-side filter scans, or persisted rows.

The browser owns pagination and presentation:

- the first page loads automatically;
- later pages load only when requested;
- label and draft filters run over the pages already loaded;
- check counts are converted to display state in the browser;
- TanStack Query caches responses for 60 seconds and discards unused entries after 5 minutes;
- a failed background refresh may show the previous response as stale.

Filtering can produce no matches while GitHub still has another page. The UI must keep `Load more`
available and must not claim the repository has no matching pull requests until the provider pages
are exhausted.

## Visible Provider Resources

For pull requests currently rendered, the browser may request the attached Worker build and Convex
preview resources. This request joins live provider responses against the stable attachment graph;
it does not persist a pull request resource model.

A Worker build belongs to a row only when Cloudflare agrees on the immutable Worker tag, GitHub
repository id, app root, preview trigger, pull request URL, head SHA, branch, and deploy command.

A Convex preview belongs to that build only when:

1. the pull request head is in the vault repository;
2. the Worker build succeeded;
3. the Worker's current build configuration points to the attached Convex project for the same app;
4. one provider deployment matches the branch identifier and reference;
5. the deployment time falls inside the Worker build interval.

Failure to prove a relationship yields absent or unavailable presentation state. Names alone never
create resource ownership.

## Exact Branch Trees

The editor still needs a repository tree for one exact branch. That cache remains in
`observations_vaultRepository_branchTrees`, keyed by `(vaultId, branch)`. It is not a branch catalog
and is never used to generate the pull request list.

The durable `vault.defaultBranch` resolves omitted branch arguments. Opening a pull request or file
route hydrates only its exact branch and reads the immutable tree SHA named by the observed commit.

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

## Validation

Tests must prove:

- one action call maps to one GitHub page request and forwards the provider cursor;
- filters are absent from the server request and run over loaded browser pages;
- another provider page remains loadable after a filtered-empty loaded page;
- a background failure retains stale browser data without calling it current;
- same-repository and fork heads stay distinct;
- resource links require exact cross-provider identity;
- an exact branch tree uses the immutable tree SHA returned for that branch commit;
- no deleted table or action remains in generated Convex bindings, cleanup registries, or tests.

## Non-Goals

- Persisting provider API responses
- Webhook materialization
- Repository-wide branch discovery
- Server-side pull request search syntax
- A reusable domain-generic cache in this change
