# Agent Context Thread Sample

## Document Control

- Status: Initial sample manifest
- Date: 2026-05-23
- Source: local Codex JSONL sessions under `/Users/nicu/.codex`
- Related research: `research/2026-05-23-agent-context-extraction-research-plan.md`

## Method

This is the first reproducible manual-review manifest for extracting agent workflow context. It is
not a final representative corpus.

Selection rules:

1. Include only session files whose `session_meta.payload.cwd` contains `/noter`.
2. Remove threads listed in machine-local `pinned-thread-ids` from the baseline.
3. Categorize by first non-bootstrap user request.
4. Sort each category by a deterministic FNV-1a hash of the thread id.
5. Take the first four rows per category for the initial review pass.
6. Keep pinned threads as a separate comparison group.

Current scan counts:

- Non-pinned Noter sessions with extractable first requests: 696
- Pinned Noter sessions with extractable first requests: 20

## Baseline Sample

The first manual review pass covered a twelve-thread subset across the categories below. See
`research/2026-05-23-agent-context-manual-review-pass-1.md` for extracted behavior requirements and
experiment tasks.

| Category                 | Thread id                              | Date       | Source   | Effort | First request signal                                                       |
| ------------------------ | -------------------------------------- | ---------- | -------- | ------ | -------------------------------------------------------------------------- |
| `git_pr_ci_review`       | `019e2d2b-1d1f-7ad2-a4f4-02e421aeb0c9` | 2026-05-15 | archived | xhigh  | Review PR 758.                                                             |
| `git_pr_ci_review`       | `019d4eb3-310f-7da3-8725-8886cc336057` | 2026-04-02 | archived | xhigh  | Screenshot-driven PR/review task.                                          |
| `git_pr_ci_review`       | `019d5856-30db-7c43-8d2c-ef9ba2299d67` | 2026-04-04 | archived | xhigh  | Phone-only connected-machine end-to-end testing issue.                     |
| `git_pr_ci_review`       | `019cf706-76fe-7561-9980-edd539c50258` | 2026-03-16 | active   | xhigh  | Check the PR related to the current branch.                                |
| `ui_visual_routes`       | `019d5585-ff7d-7b62-9344-bcd7575b4f2b` | 2026-04-03 | archived | xhigh  | Landing prerendering and avoiding default heavy downloads.                 |
| `ui_visual_routes`       | `019da7a8-5853-7873-8962-55e90d616e03` | 2026-04-19 | archived | xhigh  | Workspace layout and possible native carousel direction.                   |
| `ui_visual_routes`       | `019dc18f-c0e1-7520-877f-1ce379cc5905` | 2026-04-24 | archived | xhigh  | ProseMark editing and Tailwind styling regression.                         |
| `ui_visual_routes`       | `019dcb99-e758-7791-80c6-86eada7568d9` | 2026-04-26 | archived | xhigh  | ProseMark heading font-size mismatch in dev modes.                         |
| `convex_backend_auth`    | `019e4622-84ae-7292-bdae-23eabb551343` | 2026-05-20 | archived | xhigh  | Persisting Convex account or team identity alongside provider accounts.    |
| `convex_backend_auth`    | `019e4aa0-8c0b-7a20-90f0-02b4d2fd86a5` | 2026-05-21 | archived | xhigh  | Reducing Convex management API wrapper ceremony.                           |
| `convex_backend_auth`    | `019d5508-6226-7ae0-bb0f-41e320719b76` | 2026-04-03 | archived | xhigh  | GitHub auth, SSH avoidance, and local developer setup direction.           |
| `convex_backend_auth`    | `019e0929-70da-7930-8743-9e43a92356cf` | 2026-05-08 | archived | xhigh  | Sidebar/main merge state not persisted across refreshes.                   |
| `code_quality_bugfix`    | `019d01d1-c133-73c3-8713-84236fc5c454` | 2026-03-18 | archived | xhigh  | Web-search tool smoke test from a Noter worktree.                          |
| `code_quality_bugfix`    | `019d0656-5b4f-74c1-8030-2061a847eac7` | 2026-03-19 | archived | xhigh  | Find a prior discussion thread and recover context.                        |
| `code_quality_bugfix`    | `019de5a0-d487-7a03-a384-a10fa7506315` | 2026-05-01 | archived | xhigh  | State management is hard to reason about; search for simplification paths. |
| `code_quality_bugfix`    | `019e4b42-49fd-7b91-9b8b-4db18f1ed11b` | 2026-05-21 | archived | xhigh  | Run Playwright tests locally.                                              |
| `tooling_dev_workflow`   | `019de05b-6bff-7691-97ea-73388e9496ef` | 2026-04-30 | archived | xhigh  | Hide developer tools accordion except in dev query modes.                  |
| `tooling_dev_workflow`   | `019e4c43-e303-7c60-aea3-369009e737dc` | 2026-05-21 | archived | xhigh  | Enable Codex goals feature.                                                |
| `tooling_dev_workflow`   | `019e085e-2eb2-72b0-b5f0-0fd07f5a940c` | 2026-05-08 | archived | xhigh  | Continue from PRs and spec before phase five.                              |
| `tooling_dev_workflow`   | `019d1299-617c-7d52-8d6c-f05f034eed41` | 2026-03-21 | archived | xhigh  | Research import-from-existing-repo positioning and slogan.                 |
| `docs_research_planning` | `019d8801-3cb9-7353-ad80-28b521aa4bfa` | 2026-04-13 | archived | xhigh  | Research a trending competitor signal and compare it to Noter.             |
| `docs_research_planning` | `019e37da-6521-71c3-a95f-e6bd7e60cb47` | 2026-05-17 | archived | xhigh  | Validate a competitor user-count claim.                                    |
| `docs_research_planning` | `019d7ed5-467e-77d2-8ed0-798797fc2bdf` | 2026-04-11 | archived | xhigh  | Research HTML-in-canvas and possible logo-control use.                     |
| `docs_research_planning` | `019d3135-c8a3-7f73-81b7-647928870f96` | 2026-03-27 | archived | xhigh  | Research landing-page copy direction instead of waitlist copy.             |
| `other`                  | `019d4fe9-3922-7721-95ba-9762009e9559` | 2026-04-02 | archived | xhigh  | Find historical Lovable pitch decks and compare changes.                   |
| `other`                  | `019d7ef3-1b2b-7933-aeea-f28497a86c9b` | 2026-04-11 | archived | xhigh  | Check which threads can be safely removed and list them.                   |
| `other`                  | `019d22b4-f5da-7140-b6c1-f4c3b39738fe` | 2026-03-25 | archived | xhigh  | Add logo control for isometric cube side length.                           |
| `other`                  | `019d59b2-4037-7041-ae1e-8bd9d8318ff2` | 2026-04-04 | archived | xhigh  | Upgrade the app to React 19.                                               |

