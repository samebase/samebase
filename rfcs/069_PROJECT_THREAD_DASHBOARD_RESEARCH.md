# 069 Project Thread Dashboard Research

## Document Control

- Status: Research note
- Owner: Noter dashboard/product
- Last updated: 2026-03-25
- Related docs:
  - `specs/045_VAULT_MULTI_BRANCH_DASHBOARD_AND_EDITOR_SPEC.md`
  - `specs/050_T3_CODE_REFERENCE_ARCHITECTURE_SPEC.md`
  - `specs/067_VAULT_BRANCH_FILTERS_SPEC.md`
  - `rfcs/068_VAULT_BRANCH_PR_FILTERING_RESEARCH.md`
  - Draft PR #226 (`codex/branch-conversation-stack-spec`)

## Summary

If Noter wants to test a denser dashboard that feels closer to T3 Code and
Codex, the right first move is not a deeper branch card. It is an alternate
project-thread view.

In that view:

1. a `vault` remains the project
2. each visible work row is a derived thread candidate
3. the current best thread candidate is a remote branch enriched with PR
   metadata
4. labels become the main triage control because they already map to GitHub
   filtering and can later drive GitHub project-board slices

The key caveat is structural: Noter does not currently have a first-class
multi-thread-per-project data model. It has a strong branch/PR model plus a
single vault-scoped agent thread. That means the best test surface is a
branch-first queue that borrows thread language and interaction density, not a
fully unified thread system on day one.

## Why This Research Exists

The current dashboard is branch-capable, but it is still card-heavy. That works
well for a small number of repositories and branches, but it does not match the
workflow implied by "29 active threads" where the operator wants to:

1. scan projects quickly
2. collapse each project into a queue of work items
3. filter to only the important work
4. reuse the same labels in GitHub
5. eventually align the same work buckets with a GitHub kanban/project board

There is already adjacent research in draft PR #226 about treating a branch as
an expandable conversation stack. That idea is useful, but it solves the wrong
first problem for this request. It adds depth inside each branch row. The
current ask is about higher-density queue management across many branch/PR
threads.

## Research Questions

1. Which current Noter objects already map to a project-thread dashboard?
2. What prevents Noter from calling those objects "threads" without caveats?
3. How far can GitHub-native labels take the filtering model?
4. What is the smallest testable surface before a larger schema change is
   justified?

## Current Noter State

### Dashboard data is already close to a work queue

The current vault dashboard already exposes most of the metadata a thread list
needs.

Per project (`vault`), Noter already has:

1. repository identity
2. last activity and staged-change counts
3. infrastructure status
4. remote branch catalog

Per branch row, Noter already has:

1. branch name
2. PR title, number, URL, and draft state when present
3. PR labels
4. ahead/behind counts
5. Cloudflare preview link when present
6. staged-file counts

This makes `vaultRemoteBranches` the strongest current source for a derived
thread list.

### Branch filters already solve part of the label problem

The dashboard already persists per-user branch filters in `vaultBranchFilters`
and supports:

1. inclusive label toggles
2. explicit `No label`
3. explicit draft visibility
4. stable label ordering

That means Noter already has a working local pattern for "show only the
important threads." The missing part is not basic filtering. The missing part is
a dashboard layout that treats filtered branch/PR rows as the primary unit
instead of nesting them inside large cards.

### Chat is not yet a real multi-thread model

The main model gap is in chat.

`agentThreadContext` is indexed by `(userId, vaultId)`, and
`chat.index.createThread` reuses the existing thread for a vault when one
already exists. In practice, that means:

1. Noter currently has one canonical agent thread per vault per user
2. the thread can carry optional `branch` context
3. the product does not yet model several durable chat threads inside one
   project

This is the biggest reason the new surface should start as a derived queue view,
not as a promise that branches, PRs, and chat threads are already one fully
unified object.

### Current GitHub label taxonomy is too coarse

As of 2026-03-25, the repository's current labels are:

1. `research`
2. `implementation`
3. `prototype`
4. `tracker`

Those labels are useful for work type, but they are not enough by themselves to
triage a large queue. They do not distinguish:

1. important vs parked
2. blocked vs ready
3. needs review vs in progress

The dashboard can reuse GitHub labels, but a denser thread view becomes much
more valuable once the label taxonomy includes at least one urgency/state
dimension in addition to work type.

## External Reference Findings

### T3 Code

T3 Code's strongest reusable idea is the product shape, not its exact runtime:

1. keep a minimal web GUI around agent work
2. keep terminal as secondary tooling
3. let the operator think in terms of projects and queued work, not raw shell
   state

This supports an alternate Noter dashboard that feels more like a project queue
than a repository card gallery.

### Codex

OpenAI's published Codex guidance explicitly describes the task queue as a
lightweight backlog and recommends firing off tangential work so it can be
reviewed later. That maps well to a Noter dashboard where many active work items
can exist at once and the operator needs to narrow back down to the few that
matter now.

