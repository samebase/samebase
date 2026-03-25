# 070 Firefox Tree Style Tab Branch/PR Representation Research

## Document Control

- Status: Research note
- Owner: Noter dashboard/product
- Last updated: 2026-03-26
- Depends on:
  - `specs/045_VAULT_MULTI_BRANCH_DASHBOARD_AND_EDITOR_SPEC.md`
  - `specs/066_DASHBOARD_PR_CLOUDFLARE_BRANCH_PREVIEW_LINK_SPEC.md`
  - `specs/067_VAULT_BRANCH_FILTERS_SPEC.md`
  - `rfcs/068_VAULT_BRANCH_PR_FILTERING_RESEARCH.md`
  - `apps/noter/src/components/VaultDashboard.tsx`
  - `apps/noter/convex/vault.ts`
  - `apps/noter/convex/github.ts`
  - `apps/noter/convex/schema.ts`

## Purpose

Evaluate Firefox Tree Style Tab (TST) as the visual and interaction model for
Noter's branch and pull request surface.

The goal is not to copy browser tabs literally. The goal is to decide which TST
ideas transfer well to Noter's branch dashboard, which ones do not, and what
data model gaps block a real branch tree.

## Research Questions

1. What problem does Tree Style Tab actually solve?
2. Which parts of its model map cleanly onto Noter's current branch and PR
   surface?
3. Which parts require new backend data before they are honest to ship?
4. What is the smallest TST-inspired direction that improves branch/PR triage
   without inventing a second Git UI inside each vault card?

## Current Noter State

### The dashboard is still branch-centric

`VaultDashboard` renders one flat list row per remote branch. Each row already
has rich metadata:

- branch name
- commit SHA
- PR number / URL
- PR title
- PR draft state
- PR labels
- Cloudflare branch preview link
- ahead / behind counts
- staged file summary
- branch deletion affordance

The row is visually dense, but structurally flat.

### The backend source of truth is also branch-centric

`vaultRemoteBranches` stores one row per branch. That row already includes:

- `name`
- `headCommitSha`
- `isDefault`
- `isProtected`
- `remoteState`
- `pullRequestUrl`
- `pullRequestNumber`
- `pullRequestLabels`
- `pullRequestTitle`
- `pullRequestIsDraft`
- Cloudflare preview metadata

This is enough for a branch-first tree UI where PR data is attached to a branch.

### Important current constraint: no explicit branch parent relation

Today Noter does not store:

- the PR base branch
- the PR head/base ref pair as first-class dashboard data
- an explicit parent branch pointer
- a stacked-PR / stacked-branch relation

`github.ts` currently resolves one latest open PR summary per branch, but it
does not expose a branch ancestry model suitable for a real nested branch tree.

That means Noter can truthfully show:

- branch root nodes
- PR child nodes under a branch

But it cannot yet truthfully show:

- branch A as a child of branch B
- a full stacked-PR tree

unless that parent relation is synced explicitly.

### Existing sort order already gives one TST-like anchor

`compareRemoteBranchSortOrder()` already pins the repository default branch at
the top, then sorts active branches by recent commit activity, with
deleted-upstream branches last.

That is important because TST works best when there is a stable spatial anchor.
Noter already has the default branch as that anchor.

## External Research: What Tree Style Tab Actually Is

## Core interaction model

From the Firefox add-on page and TST's own docs:

- TST is a permanently shown vertical tab management UI.
- New tabs opened from the current tab are automatically attached as children.
- Parent rows can collapse their descendants.
- Trees act as both topic grouping and visual browsing history.
- Trees can be restructured with drag and drop.

The important product idea is not "browser tabs in a tree". The important idea
is "hierarchy as memory". TST keeps context visible while allowing deep work to
collapse back into a compact root.

## TST is intentionally small at the core

TST's project policy matters as much as the tree itself:

- the built-in surface stays focused on tree management
- the author explicitly avoids baking in every possible power-user feature
- search, counters, coloring, collapsed aliases, and other extras are pushed
  into helper extensions through public APIs

This is directly relevant to Noter. The best transfer is not "copy all TST
features". It is "keep the branch tree small, then expose fixed slots for other
metadata to enrich it".

## TST exposes the tree as a structured API

The public API exposes:

- tree information with `children`, `indent`, and collapsed state
- notifications when a tree is attached / detached
- notifications when a tree is collapsed / expanded
- custom tab state markers via `add-tab-state`
- extra tab contents inserted at places like:
  - `tab-front`
  - `tab-above`
  - `tab-below`
  - `tab-indent`
  - `tabbar-bottom`

This is a strong architecture signal:

