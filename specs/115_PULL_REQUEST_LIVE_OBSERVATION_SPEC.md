# Pull Request Live Observation Spec

Status: Accepted

Date: 2026-07-20

Related work:

- [PR #1243: Simplify vault provider resource truth](https://github.com/samebase/samebase/pull/1243)
- [PR #1234: Replace repository scans with bounded PR observations](https://github.com/samebase/samebase/pull/1234)
- [Vault route surface spec](./110_VAULT_ROUTE_SURFACE_SPEC.md)
- [Convex table taxonomy and ownership spec](./114_CONVEX_TABLE_TAXONOMY_AND_OWNERSHIP_SPEC.md)

## Decision

The selected-vault dashboard is a pull request surface, not a cached repository branch catalog.

Samebase persists the stable repository and app graph that it owns. It reads current pull request,
check, Worker build, and Convex preview deployment state live from the providers through
authenticated Convex actions. The browser caches those action results briefly.

No pull request, check, Worker build, or Convex preview deployment table is introduced.

## Mental model

There are three separate layers.

### Durable Samebase topology

Convex stores:

- the vault and its GitHub repository identity;
- saved pull request filter preferences;
- vaultApps, keyed by canonical root directory;
- vaultCloudflareWorkers, keyed in Samebase by workerId and at Cloudflare by accountId plus
  workerTag;
- vaultConvexProjects, keyed in Samebase by convexProjectId and at Convex by teamId plus projectId;
- operation plans, runs, events, checkpoints, and write locks when Samebase performs a durable
  workflow.

appId groups Worker and Convex attachments that belong to the same app root. It does not prove that
a Worker is currently wired to a Convex project.

### Live provider truth

Providers own:

- GitHub pull request identity, title, draft state, labels, diff totals, head SHA, and checks;
- Cloudflare Worker existence, build configuration, build history, and build outcome;
- the Worker's current SAMEBASE_CONVEX_PROJECT marker and deploy-key state;
- Convex preview deployment existence, identifier, reference, URL, and last deploy time.

Samebase actions read that state on demand. Provider responses are not mirrored into Convex tables.

### Browser cache mechanics

TanStack Query may retain live action results for a short period. Cache entries are disposable and
must never be interpreted as durable resource ownership or deletion authority.

The default policy is:

- stale after 60 seconds;
- garbage collected after 5 minutes;
- no automatic retry storm;
- old rows remain visible while a background refresh runs;
- a failed refresh may leave old rows visible as stale, but it must not relabel them current.

## Pull request page observation

The pull request is the primary row.

listOpenPullRequests reads GitHub GraphQL with these bounds:

- at most 25 displayed pull requests per Samebase page;
- at most 4 GitHub provider pages for repository-wide label and draft filtering;
- a fixed GraphQL cost budget;
- a fixed request deadline;
- explicit rate-limit accounting.

Each row carries this exact identity:

- base repository GraphQL node ID;
- pull request GraphQL node ID and number;
- canonical pull request URL;
- head repository GraphQL node ID, or explicit unavailability;
- head ref name;
- head commit GraphQL node ID and SHA.

The head repository and the commit repository are different facts for forks. GitHub commit nodes for
a fork pull request can still report the base repository, while headRepository identifies the fork.
Samebase preserves both facts.

The action returns one of:

- current, with provider time, freshness deadline, rows, continuation, and request usage;
- budget_deferred, with an explicit retry time;
- provider_unavailable, when the connection or repository is unavailable;
- provider_failure, when the request or response cannot be trusted.

A continuation is:

- complete, when GitHub was exhausted;
- next_page, when another Samebase page can continue;
- scan_guardrail, when filtering could not fill the requested page within the provider-page budget.

Only complete can prove that no matching open pull requests remain. A guardrail is not an empty
repository.

## Visible resource observation

The browser requests provider resources only for pull requests currently visible on the selected
vault surface. At most 25 exact heads are accepted in one action.

The action loads the stable app graph once, then observes each attached Worker separately. Multiple
Workers may share one app and must remain separate observations.

### Cloudflare build proof

For every stable Worker, Samebase:

1. verifies that workerName still resolves to the attached immutable workerTag;
2. reads current Builds trigger configuration;
3. calls Cloudflare's Worker Builds endpoint with accountId plus workerTag;
4. scans at most 2 pages of 100 builds;
5. selects the newest build matching the exact pull request URL and head SHA.

The Convex marker and deploy-key read is a later live axis. Samebase starts it only when at least
one visible pull request has an exact Worker build. If that read fails, the exact build remains
available and only its Convex preview becomes unavailable.

The candidate is accepted only when Cloudflare also agrees on:

- immutable Worker tag;
- preview trigger UUID;
- GitHub repository ID;
- canonical app root directory;
- pull request trigger source;
- head ref name;
- preview deploy command.

Worker name is display data after stable identity is proven. It is never sufficient attribution.

Each Worker and pull request pair is:

- available, when the exact provider build is proven;
- absent, only when Cloudflare pagination is exhausted without a match;
- unavailable, when credentials are missing, the Worker is missing or replaced, Builds is not
  connected, provider evidence disagrees, the request fails, or the pagination bound prevents an
  absence proof.

GitHub check output may later enrich a provider-proven build with preview URLs. A GitHub check can
never create a Worker relationship or prove build existence by itself.

### Convex preview proof

A Convex preview link is attached to an available Worker build only when the entire live chain is
proven:

1. the pull request head repository equals the vault's base repository;
2. the Cloudflare build completed successfully;
3. the Worker's current marker is configured and points to a stable Convex project attached to the
   same appId;
4. the current Convex connection can read that exact team and project;
5. the provider returns one preview deployment whose previewIdentifier equals the head ref;
6. its reference equals preview/head-ref;
7. its last deploy time falls inside the Cloudflare build execution window.

The production deployment is never a preview fallback.

Fork heads never resolve a Convex preview by branch name. Two repositories can use the same branch
name, so that would create a false relationship.

The preview state is:

- available, with stable convexProjectId, deployment name, backend URL, and dashboard URL;
- absent, when the provider was read successfully and no deployment satisfies the proof;
- unavailable, when a prerequisite cannot be proven or provider evidence is ambiguous.

## Dashboard behavior

The selected vault shows the first live pull request page and progressively observes resources for
those visible rows.

The first load distinguishes:

- loading;
- current rows;
- confirmed current empty;
- connection unavailable;
- rate or request budget deferred;
- provider failure.

A background refresh keeps the previous rows visible and marks the surface as updating. If the
refresh fails, the previous rows may remain visible as stale with a retry action.

Only page 1 and its visible resources may poll every 60 seconds, and only while the document is
visible and a displayed check or build is nonterminal. Continuation pages do not poll. If refreshed
page 1 has a different row generation, older continuation pages are discarded.

Opening a same-repository pull request in the editor still hydrates that exact branch and immutable
tree on demand. The dashboard does not need a repository-wide branch scan for this.

Every path that publishes an exact branch tree, including post-write refreshes, must read the commit
and its immutable tree as one provider generation and publish only while it owns the vault refresh
claim. A timed-out read cannot overwrite a newer branch generation.

## Webhooks

Webhooks are not part of this slice.

A future webhook may invalidate a cache generation or wake a live reread. A webhook payload must not
become persisted pull request, build, or deployment truth. Delivery delay, replay, missing
administrative permission, and out-of-order events make webhook materialization a weaker source than
the bounded provider reads required here.

## Legacy observations

The existing branch and commit-check tables have other call sites and are not deleted in the first
dashboard slice.

The selected-vault dashboard must stop presenting those mirrors as its current pull request source.
Exact branch hydration for the editor remains. Deleting legacy tables follows only after every
production reader, writer, cleanup path, and account-deletion path has been audited and migrated.

## Invariants

Tests must cover at least:

- 25-row pages and a 4-provider-page filter guardrail;
- complete empty versus incomplete scan versus provider failure;
- exact head movement;
- same-repository and fork identity;
- exact branch generation reads and refresh-claim ownership;
- two Workers attached to one app;
- the same Worker name in different accounts;
- Worker recreation under the same name with a different tag;
- Cloudflare exhaustion versus pagination guardrail;
- exact pull request URL and SHA matching;
- repository, app root, trigger, and deploy-command disagreement;
- successful same-repository Convex preview resolution;
- no fork preview resolution by branch name;
- preview deployment outside the build window;
- ambiguous preview deployments;
- stale rows retained after a failed background refresh;
- page 1 polling without continuation-page polling.

## Non-goals

This spec does not:

- persist provider observations;
- delete legacy observation tables in the first slice;
- infer Worker identity from a name or GitHub check;
- infer a Convex deployment from appId alone;
- add webhook state;
- substitute a production deployment for a missing preview;
- turn a UI page size into a provider or API invariant.
