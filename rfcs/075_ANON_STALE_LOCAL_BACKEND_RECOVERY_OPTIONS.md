# 075 `make anon` Stale Local Backend Recovery Options

## Status

- Proposed
- Last updated: 2026-03-30

## Summary

`make anon` sometimes fails with:

```text
✖ A local backend is still running on port <port>. Please stop it and run this command again.
```

Today the operator recovers by manually running `make kill-port <port>` and then
retrying `make anon`.

This RFC compares the realistic ways to improve that flow without making the
implementation harder to understand than the problem itself.

## Problem

The current recovery path works, but it has two costs:

1. it interrupts a very common startup path
2. it invites over-engineering because the actual failure is narrow, but it
   appears inside a larger `make anon` bootstrap flow

The operator requirement is straightforward:

1. keep the recovery path obvious
2. if we automate it, the code should stay tiny and readable
3. only react to the exact Convex stale-backend failure, not to unrelated
   startup errors

## Research

### Repo context

- [Makefile](/Users/nicu/.codex/worktrees/778f/noter/Makefile) runs three
  relevant startup steps during `make anon`:
  - `convex-dev.js --once`
  - `convex-sync-dev-env.js` / auth seeding
  - long-running `pnpm dev`
- [scripts/convex-seed-dev-auth.js](/Users/nicu/.codex/worktrees/778f/noter/scripts/convex-seed-dev-auth.js)
  already contains local cleanup logic for leftover `convex-local` processes
  after abrupt termination, which confirms this is a repo-real failure mode, not
  a hypothetical one.

### Primary-source findings