- the core tree item stays small
- richer metadata is attached in explicit slots
- collapse state is treated as first-class UI state
- tree structure changes are treated as domain events

## TST helper ecosystem shows what users actually need around the tree

The helper-addons list is especially useful because it reveals which
capabilities matter in practice:

- active-tab alias in collapsed trees
- sticky tabs at edges
- indent lines
- lock specific trees as collapsed
- a bookmarks subpanel below the tree
- search/filter subpanels
- counters and markers

For Noter, this is the most transferable part of the research. It says the tree
itself is not enough. Operators also need:

- good collapsed-state legibility
- clear anchors for important nodes
- secondary panels for search/filter
- small status markers that do not destroy scanability

## TST also has scale-oriented behavior

The TST API documents that on TST 4.0 and later only in-viewport tabs are
actually rendered, and tabs are un-rendered when they go away from the viewport.

This does not mean Noter should clone TST's rendering layer. It does mean the
TST mental model is compatible with virtualization once branch counts become
large.

## What Maps Cleanly to Noter

## Recommended hierarchy

The clean v1 mapping is:

```text
Vault
├─ default branch (sticky / pinned)
│  └─ pull request #123 "Title" (if any)
├─ feature/oauth-login
│  └─ draft PR #456 "OAuth login"
└─ release/1.2.0
```

Interpretation:

- the branch is the primary entity and root tree item
- the PR is an optional child node under that branch
- preview links, staged counts, labels, draft markers, ahead/behind counts, and
  agent presence stay on the branch row or PR row as badges / side metadata
- they do not become deeper child levels by default

This matches Noter's current truth model:

- routes are branch-based
- staging is branch-scoped
- tree cache is branch-scoped
- commits and pushes are branch-scoped
- PR data is derivative metadata attached to a branch

## Why the branch must stay the root node

In Noter, a PR is not the primary repository identity. The branch is.

That matters because:

- opening the editor is branch navigation
- tree refresh is branch refresh
- staged files are branch-local
- ahead/behind is branch-relative
- deletion eligibility is branch-relative

So even when a PR exists, the UI should not become PR-first. The PR should be a
child detail surface beneath the branch, not a replacement for the branch.

## Recommended interaction rules

### 1. Permanent tree, not a transient drawer

TST is designed as a permanently shown management UI. The Noter equivalent is:

- on desktop, the branch tree stays visible inside the vault dashboard or a
  dashboard-adjacent sidebar
- do not hide the tree behind a separate "open branch browser" flow for normal
  usage

### 2. Default branch stays pinned

TST benefits from stable anchors. Noter already has one:

- keep the default branch pinned/sticky at the top
- optionally keep the currently active branch visible when the list scrolls

### 3. Collapse state should be first-class and persisted

TST treats collapse as a core interaction, not a cosmetic accordion.

For Noter:

- every branch row with a PR child should be collapsible
- collapse state should persist per user in Convex, not local-only state
- collapse state should sync across devices, matching repo preference

### 4. Collapsed parents must still surface active child context

TST's helper ecosystem includes an "active tab in collapsed tree" alias because
collapsed trees are easy to lose track of otherwise.

Noter should copy that idea:

- if a collapsed branch contains the currently relevant PR child, unread review
  activity, or active agent work, the collapsed branch row should surface a
  compact child alias or counter

### 5. Metadata belongs in fixed slots, not in longer prose rows

TST's extra contents API is a good model for Noter row composition.

Branch rows should have fixed metadata slots for:

- draft marker
- PR number
- preview link
- staged count
- ahead/behind
- agent presence
- unread review/activity count

This is better than continuously adding more text fragments to the row body.

### 6. Search/filter should remain a secondary surface

TST's own policy avoids baking in search as a core tree responsibility, and the
ecosystem provides search via helper addons or subpanels.

That matches Noter's existing direction from `rfcs/068` and `specs/067`:

- keep filtering as a separate control near the `Branches` header
- do not add a permanent text input to every branch row
- if richer search arrives later, it should feel like a branch-tree companion
  panel, not a replacement for the tree

### 7. Drag-and-drop should not ship in v1

TST supports drag-and-drop tree restructuring because tabs are local UI objects.

Branches are different:

- GitHub is the source of truth
- Noter does not yet store branch parentage
- arbitrary drag-and-drop would imply semantic re-parenting that does not
  currently exist in GitHub or in Noter's data model

So the right v1 transfer is:

- copy the visual hierarchy
- do not copy arbitrary drag-to-reparent behavior

## What Does Not Map Cleanly

## Do not pretend Git's DAG is a tree

