# Open PR Dashboard

Snapshot date: 2026-03-21

This note tracks the open pull request queue as of 2026-03-21. The effort label
is the likely pickup cost to get a branch into merge-ready shape from where it
stands today, not the effort already spent building it.

Effort legend:

- `XS`: under 30 minutes
- `S`: 30-60 minutes
- `M`: 1-2 hours
- `L`: 2-4 hours
- `XL`: half-day or more

## Best First

- [PR #291](https://github.com/noter-md/noter/pull/291)
  `Research TypeScript Lisp-like surface syntax` is the cleanest quick win: two
  files, docs-only, clean merge state, green CI, and no major review findings.
- [PR #290](https://github.com/noter-md/noter/pull/290)
  `docs: add dashboard branch preview RFC` is another docs-only draft with green
  checks and no meaningful technical blocker beyond deciding whether to keep the
  RFC.
- [PR #226](https://github.com/noter-md/noter/pull/226)
  `Add branch conversation stack dashboard spec` is already green and appears to
  need only the portable-path cleanup from review.
- [PR #233](https://github.com/noter-md/noter/pull/233)
  `Add Codex thread storage research` has one tiny wording fix. The CI failure
  called out in the PR notes appears to be unrelated lint/test noise.
- [PR #289](https://github.com/noter-md/noter/pull/289)
  `docs: capture /logo auto-rotation stutter findings` is docs-only and green,
  but still has two review asks to clean up the note.
- [PR #231](https://github.com/noter-md/noter/pull/231)
  `Add Daytona shared repo cache spec` is still a low-risk pickup, but it needs
  a pass on ownership/runtime details and measurable acceptance criteria.

## Medium Pickups

- [PR #273](https://github.com/noter-md/noter/pull/273)
  `Add Cloudflare SHA blob storage RFC` is not much code, but the current review
  correctly points out that it belongs under `rfcs/`, not `specs/`, so it needs
  structural cleanup.
- [PR #244](https://github.com/noter-md/noter/pull/244)
  `docs: add vault repository identity refresh spec` is still spec-only, but the
  stale-lock semantics and date cleanup need a real edit rather than a one-line
  fix.
- [PR #204](https://github.com/noter-md/noter/pull/204)
  `Remove Daytona fish shell path` looks close, but it still wants the remaining
  small cleanup review items and a rebase.
- [PR #288](https://github.com/noter-md/noter/pull/288)
  `Make vault refresh status clickable` is a small code PR, but the remaining
  review points are product-significant: retry affordance after failed first
  refresh and better accessibility text.
- [PR #132](https://github.com/noter-md/noter/pull/132)
  `Add Cloudflare branch deployment research spec` is small, but it is old,
  unstable, and likely partially superseded by newer Cloudflare preview work.
- [PR #201](https://github.com/noter-md/noter/pull/201)
  `spec: define noter platform cutover mcp surface` is spec-only, but it is old,
  red, and under-described in its current PR body, so it needs revalidation
  before spending much time.
- [PR #182](https://github.com/noter-md/noter/pull/182)
  `docs: add branch actor presence spec` is still a docs branch, but the
  unresolved schema and timeout behavior make it more design-heavy than a normal
  doc cleanup.

## Deep Work

- [PR #292](https://github.com/noter-md/noter/pull/292)
  `Dock repository chat into the editor` is real product work, not cleanup. It
  is green and clean, but it is still a draft and deserves an editor UX pass
  before merge.
- [PR #286](https://github.com/noter-md/noter/pull/286)
  `Refine stepped notch button defaults` touches shared button ownership, visual
  fixtures, and generated UI policy. It also had a failed CI run and still has
  follow-up review nits.
- [PR #253](https://github.com/noter-md/noter/pull/253)
  `Allow logged-in users to save logo presets` is meaningful product work with
  schema, mutation, and UI changes plus review asks around data integrity and
  accessibility.
- [PR #263](https://github.com/noter-md/noter/pull/263)
  `Add transform-based logo transition lab` is green, but it still has multiple
  geometry/test follow-ups and is a larger mental load than the docs queue.
- [PR #220](https://github.com/noter-md/noter/pull/220)
  `Add isometric logo preview studies` is a large experimental UI branch with
  multiple review asks and stale merge state.
- [PR #279](https://github.com/noter-md/noter/pull/279)
  `Prototype projected logo dot lattice` explicitly documents that the landing
  result is still not acceptable, so it is more of a preserved experiment than a
  quick merge candidate.
- [PR #232](https://github.com/noter-md/noter/pull/232)
  `Remove Turborepo task orchestration` is the broadest coordination-heavy
  branch in the queue. Even though current checks are green, it still carries
  starter-template, runtime, and security review items across a wide repo
  surface.

## Cluster Notes

- Cloudflare preview/documentation cluster:
  [#132](https://github.com/noter-md/noter/pull/132),
  [#273](https://github.com/noter-md/noter/pull/273),
  [#290](https://github.com/noter-md/noter/pull/290)
- Daytona/runtime cluster: [#204](https://github.com/noter-md/noter/pull/204),
  [#231](https://github.com/noter-md/noter/pull/231),
  [#232](https://github.com/noter-md/noter/pull/232),
  [#244](https://github.com/noter-md/noter/pull/244)
- Logo and landing experiments:
  [#220](https://github.com/noter-md/noter/pull/220),
  [#253](https://github.com/noter-md/noter/pull/253),
  [#263](https://github.com/noter-md/noter/pull/263),
  [#279](https://github.com/noter-md/noter/pull/279),
  [#289](https://github.com/noter-md/noter/pull/289)
- Product UX and collaboration work:
  [#288](https://github.com/noter-md/noter/pull/288),
  [#292](https://github.com/noter-md/noter/pull/292)

## Full Inventory

| PR                                                 | Area                      | Current state                           | Effort | Next action                                          |
| -------------------------------------------------- | ------------------------- | --------------------------------------- | ------ | ---------------------------------------------------- |
| [#291](https://github.com/noter-md/noter/pull/291) | Research note             | Draft, clean, green                     | `XS`   | Decide whether to keep and mark ready                |
| [#290](https://github.com/noter-md/noter/pull/290) | Cloudflare RFC            | Draft, clean, green                     | `XS`   | Decide whether the RFC should stay open              |
| [#226](https://github.com/noter-md/noter/pull/226) | Dashboard spec            | Ready, clean, green                     | `XS`   | Replace machine-local paths                          |
| [#233](https://github.com/noter-md/noter/pull/233) | Research note             | Ready, dirty, CI red                    | `XS`   | Fix the wording nit and re-run checks                |
| [#289](https://github.com/noter-md/noter/pull/289) | Findings note             | Draft, clean, green                     | `S`    | Address the two doc comments                         |
| [#231](https://github.com/noter-md/noter/pull/231) | Daytona spec              | Ready, clean, green                     | `S`    | Clarify ownership and measurable gates               |
| [#273](https://github.com/noter-md/noter/pull/273) | Storage RFC               | Ready, dirty                            | `S`    | Move it out of `specs/` into `rfcs/`                 |
| [#244](https://github.com/noter-md/noter/pull/244) | Vault refresh spec        | Ready, dirty, green                     | `S`    | Tighten lock semantics and metadata                  |
| [#204](https://github.com/noter-md/noter/pull/204) | Daytona cleanup           | Ready, dirty, green                     | `S`    | Clear remaining nitpicks and rebase                  |
| [#288](https://github.com/noter-md/noter/pull/288) | Dashboard UX              | Draft, small code PR, green             | `M`    | Fix retry affordance and a11y issues                 |
| [#132](https://github.com/noter-md/noter/pull/132) | Cloudflare research       | Ready, unstable, CI red                 | `M`    | Revalidate relevance, then fix stale reference       |
| [#201](https://github.com/noter-md/noter/pull/201) | Cutover spec              | Ready, dirty, CI red                    | `M`    | Reassess whether it is still current                 |
| [#182](https://github.com/noter-md/noter/pull/182) | Presence spec             | Ready, dirty, CI red                    | `M`    | Resolve schema/timeouts before cleanup               |
| [#292](https://github.com/noter-md/noter/pull/292) | Editor chat UX            | Draft, clean, green                     | `L`    | Review the product behavior in-app                   |
| [#286](https://github.com/noter-md/noter/pull/286) | Button visual system      | Ready, review follow-ups, prior CI fail | `L`    | Decide whether to keep the button exception path     |
| [#253](https://github.com/noter-md/noter/pull/253) | Logo presets feature      | Ready, dirty                            | `L`    | Fix schema invariants and form accessibility         |
| [#263](https://github.com/noter-md/noter/pull/263) | Transform lab             | Ready, clean, green                     | `L`    | Close geometry/test follow-ups                       |
| [#220](https://github.com/noter-md/noter/pull/220) | Isometric logo experiment | Ready, dirty                            | `XL`   | Rebase and decide whether the experiment should ship |
| [#279](https://github.com/noter-md/noter/pull/279) | Landing dot lattice       | Ready, dirty, known visual gap          | `XL`   | Rework the landing result before merge               |
| [#232](https://github.com/noter-md/noter/pull/232) | Repo build tooling        | Ready, clean, wide-scope                | `XL`   | Handle starter/runtime/security review items         |
