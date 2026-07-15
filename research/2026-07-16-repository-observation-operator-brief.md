# Repository Observation Operator Brief

## Document Control

- Status: Active operator input
- Owner: Samebase operator
- Captured: 2026-07-16
- Purpose: Preserve the operator's requirements, permissions, and exploration direction across task
  compaction before a final proposal or accepted contract exists.
- Related current contract: `specs/114_GITHUB_REPOSITORY_INVENTORY_SPEC.md`

This document is input to exploration, not an accepted implementation design. Evidence belongs in
research, a concrete proposal belongs in an RFC, and accepted behavior belongs in specs.

## Primary Outcome

Samebase should present repository information that is as fresh as practical and complete for the
surface where it appears. The system must work well along both scaling axes:

1. one selected repository with many branches or pull requests;
2. many vaults whose ordinary case is a small repository centered on its default branch.

Correctness, explicit state, bounded provider cost, and sustainable data ownership matter more than
preserving the current implementation or its derived data.

## Verbatim Operator Direction

> I only care that the data in /vault/<org>/<repo> is as new as possible and all the data is present
> in the UI. I don't want things missing

> The most important thing is that we don't maintain backwards compatibility or maintain code that
> just drags us down.

> I'm still the only real user, so if necessary I could remove all my existing vaults. If there's a
> better/more natural way to design the data that we hold, we should do that now. Any backwards
> compatibility would just slow us down later

> Yes, we need filtering. It's a bit concerning you decide to remove that feature

> yes add filtering back. Of course the implementation should be based on the new realities

> The PR row can therefore show something like: ↑6 ↓2 vs main · +1,240 −318 · 17 files

> I like that.

> I like that. Make sure you save the requirement for ahead/behind, etc. and everything we discussed
> and then start implementing. But at each point make sure you don't just add code without thinking
> about performance or sustainability. If something would make the system be slow, or require too
> many requests or graphql points. Or create any kind of pain-point, you are free to stop and
> explain that in detail. Or implement but add very clear guardrails and explanations, etc.
>
> Don't forget that I'm still the only real user. So backwards compatibility with existing data
> doesn't need to be taken into account. The most important thing is thinking about clear and
> explicit data modeling. This is one of the steps I'll have to manually review so it's important
> that there aren't any simple mistakes or bad mental model states so I don't loose my time.
>
> Something that you also may take into account. Initially all the vaults were in a single page in
> /home but we switched to showing the branches in their own page since it was hard to implement
> pagination. Now the list of vaults is very simple. But I think a better compromise is to make the
> list of vaults contain useful information. The only initial downside appeared when we had like 100
> of branches. But my expectation is that for lots of apps there's only main, and other PRs should
> be closed. So this flow of many vaults with a single branch should also be optimized for by making
> the /vault or even the left-sidebar in /vault/<org>/<repo> (since it should be the same component)
> contain useful information. I guess we should show only the main branch. There's also the option
> to show the top 2 or 3 branches. But I think we should focus on showing just info about the main
> branch. I'm telling you this so that you can take a holistic look at the data modeling. Because
> you mentioned that you refresh the data only when we're on a specific <org>/<repo> but I'd still
> want to see updates for the other vaults, since the expectation is that we have lots of vaults,
> not only a vault with lots of branches.
>
> So the reloading/refreshing has to be thought of on this axis also.

> I don't want to make initial decisions without there being a deep exploration + implementation.
> Your transition to graphql removed some stuff but then I noticed what was important to me and it
> was easier to recover the mental model. So I gave kinda what I want in my previous model. And I
> want you to explore that direction and even probably check the app yourself. You should be free to
> create new apps with "tmp-" prefix or connect with existing repos from nicu-chiciuc. As long as
> you don't start deleting code it's fine. This seems more of a read access so it should be fine.
>
> Should the goal be that small. I'd want you to save somewhere my descriptions so that during
> compactions nothing is lost.

> In this case I assume you have all the knowledge and requirements and direction in which you need
> to go. So you are free to do it as you see fit. You can also set your goal yourself and update it
> if necessary.

## Required Product Information

### Selected repository

