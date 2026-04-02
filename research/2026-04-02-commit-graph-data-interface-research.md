# Commit Graph Data Interface Research

## Goal

Define a good data contract for a future GitLens-style commit graph UI in Noter,
starting from the sources we can realistically support now:

- local Git
- GitHub

Remote machines are intentionally treated as a future provider, but the
interface should leave room for them without forcing a redesign later.

## Executive Summary

- We should not design the graph interface around GitHub's API shape.
- We should design it around a source-neutral commit graph model with optional
  capabilities.
- Local Git should be the primary "full graph" provider because it can give us
  the commit DAG, refs, ordering, and stats most directly.
- GitHub should be a secondary provider that is very good for:
  - branch history
  - compare ranges
  - author avatars and user metadata
  - branch-head metadata
- GitHub is not a natural full-repository graph source in the same way local Git
  is.
- The fixture UI should consume the same canonical result shape as the eventual
  real providers.

## Existing Repo Signals

Noter already has partial plumbing in both directions.

### GitHub-side signals

Current repo code already uses:

- `repos.listBranches`
- `repos.listCommits`
- `repos.compareCommitsWithBasehead`

Relevant file:

- [apps/noter/convex/github.ts](../apps/noter/convex/github.ts)

Examples in current code:

- `listRemoteBranches()` already resolves branch names and `headCommitSha`
- ahead/behind counts are already derived through `compareCommitsWithBasehead`
- repository trees are already refreshed from GitHub branch tips

### Local/backend Git signals

Current repo code already uses `isomorphic-git` for repository download and
basic ref/file operations.

Relevant file:

- [apps/noter/convex/gitOperationsActions.ts](../apps/noter/convex/gitOperationsActions.ts)

That means Noter already has a local/backend Git dependency, but not yet a
commit-history service shaped for graph rendering.

## Source Evaluation

### Local Git CLI

This is the best source if the goal is a real commit graph.

Why:

- Git natively understands the commit DAG
- Git natively understands refs, tags, branches, and parents
- Git can stream history in topological order
- Git can provide stats with a second pass if we want faster first paint

What local Git can give us well:

- commit SHA
- parent SHAs
- author and committer identity
- authored and committed timestamps
- subject and full message
- refs decorating each commit
- tags
- branch heads
- range and path filtering
- topological ordering
- per-commit additions / deletions / file counts

Relevant official docs:

