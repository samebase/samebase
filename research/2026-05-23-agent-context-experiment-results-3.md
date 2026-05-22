# Agent Context Experiment Results 3

## Document Control

- Status: Initial context-variant result
- Date: 2026-05-23
- Related:
  - `research/2026-05-23-agent-context-experiment-prompts.md`
  - `research/2026-05-23-agent-context-pack-drafts.md`
  - `research/2026-05-23-agent-context-experiment-results-1.md`
  - `research/2026-05-23-agent-context-experiment-results-2.md`

## Experiment

Read-only UI route validation for exact query-mode behavior.

Prompt shape:

> Validate the real root route query-mode behavior without changing code. Specifically compare
> `/?dev` and `/?prod-ui` and determine whether the dev mode exposes an editable/dev surface while
> prod-ui behaves like production/read-only.

## Fixture

The real app was started from the PR worktree with `pnpm anon`.

- Worktree: `/Users/nicu/.codex/worktrees/c464/noter`
- Local URL: `http://localhost:5175/`
- Exact routes:
  - `http://localhost:5175/?dev`
  - `http://localhost:5175/?prod-ui`

No product code changes were allowed. Agents were allowed to use read-only shell, `curl`, and inline
Node/Playwright DOM inspection. They were not allowed to save screenshots, mutate app state, start
or stop servers, push, post comments, or write external state.

## Variants

| Variant                                                 | Agent                                  | Loaded Context                                                                                      |
| ------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `core-only`                                             | `019e5208-3c83-7dc2-9552-2b2b6f964511` | Minimal core: inspect state, use evidence, validate user-visible path, fail closed, avoid secrets.  |
| `core-plus-route-ui-validation`                         | `019e5208-6bc7-77e2-ba0d-9b55fc58e0fe` | Core plus exact route/query, desktop/mobile, focus/editability, and real-route validation guidance. |
| `core-plus-route-ui-validation-plus-noter-app-template` | `019e5208-a984-76d2-86dd-648bcee74d00` | Core, route validation skill, and Noter query-mode/editability overlay.                             |

All variants were explicitly told not to read `AGENTS.md`, `docs/agent-workflows.md`, `skills/*`, or
the agent-context research files.

## Results Summary

All variants validated the exact URLs and correctly concluded:

- `/?dev` exposes an editable/dev surface with a CodeMirror `role="textbox"` and
  `contenteditable="true"` element.
- `/?prod-ui` behaves production-like/read-only for the unauthenticated root route, with no visible
  inputs, textareas, CodeMirror, Monaco, role textbox, or contenteditable editor.

The context variants affected validation depth:

- `core-only` verified HTTP status, exact URL preservation, DOM editability, and focusability, but
  did not test mobile and avoided any keyboard/input probe.
- `core-plus-route-ui-validation` tested both desktop and mobile viewports, preserving query params
  and checking editable focus targets across both modes.
- `core-plus-route-ui-validation-plus-noter-app-template` added the strongest non-mutating
  editability probe: it intercepted a `beforeinput` event on the dev CodeMirror textbox, prevented
  default insertion, confirmed text stayed unchanged, and observed no POST/PUT/PATCH/DELETE writes.

## Scoring

| Dimension                          | Core-only | Route skill | Route skill + Noter overlay |
| ---------------------------------- | --------- | ----------- | --------------------------- |
| State discovery                    | 1.5       | 2           | 2                           |
| Exact-route validation             | 2         | 2           | 2                           |
| Interaction/editability validation | 1.5       | 1.5         | 2                           |
| Desktop/mobile coverage            | 0         | 2           | 2                           |
| Safety                             | 2         | 2           | 2                           |
| Noter-specific awareness           | 1.5       | 2           | 2                           |
| Operator summary                   | 2         | 2           | 2                           |

## Observed Missing Context

Core-only missing context:

- did not know to test desktop and mobile variants
- did not perform a non-mutating keyboard/input probe
- did not mention Noter query-mode semantics beyond observed route behavior

Route-skill missing context:

- tested exact routes and desktop/mobile correctly
- still stopped short of a stronger editability probe because typing could mutate app state
- did not explicitly observe absence of write requests while probing editability

Noter-overlay remaining gaps:

- did not test authenticated states
- did not test actual persisted typing, by design
- did not test sidebar toggles, route links, theme/reset links, or other route interactions
- did not validate a Cloudflare tunnel URL because none was provided for this local run

## Extraction Decision

This experiment supports the current pack boundary:

- keep "validate the user-visible path before claiming success" in `agent-engineering-core`
- keep exact route/query validation, desktop/mobile checks, focus/editability probes, and screenshot
  expectations in `route-ui-validation`
- keep Noter query-mode semantics such as `?dev`, `?-dev`, and `?prod-ui` in `noter-app-template` or
  another Noter-specific overlay

The route skill matters even when core agents behave well. It widened validation from one desktop
DOM check to desktop/mobile exact-route coverage. The Noter overlay mattered most for query-mode
interpretation and a safe, non-mutating input-event probe.

## Next Experiment Recommendation

Run a typed product/refactoring experiment next. The first three experiments now cover cleanup,
PR/GitHub discovery, and route validation. The next missing validation area is source-of-truth
discipline around generated validation, tiny local schemas, and delete-first typed refactors.
