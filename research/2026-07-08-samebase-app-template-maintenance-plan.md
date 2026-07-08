# samebase/app Template Maintenance Plan

Date: 2026-07-08

Question: how should the `samebase/app` starter template repo be maintained, given that its curated
commit-by-commit teaching history was the founding idea, the discipline degraded over time, the
stale `main` still shows the notermd/Cloudflare-Pages era, and the live line is
`v5-tanstack-start-workers`?

Operator framing (2026-07-08): each edition starts as a new orphan branch so `main` carries only the
necessary commits; each step is as small as possible so it is easy to see what is inside; keeping
the history perfectly clean forever is not sustainable — "works for the beginning but with time we
kinda have to not be so focused on that."

Method: three parallel research lanes (git archaeology of the samebase/app clone, monorepo
integration surface, GitHub mechanics + prior art), synthesized in the main thread. Evidence anchors
are commit shas in samebase/app and `file:line` in this monorepo.

## What the history actually is

Five unrelated root commits; the repo is a series of fresh-start edition lineages, not one history.
Only two branches matter:

- `main` (default): 21 commits, tip `2db6884` (2026-05-05). TanStack Router + Cloudflare Pages era,
  notermd-era README. Everything functional is superseded by v5; the only unique content is
  `README.ro.md` and some README prose.
- `v5-tanstack-start-workers`: 37 commits, tip `922faf2` (2026-07-06), fully linear, no merge
  commits, orphan root `8a85721`. No shared history with `main` (`git merge-base` finds none), so
  the move to `main` is a branch swap, never a merge.

The other ten branches are dead: `dev` (fully contained in `main`), `v0`–`v4` edition experiments,
three squash-merged `codex-*` PR sources, one abandoned Base UI experiment.

v5's shape confirms the operator framing exactly:

- Commits 1–20 (`088f8c3`..`a1f1798`, 2026-05-14/17) are disciplined numbered teaching steps, each
  adding its own `REPO_HISTORY.md` section in the same commit — 1:1 through step 20.
- The next 16 commits are the degradation tail: 9 have no `REPO_HISTORY.md` trace at all (including
  the 484-line prerender feature `accbaf0`), 3 reverse earlier steps (`a62cc00` reverses step 4's
  `@/*` alias for package imports; `1f93187` reverses step 5's Geist font; `922faf2` reverses step
  20's `PROD_CONVEX_DEPLOY_KEY` naming), and 2 are notermd→samebase rebrand churn (`f82dfc2`,
  `155f7fa`).

`REPO_HISTORY.md` is hand-written, not generated, and currently lies about the tree in two places:
§4 still teaches the abandoned `@/*` alias (tip uses package `imports` since `a62cc00`), and §22
still names `PROD_CONVEX_DEPLOY_KEY` with no supersession note (renamed back in `922faf2`).

## The load-bearing fact: the file outreaches the git log

`REPO_HISTORY.md` ships inside the seed manifest, so every repo created through Samebase — and every
"Use this template" copy, which GitHub always squashes to a single commit — receives the teaching
narrative as a file while receiving zero git history. Forking is the only way anyone ever sees the
curated commits. Curation effort therefore ranks:

1. `REPO_HISTORY.md` correctness (reaches everyone),
2. commit-sequence cleanliness (reaches forkers and agents reading the repo),
3. commit-count aesthetics (nice, not load-bearing).

## What the monorepo depends on

Nothing in the monorepo depends on template git history — only on tree content:

- `scripts/export-samebase-app-manifest.ts:15` pins
  `defaultSourceBranch = "v5-tanstack-start-workers"`; the script resolves the branch to a tip sha
  and downloads that one commit's tarball (no `.git`, no history).
- `apps/samebase/convex/starterSeedManifest.test.ts:8` asserts the branch name exactly; shas are
  matched by regex only. The remaining assertions (`:44-137`) are content strings (README deploy-key
  wording, guest-name flow, no-webfont) — they guard content changes, not rewrites.
- Runtime seeding (`starterSeed.ts`) reads `files`/`binaryFiles`/`fileModes` and never reads
  provenance. No CI job runs or freshness-checks the export; it is manual by design.
- Shipped template content contains zero `github.com/samebase/...` URLs and zero branch names, so
  neither the rename nor the rewrite touches seeded output.