- A published repository view is complete and internally consistent, never an accidental partial
  result.
- Branches and open pull requests remain discoverable at large counts through bounded pagination.
- Pull request filtering remains a first-class feature built on the current snapshot model.
- Branch rows report commits ahead of and behind the repository default branch.
- Pull request rows report commits ahead of and behind their actual base branch.
- Fork pull requests and pull requests targeting nondefault bases are represented explicitly, not
  approximated as ordinary default-branch pull requests.
- Pull request rows report additions, deletions, and changed-file count. The intended compact form
  is `up 6 down 2 vs main | +1,240 -318 | 17 files`; final iconography and punctuation remain a UI
  decision.
- Checks, commit statuses, labels, identity, and freshness remain complete.
- Newest or most recently updated pull requests are prioritized in the initial bounded view.

### Multiple vaults

- `/vault` should provide useful repository information rather than only navigation.
- The vault list and the selected-vault sidebar should share the same summary behavior and component
  model.
- The ordinary many-vault case is expected to contain repositories centered on one default branch.
- A fixed-size default-branch summary is the leading hypothesis. Showing two or three branches is
  not accepted and must earn its additional complexity through evidence.
- Nonselected vaults should still become fresh enough to make the list useful.
- Refresh cost must remain bounded as both vault count and selected-repository size grow.

## Exploration Method

- Implementation is an exploration tool. Do not require the operator to accept a complete abstract
  model before runnable evidence exists.
- Inspect and operate the real local app, not only unit fixtures or code paths.
- Use `samebase/samebase` as a large pull request case.
- Connect suitable repositories owned by `nicu-chiciuc` for small-repository and multi-vault cases.
- Samebase-managed temporary resources must use the exact `tmp-<worktree-id>-<intent>` prefix
  required by the repository workflow.
- Keep initial provider interaction read-only. If a later experiment needs a GitHub write, isolate
  it to an explicitly safe temporary repository or stop and explain the need first.
- During exploration, preserve existing production code. Replacement and deletion come only after
  the replacement has been exercised and reviewed.
- Failed experimental code must not become a compatibility layer.

## Performance And Sustainability Guardrails

Every retained design must identify and measure:

- GitHub HTTP request count and returned GraphQL point cost;
- collection wall time and retry behavior;
- scaling with vault, branch, pull request, label, and check counts;
- Convex documents and bytes read and written;
- reactive subscription count and invalidation scope;
- browser payload, pagination, and replacement-snapshot behavior;
- provider cooldown and partial-failure behavior;
- which prior implementation becomes removable.

Stop and explain before retaining a design that:

- performs unbounded provider or database work;
- multiplies full repository work across every vault merely because one vault surface is visible;
- publishes partial data as authoritative;
- creates one live subscription per row or per unbounded page;
- hides missing provider data behind optional fields with no explicit unavailable state;
- consumes materially more GitHub capacity without a measured product benefit;
- adds compatibility or fallback state for derived data that can be rebuilt cleanly.

When a measured tradeoff is acceptable, encode its limit and failure behavior explicitly in the data
model, tests, and durable contract.

## Explicit Non-Requirements

- Preserve existing derived inventory, refresh history, check caches, or temporary vault data.
- Keep manual refresh or focus behavior solely for compatibility.
- Adopt GitHub App installation authorization or webhooks as part of this exploration unless later
  evidence makes a separate authorization project necessary.
- Delete existing implementation during the exploratory phase.

## Questions To Resolve Through Evidence

- What fixed-size default-branch summary makes `/vault` and the sidebar useful?
- Can multiple repository summaries be batched economically per GitHub account?
- Which vaults should refresh while `/vault` or a selected-vault sidebar is visible?
- How stale may a nonselected vault summary become before it loses product value?
- Can pull request comparisons be batched without high latency or point cost for repositories with
  hundreds or thousands of open pull requests?
- Which summary and full-inventory states must be serialized to prevent an older crawl from
  overwriting a newer observation?
- What should remain visible when summary or full-inventory refresh fails?

These are research questions, not requests for the operator to decide before the app and provider
behavior have been exercised.