1. Convex documents that local deployments run the local backend as a subprocess
   of `npx convex dev`, and that the backend should exit when `convex dev`
   stops. Source:
   [Convex local deployments docs](https://docs.convex.dev/cli/local-deployments)

2. Convex agent mode explicitly recommends `CONVEX_AGENT_MODE=anonymous` so
   agents use separate local backends instead of colliding with the operator’s
   normal dev deployment. Source:
   [Convex agent mode docs](https://docs.convex.dev/cli/agent-mode)

3. The exact failure string comes from Convex CLI local deployment code after it
   waits for the selected local port to become free and gives up. Source:
   [Convex CLI source](https://github.com/get-convex/convex-js/blob/cd633fd6083681fd4f83f54b1d53caf0a3f8ee94/src/cli/lib/localDeployment/run.ts)

4. GNU Make runs each recipe line in a separate shell by default, so multi-step
   shell recovery logic becomes fragile when it is embedded directly into a make
   recipe. Source:
   [GNU Make manual, recipe execution](https://www.gnu.org/software/make/manual/html_node/Execution.html)

5. Bash exposes `PIPESTATUS`, which lets a tiny wrapper preserve the real exit
   code of a command even when its output is piped through `tee` for inspection.
   Source:
   [Bash manual, `PIPESTATUS`](https://www.gnu.org/software/bash/manual/html_node/Bash-Variables.html)

## Decision criteria

Any chosen approach should satisfy all of these:

1. only react to the exact Convex stale-local-backend line
2. retry at most once
3. keep the manual operator path intact and obvious
4. avoid dense inline shell or large bespoke orchestration code
5. stay local to Noter unless there is a strong reason to push upstream first

## Options

### Option A: keep the current manual flow, but make it clearer

Behavior:

1. do not auto-kill anything
2. improve the failure output so it tells the operator exactly what to run next
3. optionally add a `killport` alias for voice-to-text/operator convenience

Pros:

- simplest runtime behavior
- easiest to trust while debugging
- no output parsing

Cons:

- leaves the repeated manual interruption in place
- does not solve the original “just recover and continue” request

### Option B: inline a tiny retry one-liner directly in the `Makefile`

Behavior:

1. wrap the failing command in a shell one-liner
2. capture output
3. exact-match the Convex line
4. run `make kill-port <port>`
5. retry once

Pros:

- no extra script file
- can be very short in raw line count

Cons:

- least readable place for nontrivial shell behavior
- quoting and pipeline status handling are hard to scan in a `Makefile`
- duplicated logic if used for more than one command
- Make’s per-line shell model makes this easier to get subtly wrong

### Option C: use a tiny dedicated shell wrapper from `Makefile`

Behavior:

1. keep the retry behavior in a small Bash helper
2. call that helper only around the relevant `convex dev` startup commands
3. exact-match the Convex line
4. run `make kill-port <port>`
5. retry once

Pros:

- smallest implementation that is still readable
- keeps the `Makefile` simple
- easy to constrain to the exact Convex failure
- uses standard shell behavior instead of introducing a custom JS process layer

Cons:

- still parses human-readable output from Convex
- adds one repo-local helper file

### Option D: move recovery into `apps/noter/convex-dev.js`

Behavior:

1. intercept `convex dev` child failure inside the existing wrapper
2. detect the stale-backend failure
3. kill the port and retry there

Pros:

- keeps `Makefile` thinner
- places behavior nearer the Convex bootstrap wrapper

Cons:

- materially broader than needed
- more code than a shell helper for a narrow operator shim
- harder to keep obviously correct than a tiny wrapper
- risks turning a simple startup affordance into general process orchestration

### Option E: push for an upstream Convex fix first

Behavior:

1. do nothing in Noter yet
2. ask Convex for a machine-readable retry signal or built-in stale-backend
   cleanup

Pros:

- best long-term ownership boundary
- avoids repo-local parsing of CLI output

Cons:

- does not help the current workflow immediately
- depends on external timelines
- still leaves open whether Noter wants a local ergonomic fallback anyway

## Recommendation

Recommend Option C.

Why:

1. it best matches the operator constraint that the code stay tiny and obvious
2. it avoids stuffing tricky shell into the `Makefile`
3. it is much smaller and easier to reason about than expanding
   `apps/noter/convex-dev.js`
4. it respects the exact upstream error contract from Convex instead of guessing
   at broader failure recovery

Recommended shape:

1. one very small Bash helper, kept intentionally narrow
2. wrap only the direct `convex dev` startup invocations used by `make anon`
3. retry exactly once
4. do nothing unless the output contains the exact Convex stale-backend line
5. keep `make kill-port <port>` as the actual cleanup primitive
6. optionally add `killport` as an alias for operator/voice-transcription
   convenience if desired

## Explicit non-goals

1. no broad “retry any startup failure” behavior
2. no general process supervisor for `make anon`
3. no large JS wrapper whose main job is parsing one line of output
4. no change to the existing manual recovery command itself

## Acceptance criteria for a follow-up implementation

1. `make anon` auto-recovers only from the exact Convex stale-backend line
2. the implementation is small enough that an operator can understand it in one
   quick read
3. manual `make kill-port <port>` recovery still works unchanged
4. tests cover exact-match retry and non-match no-retry behavior

## Open questions

1. Should we preserve the exact operator command spelling only as
   `make kill-port <port>`, or also add `make killport <port>` as an alias?
2. Should the helper wrap only the short-lived Convex bootstrap steps, or also
   the final long-running `pnpm dev` step?

## References

- [Convex local deployments docs](https://docs.convex.dev/cli/local-deployments)
- [Convex agent mode docs](https://docs.convex.dev/cli/agent-mode)
- [Convex CLI local deployment source](https://github.com/get-convex/convex-js/blob/cd633fd6083681fd4f83f54b1d53caf0a3f8ee94/src/cli/lib/localDeployment/run.ts)
- [GNU Make manual: recipe execution](https://www.gnu.org/software/make/manual/html_node/Execution.html)
- [Bash manual: `PIPESTATUS`](https://www.gnu.org/software/bash/manual/html_node/Bash-Variables.html)
