# Cloudflare Git Runtime Options Research

## Problem Statement

Noter currently derives branch freshness, ahead/behind, and some PR-adjacent
metadata through GitHub API fan-out instead of local git graph operations. That
is workable for small repos, but it becomes expensive and latency-sensitive as
branch counts grow.

The current hot spots are:

- `apps/noter/convex/github.ts#getAheadBehindByBranch`, which calls
  `compareCommitsWithBasehead` once per non-default branch.
- `apps/noter/convex/github.ts#getCloudflarePreviewLinksByBranch`, which scans
  PR comments after PR resolution.
- `apps/noter/convex/vault.ts#syncVaultRemoteBranches`, which clears cached
  ahead/behind when a branch head changes and the refresh path could not resolve
  fresh counts.

## Constraints

- Prefer Cloudflare, Convex, and GitHub as the main stack.
- Treat this as future-direction research, not an accepted product contract.
- Prefer a real git-native path for branch graph calculations.
- Keep Convex as the app-facing source for cached summaries and subscriptions.

## Current Baseline

Today the backend pays GitHub API cost where git CLI would normally be cheaper:

1. list remote branches through GitHub
2. call GitHub compare for ahead/behind
3. call GitHub PR and comments APIs for PR-adjacent metadata
4. cache the resulting summaries in Convex

That means the system does not currently own a persistent local commit graph.

## Web Research

### 1. Cloudflare Workers alone are not the right execution surface

Cloudflare Workers support some Node.js APIs, but `child_process` is not a
functional path for running real `git` CLI commands there. Worker filesystem
support is also virtual/ephemeral rather than a durable repo workspace.

Implication: plain Workers are good for orchestration, ingress, and lightweight
metadata work, but not for repo-native git graph computation.

### 2. Cloudflare Containers and Sandbox are the first strong fit

Cloudflare announced Containers and Sandbox general availability on 2026-04-13.
Containers are the low-level full-Linux execution layer, while the Sandbox SDK
adds higher-level primitives for commands, background processes, terminals, git
workflows, and backups.

Implication: this is the first Cloudflare-native layer that looks like a real
replacement for the missing git runtime.

### 3. R2 helps with persistence, not live graph math

Cloudflare Sandbox supports backups stored in R2 and supports bucket mounts.
That makes R2 a good fit for:

- cold-start acceleration
- mirror backups or snapshots
- exporting repo-state artifacts

R2 does not by itself compute ahead/behind or maintain a live commit graph.

### 4. Durable Objects and Queues are strong supporting pieces

Durable Objects are a good fit for repo-scoped coordination and serialization.
Queues are a good fit for buffering GitHub webhook bursts and retrying work
without dropping updates.

Implication: the likely Cloudflare-native shape is not "R2 instead of git," but
"Queues + Durable Object + Sandbox/Container + R2 backup."

### 5. GitHub webhooks should replace broad polling where possible

GitHub webhook payloads already identify the changed ref and before/after SHAs.
That is a better trigger for repo refresh work than repeated repo-wide polling.

Implication: fetch and recompute only when GitHub signals that a repo, branch,
or PR changed.

## Options Considered

### Option A: Stay on GitHub API fan-out

Pros:

- simplest operationally
- no new runtime surface

Cons:

- expensive per-branch compare fan-out
- slower freshness for large repos
- tied to GitHub rate limits and response latency

Verdict:

- fine for low scale
- not the best long-term path for larger repos

### Option B: Plain Workers plus R2

Pros:

- stays fully on Cloudflare primitives
- easy to integrate with Convex and GitHub webhooks

Cons:

- no strong git CLI path
- R2 stores bytes but does not replace a live repo runtime

Verdict:

- not sufficient for the core ahead/behind problem

### Option C: Cloudflare Sandbox or Containers plus Queues, Durable Objects, and R2

Pros:

- real git-native execution path
- Cloudflare-native orchestration and persistence story
- R2 can speed cold starts without being the hot path

Cons:

- operationally heavier than API-only sync
- introduces repo-mirror lifecycle management

Verdict:

- best fit within the preferred stack

## Recommended Direction

Use this shape for git-heavy repo metadata:

`GitHub webhook -> Cloudflare Worker -> Cloudflare Queue -> Durable Object per repo -> Cloudflare Sandbox/Container with bare clone -> local git calculations -> write compact summaries to Convex`

Recommended responsibilities:

1. GitHub
   - source of truth for repo events and PR metadata
   - send `push`, `pull_request`, and branch-deletion style events
2. Cloudflare Worker
   - verify webhook signatures
   - normalize events
   - enqueue repo work
3. Cloudflare Queue
   - absorb bursts
   - retry failures
   - decouple inbound webhooks from repo work
4. Durable Object
   - serialize repo refreshes
   - keep repo-scoped locks and scheduling state
5. Sandbox or Container
   - own a real bare mirror or working mirror
   - run `git fetch --prune`
   - compute ahead/behind locally
6. R2
   - store backups, bundles, or repo-state snapshots for faster warmup
   - not serve as the hot calculation layer
7. Convex
   - store branch summaries and PR-adjacent cached data
   - feed the UI through subscriptions and queries

## Why This Is Better Than `convex-sandbox`

`convex-sandbox` is still a virtual shell over stored files. It is useful as a
safe scratch environment, but it does not solve the missing git-runtime problem.
The git-heavy path wants a real repo object database and a real execution
surface, not a virtual filesystem wrapped around interpreted shell commands.

## Open Questions

1. Do we want one persistent sandbox per hot repo, or just-in-time sandboxes
   restored from R2 backups?
2. Should the repo runtime use bare clones only, or maintain working trees for
   preview-adjacent tasks too?
3. Which PR metadata should remain GitHub-API-based even after ahead/behind
   moves local?
4. What is the desired eviction policy for large inactive repos?

## Recommendation Summary

If Noter wants faster ahead/behind and related branch graph work while staying
within Cloudflare, Convex, and GitHub, the strongest path found in this research
is:

- do not try to solve this with R2 alone
- do not rely on plain Workers for git CLI
- adopt Cloudflare Sandbox or Containers for the real repo runtime
- use Queues and Durable Objects to coordinate per-repo work
- keep Convex as the serving cache for the app

## Sources

- Cloudflare changelog: Containers and Sandbox GA
  - <https://developers.cloudflare.com/changelog/post/2026-04-13-containers-sandbox-ga/>
- Cloudflare Containers overview
  - <https://developers.cloudflare.com/containers/>
- Cloudflare Sandbox overview
  - <https://developers.cloudflare.com/sandbox/>
- Cloudflare Sandbox architecture
  - <https://developers.cloudflare.com/sandbox/concepts/architecture/>
- Cloudflare Sandbox git workflows
  - <https://developers.cloudflare.com/sandbox/guides/git-workflows/>
- Cloudflare Sandbox mount buckets guide
  - <https://developers.cloudflare.com/sandbox/guides/mount-buckets/>
- Cloudflare Sandbox backup/restore changelog
  - <https://developers.cloudflare.com/changelog/post/2026-02-23-sandbox-backup-restore-api/>
- Cloudflare Durable Objects overview
  - <https://developers.cloudflare.com/durable-objects/>
- Cloudflare Queues overview
  - <https://developers.cloudflare.com/queues/>
- Cloudflare Workers Node.js compatibility
  - <https://developers.cloudflare.com/workers/runtime-apis/nodejs/>
- Cloudflare Workers `fs`
  - <https://developers.cloudflare.com/workers/runtime-apis/nodejs/fs/>
- GitHub webhook events and payloads
  - <https://docs.github.com/en/webhooks/webhook-events-and-payloads>
