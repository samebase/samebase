# 114 Repository Observation Spec

## Document control

- Status: Accepted
- Owner: Samebase vault dashboard repository observation
- Last updated: 2026-07-17
- Supersedes the dashboard-listing parts of:
  - `specs/045_VAULT_MULTI_BRANCH_DASHBOARD_AND_EDITOR_SPEC.md`
  - `specs/066_DASHBOARD_PR_CLOUDFLARE_BRANCH_PREVIEW_LINK_SPEC.md`
  - `specs/067_VAULT_BRANCH_FILTERS_SPEC.md`

## Vocabulary

- Pull request: GitHub's proposed line of work. It is the primary dashboard row.
- Plain branch: A branch in the connected repository that has no open pull request.
- Head: The exact repository, branch name, and commit SHA currently used by a pull request.
- Check: A GitHub check run or commit status attached to one commit.
- Check rollup: Counts of the latest checks by outcome, without downloading every check row.
- Worker: One Cloudflare Worker connected to the repository. More than one Worker may use the same
  root directory.
- Build: Evidence that Cloudflare Workers Builds actually ran for one exact head. Samebase never
  creates an empty build merely because a Worker could have run.
- Preview: A result of a build. A ready preview can have an immutable version URL and a mutable
  branch-alias URL.
- Root directory: Cloudflare's `root_directory`, using Cloudflare's spelling. This is the same fact
  previously called Samebase `appRoot`.
- Observation: A bounded provider read with an explicit time, scope, and outcome.

## Product boundary

Samebase connects GitHub pull requests, Cloudflare Worker builds, Convex deployments, and the
Samebase editor. It does not copy or recreate all of GitHub or Cloudflare.

The dashboard should be more comfortable for checking active work than opening every pull request on
GitHub. A compact row shows, in this order:

1. Pull request title, number, draft state, and labels.
2. The latest compact check rollup.
3. Cloudflare Worker build and preview results.
4. Additions, deletions, and changed-file count.
5. Samebase editor access for a local head branch.

Ahead and behind counts are lower priority and may be loaded only after explicit interaction.
Individual checks are loaded on demand, cursor-paginated, and briefly cached in the browser. They
are not permanently copied into Convex.

## Truthful states

Every provider-backed cell distinguishes these states:

- `not_requested`: Samebase has not asked the provider.
- `loading`: The named request is running.
- `current`: A complete provider response was observed, including a positive result or an explicit
  absence.
- `stale`: A prior result expired or belongs to an older head. It may remain visible only when it is
  labelled stale.
- `deferred`: A request guardrail stopped work. The reason and retry time are present.
- `unavailable`: The connection, permission, repository, or supported provider path is absent.
- `failed`: Samebase attempted the request and it failed.

Two current absence results are especially important:

- Zero checks means `No checks`.
- Zero Cloudflare builds means `No Cloudflare build observed for this commit`.

Neither is represented by a blank or optional field. A provider timeout, pagination limit, rate
limit, or permission error can never become either absence result.

## Pull request pages

`/vault/<org>/<repo>` loads open pull requests from newest update to oldest. One page contains at
most 25 displayed rows. The GraphQL query includes labels, additions, deletions, changed files,
exact head identity, and aggregate check counts. It does not load individual check rows,
ahead/behind comparisons, closed pull requests, historical builds, or every repository branch.

Pull request filters remain repository-wide within the observed open-PR sequence. Samebase does not
apply filters only to an already loaded page. The backend reads bounded provider pages until it
fills the requested display page, exhausts open pull requests, or reaches its scan guardrail. When
the guardrail is reached, the result says that more provider rows remain and provides a cursor. The
UI never calls that partial scan an empty repository.

Drafts are hidden by default. Unlabelled pull requests and every label are included by default. A
pull request is hidden when drafts are disabled and it is a draft, when unlabelled rows are disabled
and it has no label, or when any of its labels is excluded. Filtering a pull request also hides its
corresponding local branch from the plain-branch section.

## Cloudflare observations

After a pull request page renders, Samebase requests Cloudflare evidence only for the exact heads on
that page. Requests are batched by commit node ID and validated against the expected repository and
SHA. Reordering in GitHub's response cannot change attribution. A shared SHA never authorizes
copying one branch's alias URL to another branch.

A build exists only when a Cloudflare check run proves it started. Its state is one of queued,
running, success, failure, cancelled, skipped, or provider unknown. Its preview result is an
explicit compatible variant: pending, ready, disabled, unavailable, or provider unknown.

A ready preview preserves both URL types when Cloudflare supplies them:

- The version URL identifies one immutable deployment.
- The branch-alias URL follows the latest deployment for one branch.

A Worker skipped by path rules produces no build record. A successful provider response with no
Cloudflare check is current absence, not a failed build. If provider pagination cannot be completed
within the request guardrail, the affected head is deferred rather than reported as having no build.

Worker name identifies the Worker. Root directory does not. More than one Worker using the same root
directory remains representable, even though Samebase does not recommend that configuration. An
unknown root directory is an explicit state.

## Apps and Convex ownership

Cloudflare Workers is the only hosting provider Samebase supports. Cloudflare Pages and other
hosting providers are outside this model.

A Convex-only root may still be an app. For example, `apps/web`, `apps/mobile`, and
`packages/backend` are three transparent apps when both clients share the Convex deployment owned by
`packages/backend`. Samebase shows the shared backend once. It does not duplicate that deployment
beneath both clients or infer client-to-backend use from matching commits.

Cloudflare-to-GitHub relationships come from the Cloudflare GitHub integration. Convex-to-
Cloudflare relationships come from deploy keys and build configuration. A Convex-only app may need
manual root selection because GitHub-to-Convex ownership is not always provider-observable.

## Branches and history

The primary dashboard list does not interleave a pull request and its branch as two identities. The
branch name may appear as secondary metadata and as the Samebase editor target.

Plain branches require their own provider-backed list. A branch may enter that list only after
Samebase proves it has no matching open pull request across the repository, including pull requests
hidden by filters or located on later pages. This list is not part of the first implementation
slice. The default branch and existing editor routes remain available independently.

Closing a pull request removes its PR row. A surviving local branch can then appear as a plain
branch; a deleted branch disappears. Closed pull requests and historical build attempts remain
GitHub and Cloudflare's responsibility for now.

## First implementation slice

The first reviewable slice provides:

- one current default-branch summary and its Samebase editor link;
- bounded, cursor-paginated open pull requests with truthful filters;
- compact current check rollups, including explicit no-checks;
- progressive exact-head Cloudflare observations for loaded pages;
- visible loading, stale, deferred, unavailable, failed, and current-absence states;
- diff statistics and local-head Samebase editor links;
- short browser cache windows that prevent focus and render churn from repeating provider calls.

It deliberately does not provide whole-repository snapshots, atomic generations, background focus
crawls, manual reload, plain branches, ahead/behind counts, detailed checks, closed pull requests,
all-vault summaries, or historical provider data. Those are separate decisions after this slice is
measured on real repositories.