TST works because tabs really can be treated as a tree of openers and
descendants.

Git branches and commits are not the same:

- commit history is a DAG
- branches may fork from non-default branches
- branches may be rebased
- PR base branches may change over time

So TST should inspire the branch/PR representation, not the commit graph
representation.

If Noter wants a commit graph, it should remain a separate git-graph surface.

## Do not infer branch ancestry from branch names

Names like `feature/oauth/login` look hierarchical, but they are not reliable
parent pointers.

Likewise, ahead/behind versus the default branch does not tell us whether
`feature/b` is based on `feature/a` or directly on `main`.

A truthful nested branch tree requires explicit parentage data.

## Mobile should not copy the desktop sidebar literally

Noter's mobile constraints are different from TST's desktop-first sidebar model.

For Noter, the implication is product-level rather than implementation-level:

- the desktop tree can be persistent
- mobile should likely flatten or sheet the same information
- do not force a narrow, deeply indented desktop tree UI into mobile cards

## Data Gaps and Backend Implications

## What Noter can already support without schema changes

Today Noter can ship a useful TST-inspired v1 with existing data:

- branch root nodes
- optional PR child node
- default-branch pinning
- draft markers
- labels
- preview links
- ahead/behind
- staged counts

## What requires new data for a true stacked branch tree

If the product wants branch-to-branch nesting, add first-class parentage such
as:

- `pullRequestBaseBranch`
- `pullRequestHeadBranch`
- or a normalized `parentBranch`

The safest source would be synced PR base/head refs, not heuristics.

Without that, any deeper branch nesting would be visually impressive but
semantically fragile.

## Likely next metadata fields if the tree becomes the main triage surface

The following would materially improve a TST-style branch tree:

- `pullRequestReviewState`
- `pullRequestReviewCommentsCount`
- `pullRequestUpdatedAt`
- `activeAgentCount`
- `activeAgentNames` or agent summaries
- persisted per-user collapse / pin state

These fields would let the branch tree surface "what needs attention" without
opening every branch.

## Proposed Incremental Rollout

## Phase 1. TST-style row layout without changing backend truth

Ship:

- TST-inspired branch indentation / chevrons
- persistent collapse state
- default branch pinned at top
- branch row metadata reorganized into fixed slots

Do not ship yet:

- nested branch ancestry
- drag-and-drop re-parenting

## Phase 2. PR child nodes

Ship:

- one optional PR child row under each branch
- collapsed-parent alias / counter when PR child has active state
- better scanability for draft PRs and review work

This is the first phase where the branch list becomes recognizably TST-like.

## Phase 3. Tree companion surfaces

Ship:

- richer search/filter companion panel
- agent presence markers
- review / activity counters
- sticky important branches

This follows TST's "small core plus helper surfaces" philosophy.

## Phase 4. True stacked branch tree, only if parentage becomes explicit

Ship only after syncing parent relation:

- branch A shown as child of branch B
- stacked PR representation
- ancestor-aware collapse behavior

Until then, keep the tree shallow and honest.

## Recommendation

Use Firefox Tree Style Tab as the representation language for Noter's branch/PR
surface, but not as a literal browser-tab clone.

The recommended product direction is:

1. Keep branches as the root items.
2. Show open PRs as optional child nodes beneath their branch.
3. Treat badges, counters, preview links, and agent presence as fixed metadata
   slots on those nodes.
4. Persist collapse state per user.
5. Keep filters/search as a secondary companion surface.
6. Do not show deeper branch nesting until parentage is synced explicitly.

In short:

- TST is a good model for branch/PR triage.
- It is not a good substitute for a Git commit graph.
- Noter can adopt the visual grammar now, and the full stacked-branch tree later
  if the data model grows to support it.

## Sources

External sources consulted on 2026-03-26:

- Firefox Add-ons: Tree Style Tab
  - <https://addons.mozilla.org/en-US/firefox/addon/tree-style-tab/>
- Tree Style Tab repository / project policy
  - <https://github.com/piroor/treestyletab>
- Tree Style Tab API for other addons
  - <https://github.com/piroor/treestyletab/wiki/API-for-other-addons>
- Tree Style Tab Extra Tab Contents API
  - <https://github.com/piroor/treestyletab/wiki/Extra-Tab-Contents-API>
- Tree Style Tab helper addons list
  - <https://github.com/piroor/treestyletab/wiki/Helper-addons-extending-functionality-of-TST>
- Tree Style Tab SubPanel API
  - <https://github.com/piroor/treestyletab/wiki/SubPanel-API>
- GitHub REST API pull requests docs
  - <https://docs.github.com/en/rest/pulls/pulls>
