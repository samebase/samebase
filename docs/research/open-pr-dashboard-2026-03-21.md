# Open PR Dashboard

Snapshot date: 2026-03-21 Last refreshed: 2026-03-21

This note tracks the open pull request queue as of 2026-03-21. The effort label
is the likely pickup cost to get a branch into merge-ready shape from where it
stands today, not the effort already spent building it.

Since the first pass on this dashboard, five new PRs entered the queue
([#300](https://github.com/noter-md/noter/pull/300),
[#299](https://github.com/noter-md/noter/pull/299),
[#297](https://github.com/noter-md/noter/pull/297),
[#296](https://github.com/noter-md/noter/pull/296),
[#295](https://github.com/noter-md/noter/pull/295)), and two previously-open PRs
are no longer in the open queue
([#253](https://github.com/noter-md/noter/pull/253),
[#263](https://github.com/noter-md/noter/pull/263)).

Effort legend:

- `XS`: under 30 minutes
- `S`: 30-60 minutes
- `M`: 1-2 hours
- `L`: 2-4 hours
- `XL`: half-day or more

## Best First

- [PR #291](https://github.com/noter-md/noter/pull/291)
  `Research TypeScript Lisp-like surface syntax` is still the cleanest quick
  win: two files, docs-only, clean merge state, and green checks.
- [PR #299](https://github.com/noter-md/noter/pull/299)
  `Add dashboard and Vite+ research docs` is another clean docs-only branch with
  green checks and no visible review blockers.
- [PR #297](https://github.com/noter-md/noter/pull/297)
  `Add ProseMark Tailwind/static rendering research RFC` is clean, green, and
  narrowly scoped.
- [PR #226](https://github.com/noter-md/noter/pull/226)
  `Add branch conversation stack dashboard spec` remains green and still looks
  like a portable-path cleanup rather than a deep rework.
- [PR #233](https://github.com/noter-md/noter/pull/233)
  `Add Codex thread storage research` still looks like a one-word fix and
  re-run.
- [PR #290](https://github.com/noter-md/noter/pull/290)
  `docs: add dashboard branch preview RFC` is still docs-only, but it is now
  dirty and needs a rebase before it is a true quick close.
- [PR #289](https://github.com/noter-md/noter/pull/289)
  `docs: capture /logo auto-rotation stutter findings` is now dirty, but it is
  still a small doc cleanup branch.
- [PR #231](https://github.com/noter-md/noter/pull/231)
  `Add Daytona shared repo cache spec` moved back to draft, but it is still a
  low-risk spec branch once someone touches it again.

## Medium Pickups

- [PR #300](https://github.com/noter-md/noter/pull/300)
  `Revise commit review spec for stable sidebar` is a focused code-plus-spec
  branch. It is draft, but the scope is contained and checks are green.
- [PR #296](https://github.com/noter-md/noter/pull/296)
  `Add RFC for Cloudflare + Convex preview deploy sync` is green but dirty, so
  the main work is spec review plus rebase.
- [PR #273](https://github.com/noter-md/noter/pull/273)
  `Add Cloudflare SHA blob storage RFC` is still mostly structural cleanup
  because it belongs under `rfcs/`, not `specs/`.
- [PR #244](https://github.com/noter-md/noter/pull/244)
  `docs: add vault repository identity refresh spec` is now draft and dirty, and
  it still has the stale-lock semantics cleanup pending.
- [PR #204](https://github.com/noter-md/noter/pull/204)
  `Remove Daytona fish shell path` still looks close, but it is older and wants
  a rebase plus the remaining small cleanup items.
- [PR #288](https://github.com/noter-md/noter/pull/288)
  `Make vault refresh status clickable` changed shape since the first pass. It
  is no longer draft, but it is unstable and still has a meaningful retry
  affordance issue open.
- [PR #295](https://github.com/noter-md/noter/pull/295)
  `Fix mobile landing dev toggle jump` is a real product fix, but it is focused,
  and the current visible feedback is only a nit-level comment while CI is still
  in progress.
- [PR #132](https://github.com/noter-md/noter/pull/132)
  `Add Cloudflare branch deployment research spec` is still small, but old,
  unstable, and likely partially superseded by newer Cloudflare preview work.
- [PR #201](https://github.com/noter-md/noter/pull/201)
  `spec: define noter platform cutover mcp surface` remains spec-only, but it is
  old, red, and under-described in its current PR body.
- [PR #182](https://github.com/noter-md/noter/pull/182)
  `docs: add branch actor presence spec` is still more design-heavy than a
  normal doc cleanup because its unresolved schema/timeouts shape the actual
  implementation.

## Deep Work

- [PR #292](https://github.com/noter-md/noter/pull/292)
  `Dock repository chat into the editor` got materially heavier. It is now
  unstable, CI is in progress, and CodeRabbit has actionable comments on state,
  draft save, focus, and vault remount behavior.
- [PR #286](https://github.com/noter-md/noter/pull/286)
  `Refine stepped notch button defaults` is also unstable now and still touches
  shared button ownership plus visual policy.
- [PR #279](https://github.com/noter-md/noter/pull/279)
  `Prototype projected logo dot lattice` remains a preserved experiment with a
  stated visual gap on the landing result.
- [PR #232](https://github.com/noter-md/noter/pull/232)
  `Remove Turborepo task orchestration` is still the broadest coordination-heavy
  branch in the queue.
- [PR #220](https://github.com/noter-md/noter/pull/220)
  `Add isometric logo preview studies` remains a large experimental UI branch
  with stale merge state and multiple follow-ups.

## Cluster Notes

- Cloudflare preview/documentation cluster:
  [#132](https://github.com/noter-md/noter/pull/132),
  [#273](https://github.com/noter-md/noter/pull/273),
  [#290](https://github.com/noter-md/noter/pull/290),
  [#296](https://github.com/noter-md/noter/pull/296)
- Daytona/runtime cluster: [#204](https://github.com/noter-md/noter/pull/204),
  [#231](https://github.com/noter-md/noter/pull/231),
  [#232](https://github.com/noter-md/noter/pull/232),
  [#244](https://github.com/noter-md/noter/pull/244)
- Docs and research queue: [#291](https://github.com/noter-md/noter/pull/291),
  [#299](https://github.com/noter-md/noter/pull/299),
  [#297](https://github.com/noter-md/noter/pull/297),
  [#233](https://github.com/noter-md/noter/pull/233)
- Landing and logo-related work:
  [#295](https://github.com/noter-md/noter/pull/295),
  [#289](https://github.com/noter-md/noter/pull/289),
  [#279](https://github.com/noter-md/noter/pull/279),
  [#220](https://github.com/noter-md/noter/pull/220)
- Product UX and collaboration work:
  [#300](https://github.com/noter-md/noter/pull/300),
  [#288](https://github.com/noter-md/noter/pull/288),
  [#292](https://github.com/noter-md/noter/pull/292)

## Full Inventory

| PR                                                 | Area                      | Current state                          | Effort | Next action                                          |
| -------------------------------------------------- | ------------------------- | -------------------------------------- | ------ | ---------------------------------------------------- |
| [#291](https://github.com/noter-md/noter/pull/291) | Research note             | Draft, clean, green                    | `XS`   | Decide whether to keep and mark ready                |
| [#299](https://github.com/noter-md/noter/pull/299) | Research and ideas docs   | Ready, clean, green                    | `XS`   | Merge or close based on whether the docs are wanted  |
| [#297](https://github.com/noter-md/noter/pull/297) | ProseMark RFC             | Ready, clean, green                    | `XS`   | Decide whether to keep the RFC as current direction  |
| [#226](https://github.com/noter-md/noter/pull/226) | Dashboard spec            | Ready, clean, green                    | `XS`   | Replace machine-local paths                          |
| [#233](https://github.com/noter-md/noter/pull/233) | Research note             | Ready, old, likely one-word fix        | `XS`   | Fix the wording nit and re-run checks                |
| [#290](https://github.com/noter-md/noter/pull/290) | Cloudflare RFC            | Draft, dirty                           | `S`    | Rebase and decide whether the RFC still stands       |
| [#289](https://github.com/noter-md/noter/pull/289) | Findings note             | Draft, dirty                           | `S`    | Rebase and address the document comments             |
| [#231](https://github.com/noter-md/noter/pull/231) | Daytona spec              | Draft, older, low-risk                 | `S`    | Decide whether to revive or close                    |
| [#300](https://github.com/noter-md/noter/pull/300) | Commit review UX and spec | Draft, clean, green                    | `M`    | Product-review the implementation and mark ready     |
| [#296](https://github.com/noter-md/noter/pull/296) | Preview deploy RFC        | Ready, dirty, green                    | `M`    | Rebase and review the preview contract               |
| [#273](https://github.com/noter-md/noter/pull/273) | Storage RFC               | Ready, old, structural cleanup pending | `M`    | Move it into `rfcs/` and refresh                     |
| [#244](https://github.com/noter-md/noter/pull/244) | Vault refresh spec        | Draft, dirty                           | `M`    | Rebase and resolve stale-lock semantics              |
| [#204](https://github.com/noter-md/noter/pull/204) | Daytona cleanup           | Ready, older cleanup branch            | `M`    | Rebase and clear the remaining nitpicks              |
| [#288](https://github.com/noter-md/noter/pull/288) | Dashboard refresh UX      | Ready, unstable, CI in progress        | `M`    | Fix the no-timestamp retry affordance                |
| [#295](https://github.com/noter-md/noter/pull/295) | Mobile landing UX         | Ready, unstable, CI in progress        | `M`    | Wait for CI, then clear the remaining nit            |
| [#132](https://github.com/noter-md/noter/pull/132) | Cloudflare research       | Ready, old, unstable                   | `M`    | Revalidate relevance before spending time            |
| [#201](https://github.com/noter-md/noter/pull/201) | Cutover spec              | Ready, old, red                        | `M`    | Reassess whether it is still current                 |
| [#182](https://github.com/noter-md/noter/pull/182) | Presence spec             | Ready, old, red                        | `M`    | Resolve schema/timeouts before cleanup               |
| [#292](https://github.com/noter-md/noter/pull/292) | Editor chat UX            | Draft, unstable, CI in progress        | `L`    | Address current actionable review feedback           |
| [#286](https://github.com/noter-md/noter/pull/286) | Button visual system      | Ready, unstable                        | `L`    | Rebase and resolve ownership/test follow-ups         |
| [#279](https://github.com/noter-md/noter/pull/279) | Landing dot lattice       | Ready, large experiment                | `XL`   | Rework the landing result before merge               |
| [#232](https://github.com/noter-md/noter/pull/232) | Repo build tooling        | Ready, broad scope                     | `XL`   | Handle starter/runtime/security review items         |
| [#220](https://github.com/noter-md/noter/pull/220) | Isometric logo experiment | Ready, large experiment                | `XL`   | Rebase and decide whether the experiment should ship |