## Mechanics and prior art

- "Use this template" copies the default branch only and always squashes to one commit; forks
  preserve full history. Private templates are usable only by people with repo access, so the
  visibility flip is the release mechanism.
- Rename-based default swap is the clean move (GitHub retargets URLs and PR bases; commit objects
  untouched). Force-pushing over `main` would work but skips the server-side retargeting and buries
  the old edition namelessly.
- History rewrites are free while the repo is private (no forks can exist). After publication, the
  README's "fork for the history" invitation makes rewrites breaking. **Going public is the hard
  deadline for the one-time re-curation.**
- Prior art converges on the same model: chibicc (commit-per-book-section, fixes applied at the
  introducing commit, standing force-push warning in the README, old edition kept as a
  `historical/old` branch); microblog (one commit per chapter, editions maintained by rebase +
  force-push with tags re-pointed, old editions frozen); redux-essentials (squashed starting point
  for users, curated steps on a separate branch — samebase/app gets this split for free because the
  template button and seed manifest already deliver squashed content). Common rules: one linear
  branch, never merge into the teaching line, freeze editions under names.

## Recommended model: curated prefix per edition, tolerated tail, re-curate at boundaries

The founding idea and the degradation are not in conflict — they are the two phases of an edition's
life. Make that the explicit policy instead of a failure:

1. **Edition start** (new orphan branch, as with v0–v5): hand-curated numbered steps, each as small
   as possible, each adding its own `REPO_HISTORY.md` section in the same commit.