### GitHub filtering

GitHub's documented issue/PR filtering model already supports the label and
draft patterns this dashboard needs:

1. `label:`
2. exclusion via `-label:`
3. `is:draft`
4. shareable filtered URLs

That makes GitHub-native labels the best initial control plane for triage,
because the same semantics can work in:

1. repository PR lists
2. CLI searches
3. Noter's dashboard filters
4. GitHub project views when PRs are used as board items

## Key Findings

### 1. The best v0 "thread" is a branch row with PR metadata

If the goal is to test a different dashboard quickly, the current row to promote
is:

- remote branch
- optional open PR metadata
- optional PR labels
- optional draft state

That is already rich enough to behave like a work-thread row for the operator.

### 2. A true unified thread object does not exist yet

Noter cannot honestly treat chat thread, branch, and PR as the same persisted
entity today.

Current reality is:

1. branch/PR data is many-per-vault
2. agent-thread data is one-per-vault
3. labels are attached through PR metadata, not through a standalone thread
   model

That does not block a new dashboard view. It does mean the first view should be
described as a derived work queue, not as the final canonical thread model.

### 3. Labels are the right first filter primitive

Labels are the best control surface for this experiment because they are:

1. already visible in the current dashboard
2. already familiar to GitHub-heavy operators
3. already filterable in GitHub search
4. portable into future kanban/project views

### 4. PR-only labels are not enough for branch-first work

There is a sharp limitation in the current model: labels arrive through open
PRs. Branch-only work without a PR falls into `No label`.

That is acceptable for a first test if the operator is comfortable creating
draft PRs early. It is not sufficient for a mature thread system where many
important work items may exist before a PR exists.

### 5. Draft PR #226 is a follow-on, not the first step

The branch-conversation-stack proposal in PR #226 adds nested commit detail
under a branch. That is useful after the top-level queue is right.

It is not the best first test for this request because:

1. it makes each branch deeper instead of making the whole dashboard denser
2. it helps answer "what commits are on this branch?"
3. this request first needs to answer "which work items matter across my
   projects right now?"

## Options Considered

### Option A. Keep the current card grid and only improve filters

Pros:

1. lowest implementation cost
2. reuses the current dashboard completely

Cons:

1. still card-heavy
2. still makes branch/PR rows feel secondary
3. does not get close enough to the T3/Codex queue mental model

Verdict:

Not enough change to test the new product direction.

### Option B. Expand branch rows into commit stacks first

Pros:

1. strong branch detail
2. uses existing branch model cleanly

Cons:

1. increases vertical depth
2. does not reduce queue-scanning cost
3. does not solve "29 threads" triage well

Verdict:

Good follow-on, not the first experiment.

### Option C. Add an alternate project-thread dashboard view derived from

branches and PRs

Pros:

1. directly matches the requested mental model
2. can ship as a test without schema changes
3. reuses existing branch, PR, label, and draft metadata
4. makes filtering feel primary instead of secondary

Cons:

1. "thread" is still a derived product term, not a canonical backend entity
2. branch-only work still lacks rich labels unless a PR exists
3. real multi-thread chat per project remains out of scope

Verdict:

Best immediate experiment.

### Option D. Introduce a first-class unified work-item/thread model now

Pros:

1. honest long-term architecture
2. can truly unify chat, branch, PR, and labels
3. can support project-wide queues without PR-first constraints

Cons:

1. much larger product and schema change
2. forces chat-model changes immediately
3. too heavy for "test a different dashboard" as the first slice

Verdict:

Likely the right long-term destination, but too large for the first trial.

## Recommended Direction

Add a new alternate dashboard mode for testing:

- `Cards` = current vault-card dashboard
- `Threads` = new project-thread dashboard

The new mode should not replace the current dashboard immediately.

### Layout

Recommended shape:

1. left rail: projects (`vaults`) with counts
2. main pane: thread rows for the selected project
3. optional `All projects` scope above the project list

This is the closest fit to the requested "projects, and then for each a thread"
model while staying denser than the current card grid.

### Thread row definition

In v0, one thread row should be derived from one active remote branch.

Row title:

1. PR title when present
2. otherwise branch name

Row metadata:

1. branch name
2. PR number/link when present
3. draft badge
4. labels
5. ahead/behind summary
6. last commit time
7. staged-file count
8. Cloudflare preview link when present

Primary action:

1. open the branch in the editor

Secondary actions:

1. open PR on GitHub
2. open preview when present

### Filtering model

The first filter model should stay label-first and intentionally small:

1. labels
2. `No label`
3. draft visibility
4. optional "important only" preset once that label exists

Noter already has most of this behavior in per-vault branch filters. The new
view should lift the same semantics into a project-thread surface instead of
inventing a separate filter language first.

