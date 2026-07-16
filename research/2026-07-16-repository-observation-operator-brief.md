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

## Shared Vocabulary

- **Repository**: the GitHub repository connected to one Samebase vault.
- **Branch**: a named Git ref pointing at a commit.
- **Pull request**: GitHub's review object for a source branch and its current head commit. A pull
  request does not own a separate provider build.
- **Cloudflare Worker**: the long-lived Cloudflare project that receives built code.
- **Hosting project**: a long-lived hosting-provider resource that receives deploys. A Cloudflare
  Worker and a Netlify Site are hosting projects.
- **Build trigger**: Cloudflare Workers Builds configuration connecting a Worker to a GitHub
  repository. It owns the root directory, branch rules, changed-path rules, and commands.
- **Build run**: one provider-reported execution for one hosting project, branch, and commit. A
  build run has an explicit state even when it produces no preview URL.
- **Root directory**: the single Samebase and Cloudflare concept identifying the repository root for
  an app. Samebase's historical `appRoot` name and Cloudflare's `root_directory` must not represent
  different paths. Samebase uses Cloudflare's spelling, including `/` for the repository root,
  rather than storing the same root as `.`. The implementation may rename `appRoot` to
  `rootDirectory`.
- **Immutable preview URL**: a URL whose content never changes. This is Cloudflare's version or
  commit preview URL and Netlify's deploy permalink. Rebuilding the same Git commit can produce a
  new provider version and a new immutable URL.
- **Moving preview URL**: a stable alias whose content advances after a later successful build. A
  Cloudflare branch preview is scoped to a branch. A Netlify Deploy Preview is scoped to a pull
  request, and a Netlify branch deploy is scoped to a branch.
- **GitHub check**: one status attached to a commit, such as CI, Playwright, or a Cloudflare Workers
  Build.
- **Repository snapshot**: Samebase's complete, atomically published view of current branches, open
  pull requests, their head commits, compact check summaries, and provider build information.

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

### Builds, previews, root directories, and checks

The following user stories are approved operator expectations:

- Samebase creates a build record only when GitHub or a hosting provider supplies evidence that a
  build actually ran. It never creates an empty build for every hosting project that could have
  built the commit.
- A Worker omitted by changed-path rules has no build record for that commit. This absence is
  different from a queued, running, failed, cancelled, or successful build.
- Some providers report an explicit skipped build instead of omitting the build. A provider-reported
  skip is a real build record with state `skipped`; Samebase never translates absence into skipped
  or skipped into absence.
- Every recorded build has an explicit state.
- Preview availability is an explicit closed state, not an optional URL whose absence has ambiguous
  meaning. The model must distinguish at least a preview disabled by Worker configuration, a build
  that has not produced a preview yet, a build that cannot produce one because it failed or was
  cancelled, a ready preview result, and provider data that Samebase could not determine.
- A ready preview result preserves every provider-reported URL with its type and scope: immutable
  version, moving branch alias, or moving pull-request alias. They must never be collapsed into one
  scalar or selected through a first-match rule.
- Root directory has one meaning. Samebase must use Cloudflare Workers Builds `root_directory`
  exactly as the app's root instead of inferring a more semantic directory from commands or changed
  paths. Unusual user commands do not create a second Samebase root concept.
- A GitHub Workers Builds check and its preview URLs do not reveal `root_directory`. The check's
  Build ID can resolve the exact build and root through the Cloudflare Workers Builds API when the
  user has connected Cloudflare. Without that access, Samebase may show the Worker and preview URLs
  with the root explicitly unknown. It must never infer the root from a preview hostname.
- An expected unknown root, such as a GitHub-only provider observation, is ordinary product state.
  Recognized provider data that remains incomplete despite available provider access should emit a
  bounded, credential-free diagnostic or metric. Rendering an unknown row must not repeatedly log an
  error.
- Root directory is not hosting-project identity. More than one Worker or hosting project may use
  the same root even though Samebase does not recommend that setup. Samebase identifies each project
  by its provider ID and must handle the case without choosing one arbitrarily.
- A build run may be visible from both its branch row and a pull request whose head is that branch
  and commit. Those are two views of one provider build, not two provider builds.
- GitHub's ordinary check rows are loaded on demand when the user expands the compact check summary.
  They are paginated without silent truncation, briefly cached in the browser, and not copied into
  Convex as an immutable per-check archive.
- The compact check summary opens the inline check list. It does not link to an arbitrary first
  check target. The expanded surface retains an explicit link to GitHub, and each check links to its
  own provider details when available.
- Closed pull requests and historical build attempts remain GitHub and the hosting provider's
  responsibility for this phase.

#### Proposed Netlify plus Convex interpretation

The following interpretation responds to a real operator story but remains subject to operator
confirmation:

- Repository monitoring does not require a hosting-provider connection. A Netlify-hosted repository
  can expose actual builds, build state, and proven preview URLs through GitHub checks while
  `rootDirectory` remains explicitly unknown.
- Netlify monitoring must not restore the removed Netlify OAuth, provisioning, teardown, or account
  model. A small GitHub-check interpreter may recognize proven Netlify build and preview facts.
- A user may declare `rootDirectory` manually when associating a Convex deployment with an app
  hosted by a provider Samebase cannot inspect. Monitoring itself does not require that declaration.
  A later provider connection must match the declared root or surface a conflict; it never silently
  rewrites the app.

Historical context is not a retained product invariant. The app-root-first UI existed partly to
associate a manually selected Convex deployment with a repository folder because GitHub and Convex
do not provide an equivalent of Cloudflare's GitHub App repository connection. It also preserved a
possible Convex-only folder and avoided redesigning an already shipped app-root picker. This history
explains the current model but does not require Samebase to make root declaration a prerequisite for
monitoring. Netlify plus Convex supplies a current reason to retain manual root declaration only for
explicit resource association.

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
- What is the smallest closed preview-result union that represents disabled, pending, failed or
  cancelled, ready, and provider-unknown outcomes without impossible combinations with build state?
- Which exact Cloudflare API response should prove that preview URLs were disabled intentionally,
  rather than omitted because the build or provider observation was incomplete?
- Which provider identifiers prove that a branch row and pull request row refer to the same build
  run while keeping the branch preview URL scoped to the exact branch?
- Netlify separates its build base directory from its monorepo package directory, while Cloudflare
  has one `root_directory`. Which Netlify provider fact, if any, can prove Samebase's root without a
  user declaration requires evidence before a future Netlify connection is designed.

These are research questions, not requests for the operator to decide before the app and provider
behavior have been exercised.