2. **Edition life**: normal small PRs append to `main`. A commit that teaches something new gets a
   number and a section; fixes and churn land unnumbered without guilt. Unnumbered commits are fold
   candidates by definition — no ongoing rebasing, no fix-at-the-introducing-commit discipline
   (chibicc's policy is right for a book, too expensive for a solo operator shipping a product).
3. **Re-curation events** are rare and named: (a) once, now, before the repo goes public — the only
   free window; (b) at the next edition boundary (v6 = next stack-story change), where the tail's
   lessons get folded into the new edition's curated prefix anyway.
4. **A reversal of an earlier step is the fold trigger.** A history that teaches an approach and
   later reverses it (deploy-key naming, Geist, `@/*` alias) is worse than no step at all — an agent
   reading the story learns the wrong thing first. Reversals do not wait for the edition boundary;
   they justify a rewrite while private, and a numbered "we changed our minds because X" step after
   publication.
5. **After publication, `main` history is frozen** — append-only. If a mid-edition rewrite ever
   becomes necessary anyway, adopt chibicc's loud standing README warning first; otherwise cut v6.

## The one-time migration (do before the repo goes public)

Template repo, on a scratch branch (`git rebase -i --root` driven non-interactively via
`GIT_SEQUENCE_EDITOR`, with `-x` running the build per step so every step still compiles; review
with the two-range form of `git range-diff`):

Re-curate 37 commits → ~20, folding the tail into the steps it belongs to:

| New step                                  | Folds in                                      |
| ----------------------------------------- | --------------------------------------------- |
| 0. empty commit                           | `8a85721`                                     |
| 1. initialize vite plus application       | `088f8c3`                                     |
| 2. add React and TanStack Start           | `6f4034c`                                     |
| 3. add Tailwind CSS                       | `7da0290`                                     |
| 4. add package import aliases             | `3af85f1` + `a62cc00`                         |
| 5. initialize shadcn/ui                   | `75ecb9f` + `1f93187` + `83ec6e4`             |
| 6. enforce Oxc formatting                 | `938eb92`                                     |
| 7. add the shadcn primitives              | `03d7d75`                                     |
| 8. add Convex                             | `4fd4f0a`                                     |
| 9. add Convex AI files                    | `2ea5fc4`                                     |
| 10. add the todo example                  | `a5fbf6f`                                     |
| 11. add the QR share block                | `2d0cc55`                                     |
| 12. add the local dev workflow            | `f8ce564` + `7e45f5e`                         |
| 13. deploy static assets with Workers     | `8d532df` + `ecf7eea`                         |
| 14. teach Workers self-deployment         | `ede4d69` + `548b2cb`                         |
| 15. dynamic Worker name + Node 24 scripts | `6ff01dd` + `5929490` + `830b32d` + `5df04d0` |
| 16. Convex deploy keys (final contract)   | `a1f1798` + `2932b48` + `922faf2`             |
| 17. add guest auth                        | `62d7848` + `4e8dd96` + `f216b20` + `e6ea4c9` |
| 18. show authors and harden todo limits   | `8699cd9` + `5c08750`                         |
| 19. add home and about prerendering       | `accbaf0` (gains its missing section)         |

The rebrand commits (`f82dfc2`, `155f7fa`) disappear — samebase naming baked into every step.
`REPO_HISTORY.md` is rewritten alongside: sections 4, 5, 12, 13, 15, 16, 17 updated to the folded
end state, §19 added for prerendering, the §20/§22-vs-§23 supersession churn deleted. The step-16
fold is the flagship: four commits and ±400 lines of deploy-key back-and-forth collapse into one
step teaching the final contract (`CONVEX_DEPLOY_KEY` only on `main`, `PREVIEW_CONVEX_DEPLOY_KEY`
required otherwise, fail-closed).

Then the branch swap, in order:

1. Rename `main` → `v3-router-pages` (it is the v3 lineage's final form; GitHub retargets URLs).
2. Point `main` at the re-curated line (push the scratch branch as `main`).
3. Keep `v5-tanstack-start-workers` frozen at `922faf2` as the pre-rewrite record until the monorepo
   flips, then optionally delete or keep as the edition archive.
4. `gh repo edit samebase/app --default-branch main`.
5. Delete the dead branches: `dev`, the three squash-merged `codex-*` sources,
   `codex/shadcn-base-ui-history`. Keep `v0`–`v4` as the edition museum (they cost nothing and
   document the fresh-root convention).

Monorepo follow-up (complete required set, from the integration sweep):

1. `scripts/export-samebase-app-manifest.ts:15` — `defaultSourceBranch = "main"`.
2. `apps/samebase/convex/starterSeedManifest.test.ts:8` — expect `"main"`.
3. `SAMEBASE_TEMPLATE_GITHUB_TOKEN=… pnpm template:export` to regenerate the manifest (content
   changes only where the fold changed the tree; the string assertions in
   `starterSeedManifest.test.ts:44-137` are the acceptance gate).
4. Run the starter-seed test files.
5. Optional same-PR alignment: `specs/101_CLOUDFLARE_WORKERS_SINGLE_STACK_MIGRATION_SPEC.md:222`
   export-command example. `specs/005_STARTER_TEMPLATE_STRATEGY_SPEC.md:245` ("Default branch is
   `main`") becomes true again with no edit.

At the go-public moment (separate, later): flip visibility; drop the "private today" sentences in
`apps/samebase/src/content/docs-do-it-yourself.md` and `docs-the-stack.md` and add the repo link;
optionally revisit spec 088's mirrored media now that raw URLs are stable.

## What was deliberately not adopted

- **Tags per step** (microblog's pattern): derived output the operator does not need yet; numbered
  subjects carry the same information. Revisit only if stable per-step public links become a docs
  requirement after publication.
- **A STEP file per commit, or generating `REPO_HISTORY.md` from commit messages** (git-tutor): the
  file must ship in the tree to reach template-button and seeded users, so it cannot be replaced by
  commit messages; hand-maintained sections stay the source of truth. The tool itself is abandoned
  (nodegit dependency).
- **Continuous chibicc-style history repair**: right for a book whose commits are the product, too
  expensive for a solo operator; the edition model gets the same public artifact quality with
  bounded effort.
- **jj / git-revise tooling**: a single ~30→20 commit pass does not justify new tooling; plain
  `git rebase -i --root -x` plus `git range-diff` suffices.

## Open decisions

1. Fold granularity for guest auth: one step or two (17+18)? Two keeps steps smaller, which is the
   stated core value; recommendation: two.
2. Whether the Romanian `README.ro.md` from the old `main` (`5b4865f`) should be carried into the
   new edition or dropped until the English README stabilizes; recommendation: drop for now,
   delete-first.
3. Timing: the re-curation is independent of RFC 093's eval rounds, but the eval keeps reading the
   README through the corpus story — doing the rewrite before eval round 2 avoids grading against a
   template that is about to change.