### Sorting model

Recommended default order inside a project:

1. explicitly important rows first
2. rows with staged changes
3. most recently updated rows
4. default branch last unless the operator explicitly asks to include it

The point of the view is active-work triage, not complete repository browsing.

## Label Strategy

### Use GitHub-native labels as the shared control plane

For this experiment, labels should stay GitHub-native wherever possible. That
keeps one operator-facing vocabulary across:

1. Noter thread filters
2. GitHub PR lists
3. `gh pr list --search ...`
4. future GitHub project board slices

### Minimal label expansion

The current label set should be kept, but it needs one extra state/priority
dimension.

A minimal expansion would be:

1. keep `research`, `implementation`, `prototype`, `tracker`
2. add `important`
3. add `blocked`
4. optionally add `review`
5. optionally add `parked`

That is enough to make a 20-30 item queue materially easier to cut down.

### Known gap

If Noter wants labels on branch-first work before a PR exists, GitHub-native
labels are not enough on their own.

There are two realistic paths:

1. accept early draft PR creation as the label attachment point
2. later add Noter-owned thread labels that can sync into GitHub once a PR
   exists

For the dashboard experiment, path 1 is simpler.

## Data-Model Implications

### V0: no schema change

Use existing data:

1. `vaults` as projects
2. `vaultRemoteBranches` as derived thread rows
3. existing PR label and draft metadata
4. existing staged-file branch summaries
5. existing dashboard filter persistence patterns

This is enough to test the new layout honestly.

### V1: first-class work items if the view proves valuable

If the thread view works and the team wants true unification, add a dedicated
table, for example:

```ts
projectWorkItems: defineTable({
  userId: v.id('users'),
  vaultId: v.id('vaults'),
  title: v.string(),
  branchName: v.optional(v.string()),
  pullRequestNumber: v.optional(v.number()),
  agentThreadId: v.optional(v.string()),
  labels: v.array(v.string()),
  status: v.union(
    v.literal('active'),
    v.literal('blocked'),
    v.literal('review'),
    v.literal('parked'),
    v.literal('done'),
  ),
  pinned: v.optional(v.boolean()),
  lastActivityAt: v.number(),
})
```

That would allow Noter to:

1. support several durable chat threads per project
2. keep labels even before a PR exists
3. unify branch, PR, and chat references in one row
4. persist operator ordering and pinning

That is a larger product change and should wait until the alternate dashboard
has been validated.

## Recommended Rollout

1. Add a dashboard mode toggle: `Cards` / `Threads`.
2. Build `Threads` entirely from current vault + branch + PR data.
3. Reuse the current label/no-label/draft filter semantics.
4. Keep the single vault-scoped chat thread model unchanged.
5. Validate whether operators can manage a large active queue more easily in the
   new mode.
6. Only then decide whether to add first-class `projectWorkItems` and
   multi-thread chat.

## Open Questions

1. Should the `Threads` view default to one selected project or to
   `All projects`?
2. Is early draft-PR creation acceptable as the label attachment point for most
   work?
3. Does the operator want importance to be label-driven, pin-driven, or both?
4. Should the default branch be hidden entirely in thread mode unless it has
   staged changes?
5. If GitHub project boards are part of the target workflow, which fields are
   labels versus true project fields?

## Research Basis

### Local code and docs

1. `apps/noter/src/components/VaultDashboard.tsx`
2. `apps/noter/src/components/VaultBranchFilters.tsx`
3. `apps/noter/src/lib/vaultBranchFilters.ts`
4. `apps/noter/convex/chat/index.ts`
5. `apps/noter/convex/schema.ts`
6. `apps/noter/convex/vault.ts`
7. `specs/045_VAULT_MULTI_BRANCH_DASHBOARD_AND_EDITOR_SPEC.md`
8. `specs/050_T3_CODE_REFERENCE_ARCHITECTURE_SPEC.md`
9. `specs/067_VAULT_BRANCH_FILTERS_SPEC.md`
10. `rfcs/068_VAULT_BRANCH_PR_FILTERING_RESEARCH.md`

### External references

1. T3 Code GitHub README: `https://github.com/pingdotgg/t3code`
2. OpenAI, "How OpenAI uses Codex" (task queue/backlog guidance):
   `https://cdn.openai.com/pdf/6a2631dc-783e-479b-b1a4-af0cfbd38630/how-openai-uses-codex.pdf`
3. GitHub Docs, "Filtering and searching issues and pull requests":
   `https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/filtering-and-searching-issues-and-pull-requests`

### Explicit limitation

I could not inspect the current GitHub Projects configuration for
`noter-md/noter` from this environment because the local `gh` token does not
have the `read:project` scope. The recommendation to reuse labels for future
kanban/project slicing is therefore based on GitHub's documented label/query
model plus the repo's current PR labeling, not on a verified read of the
organization's live project-board setup.