## Pinned Comparison

| Category                 | Thread id                              | Date       | Source | Effort | First request signal                                            |
| ------------------------ | -------------------------------------- | ---------- | ------ | ------ | --------------------------------------------------------------- |
| `ui_visual_routes`       | `019d8793-c2bd-79f1-a8ab-2afe795d4a1c` | 2026-04-13 | active | xhigh  | Mobile keyboard lift behavior for chat and editing.             |
| `other`                  | `019dca2f-d1a9-7ba3-ba0b-7991e976fe4f` | 2026-04-26 | active | xhigh  | Accept lowercase Convex deploy key environment variable.        |
| `code_quality_bugfix`    | `019e5121-b8a5-73c3-ba09-3798a81e9548` | 2026-05-22 | active | xhigh  | Landing logo/theme transition idea.                             |
| `tooling_dev_workflow`   | `019e5121-a6e8-77d0-bce2-652a4e2258e2` | 2026-05-22 | active | xhigh  | Declare a symbolic mark as part of product identity.            |
| `convex_backend_auth`    | `019dcf85-bb64-7c50-a7d6-51538865d1e5` | 2026-04-27 | active | xhigh  | Public route right-sidebar convergence with dashboard shell.    |
| `code_quality_bugfix`    | `019e51ce-37fc-7223-8c43-ab6d67278fef` | 2026-05-22 | active | xhigh  | Extract current repo coding practices and agent context.        |
| `docs_research_planning` | `019e519d-47a9-7b32-bf80-20bac2b87e0f` | 2026-05-22 | active | xhigh  | Find existing logo-stripe research before final implementation. |
| `other`                  | `019e5121-ff16-7932-a469-b450c2f0df4c` | 2026-05-22 | active | xhigh  | Spike URL editor component scope.                               |
| `other`                  | `019e50d1-e23b-7c41-ba74-81968904eeb3` | 2026-05-22 | active | xhigh  | Investigate fine lines in striped logo rendering.               |
| `docs_research_planning` | `019e4c03-3a74-7822-a81c-d742827cbc07` | 2026-05-21 | active | xhigh  | Research Founders Inc. alignment.                               |

## Manual Review Questions

For each selected thread, answer:

1. Which instruction or skill changed agent behavior in a visible way?
2. Which behavior came from general engineering taste rather than repo-specific instructions?
3. Which missing instruction caused a correction, rollback, aborted turn, or later cleanup?
4. Which guidance should be always loaded?
5. Which guidance should be a triggerable skill?
6. Which guidance should remain Noter/operator-specific?
7. Which guidance appears obsolete or overfit to one incident?