- [Git pretty formats](https://git-scm.com/docs/pretty-formats.html)
- [Git `rev-list`](https://www.kernel.org/pub/software/scm/git/docs/git-rev-list.html)

Practical implication:

- if we want a GitLens-like "whole repository" graph, local Git is the most
  natural and lowest-friction source

### Local/backend `isomorphic-git`

This is viable, but weaker than CLI Git for graph parity.

Relevant official docs:

- [`isomorphic-git` `log`](https://isomorphic-git.org/docs/en/log.html)

What `isomorphic-git` gives us directly:

- commit OID
- commit parents
- author/committer data
- message

What it does not give us as directly:

- per-commit ref decorations like Git CLI's `%D`
- per-commit stats in a graph-friendly stream
- a ready-made full-repo graph view with refs attached to rows

What it is still good for:

- backend-controlled history reads
- environments where shelling out to Git is undesirable
- branch or ref scoped history
- future server-side caching of graph rows

Practical implication:

- `isomorphic-git` is a good fallback or backend path
- but we should not design the interface around its current limitations

### GitHub REST

GitHub REST is very useful, but not as the canonical shape for a full graph.

Relevant official docs:

- [GitHub REST commits endpoints](https://docs.github.com/en/rest/commits/commits)
- [GitHub REST branches endpoints](https://docs.github.com/en/rest/branches/branches)
- [GitHub REST git refs endpoints](https://docs.github.com/en/rest/git/refs)

What GitHub REST gives us well:

- `List commits`
  - branch or SHA scoped commit history
  - parents on each commit
  - commit message
  - author and committer user objects when available
  - avatar URLs when the commit resolves to a GitHub user
- `Get a commit`
  - per-commit stats
  - file list
  - richer single-commit data
- `Compare two commits`
  - merge base
  - ahead/behind counts
  - commits in a range
  - changed files for the range
- `List branches`
  - branch names
  - branch head SHA
  - protected/default metadata
- `List matching references`
  - branch and tag refs by prefix

What GitHub REST does not give us naturally:

- one repo-wide, topologically ordered, all-refs commit graph stream
- commit-centric ref decorations already joined onto every row
- a cheap way to attach stats to a long commit list without either:
  - range semantics, or
  - per-commit follow-up calls

Practical implication:

- GitHub REST is excellent for:
  - branch history
  - compare views
  - ref enrichment
  - avatar enrichment
- GitHub REST is not the ideal primary source for a GitLens-style full graph

## Important Design Constraint

The interface should distinguish between these history shapes:

- full repository graph
- single branch history
- compare range

Those are not the same data product.

If we flatten them into one "load commits" call with no declared scope, we will
either:

- under-specify the UI contract, or
- accidentally make GitHub look equivalent to local Git when it is not

## Recommended Canonical Interface

The UI should consume one source-neutral contract.

Suggested shape:

```ts
type CommitGraphProviderKind =
  | 'local-git-cli'
  | 'local-isomorphic-git'
  | 'github-rest'
  | 'remote-machine-git'

type CommitGraphScope =
  | { kind: 'repository' }
  | { kind: 'branch'; branch: string }
  | { kind: 'compare'; base: string; head: string }

type CommitGraphQuery = {
  scope: CommitGraphScope
  limit: number
  cursor?: string
  includeStats?: boolean
  includeRefs?: boolean
  includeTags?: boolean
  includeAvatars?: boolean
}

type CommitGraphCapabilities = {
  supportsFullRepositoryGraph: boolean
  supportsBranchHistory: boolean
  supportsCompareRange: boolean
  supportsCommitStats: boolean
  supportsCommitRefs: boolean
  supportsTags: boolean
  supportsAuthorAvatars: boolean
  supportsPathFiltering: boolean
}

type CommitGraphAuthor = {
  name: string
  email?: string
  login?: string
  avatarUrl?: string
  isCurrentViewer?: boolean
}

type CommitGraphRef = {
  name: string
  kind: 'head' | 'branch' | 'remote-branch' | 'tag'
  isCurrent?: boolean
  isDefault?: boolean
  isRemote?: boolean
  upstreamName?: string
}

type CommitGraphRowStats = {
  files: number
  additions: number
  deletions: number
}

type CommitGraphRow = {
  sha: string
  parents: string[]
  message: string
  subject: string
  authoredAtMs: number
  committedAtMs: number
  author: CommitGraphAuthor
  refs?: CommitGraphRef[]
  stats?: CommitGraphRowStats
  sourceUrl?: string
}

type CommitGraphPage = {
  provider: CommitGraphProviderKind
  scope: CommitGraphScope
  rows: CommitGraphRow[]
  capabilities: CommitGraphCapabilities
  nextCursor?: string
  incompleteReasons?: string[]
}
```

## Why this shape is the right starting point

- It matches what the graph renderer actually needs:
  - nodes
  - parent edges
  - row identity
  - refs
  - optional stats
  - optional avatars
- It keeps provider differences explicit through `capabilities`
- It makes GitHub a first-class provider without pretending it is equal to local
  Git for full-graph use
- It lets the fixture consume realistic rows without knowing where they came
  from

## Field-Level Recommendations

### Required on every row

These should be mandatory:

- `sha`
- `parents`
- `message`
- `subject`
- `authoredAtMs`
- `committedAtMs`
- `author.name`

Reason:

- without these, we cannot render a graph row or sort/debug provider output

### Optional but strongly preferred

- `author.avatarUrl`
- `author.login`
- `refs`
- `stats`

Reason:

- the UI can render without them
- but GitLens-like quality depends heavily on them

### Keep provider-specific metadata out of the main row shape

Do not bake in:

- GitHub PR numbers
- GitHub node ids
- machine ids
- installation ids
- GraphQL cursor fragments

If needed later, keep them in a provider metadata envelope instead of the core
row contract.

## Mapping By Source

### Local Git CLI -> canonical interface

Best mapping quality.

- `sha`: direct
- `parents`: direct
- `message` / `subject`: direct
- timestamps: direct
- refs: direct or near-direct
- stats: direct or second-pass direct
- avatars: indirect, via email-based enrichment

Expected capability profile:

- full repository graph: yes
- branch history: yes
- compare range: yes
- refs: yes
- tags: yes
- stats: yes
- avatars: partial

### `isomorphic-git` -> canonical interface

Good mapping quality for history, weaker for ref/stats richness.

- `sha`: direct
- `parents`: direct
- `message` / `subject`: direct
- timestamps: direct
- refs: extra work
- stats: extra work or omitted
- avatars: not direct

Expected capability profile:

- full repository graph: partial
- branch history: yes
- compare range: custom work
- refs: partial
- tags: possible
- stats: weak
- avatars: no

### GitHub REST -> canonical interface

Good mapping quality for branch/range views, weaker for full graph.

- `sha`: direct
- `parents`: direct from commit payload
- `message` / `subject`: direct
- timestamps: direct
- avatars: direct when `author` / `committer` resolves to GitHub users
- stats`: direct from `Get a commit`, or range-level through `Compare two
  commits`
- refs: indirect via branch/ref endpoints and join-by-SHA

Expected capability profile:

- full repository graph: no, not naturally
- branch history: yes
- compare range: yes
- refs: partial
- tags: partial
- stats: partial
- avatars: yes

## Recommendation By Use Case

### Use case: GitLens-style whole repository graph

Recommendation:

- prefer local Git CLI

Reason:

- this is the source that most closely matches GitLens's own data model needs

### Use case: branch-only remote history in a GitHub-backed repo

Recommendation:

- use GitHub REST `List commits`

Reason:

- parents, message, timestamps, and avatars are all available
- it is straightforward and cheap compared with trying to synthesize the whole
  repository graph

### Use case: compare branch A to branch B

Recommendation:

- use GitHub REST `Compare two commits`

Reason:

- ahead/behind and changed files are already built in
- this maps naturally to PR-like or review-like graph scopes

### Use case: future remote machine repository graph

Recommendation:

- make it conform to the same local Git provider shape

Reason:

- remote machines are still Git repositories
- we should treat them as "Git provider over a transport" rather than inventing
  a GitHub-shaped remote contract

## What The Fixture Should Consume

The fixture should not use a fake ad hoc JSON structure.

It should consume `CommitGraphPage` or a very close draft of it.

That buys us two things:

- the UI gets built against realistic optionality
- the eventual provider integration can slot in without refactoring the view

Recommended fixture scenarios:

- repository graph page with refs and avatars
- branch history page without tags
- compare page with stats but sparse refs
- degraded provider page with no avatars and no stats

## What We Should Avoid

### 1. Designing around GitHub compare output

That would overfit the contract to range views and make full-graph local history
awkward.

### 2. Making refs mandatory on every provider

GitHub can provide them, but not as cheaply or as naturally as local Git.
Requiring them everywhere would either:

- make GitHub slow, or
- encourage source-specific hacks

### 3. Making stats mandatory on initial load

Stats should be optional.

The graph should be renderable before stats arrive.

### 4. Hiding provider limitations

The UI should know whether a provider supports:

- full graph
- compare range
- refs
- tags
- avatars

That is better than pretending all providers are equivalent and then producing
mysterious gaps.

## Recommendation

The contract should be built around one idea:

- local Git defines the canonical graph shape
- GitHub maps into that shape with explicit capability limits

Concretely:

1. Treat `CommitGraphPage` as the UI contract.
2. Make `parents` and commit identity fields mandatory.
3. Make refs, stats, and avatars optional.
4. Add explicit provider capabilities.
5. Use local Git CLI as the primary full-graph provider.
6. Use GitHub REST for branch history, compare views, and metadata enrichment.
7. Keep future remote machine Git aligned with the local Git provider, not with
   GitHub REST.

That gives us a data interface that is honest, extensible, and usable for the
fixture immediately.

## Sources

- [apps/noter/convex/github.ts](../apps/noter/convex/github.ts)
- [apps/noter/convex/gitOperationsActions.ts](../apps/noter/convex/gitOperationsActions.ts)
- [GitHub REST commits endpoints](https://docs.github.com/en/rest/commits/commits)
- [GitHub REST branches endpoints](https://docs.github.com/en/rest/branches/branches)
- [GitHub REST git refs endpoints](https://docs.github.com/en/rest/git/refs)
- [Git pretty formats](https://git-scm.com/docs/pretty-formats.html)
- [Git `rev-list`](https://www.kernel.org/pub/software/scm/git/docs/git-rev-list.html)
- [`isomorphic-git` `log`](https://isomorphic-git.org/docs/en/log.html)
