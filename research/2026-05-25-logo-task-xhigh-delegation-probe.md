# Logo Task xHigh Delegation Probe

## Document Control

- Status: Research note; decision input, not accepted baseline guidance
- Date: 2026-05-25
- Related:
  - `AGENTS.md`
  - `research/2026-05-25-subagent-shortcut-delegation-probe.md`
  - [PR #848](https://github.com/noter-md/noter/pull/848)

## Question

After PR #845 promoted shortcut/process delegation guidance, will a fresh xhigh agent receiving a
substantial implementation goal independently create sub-agents, possibly across multiple levels, to
keep its own context focused?

## Exact Prompt

The xhigh probe agent received this message:

```text
I want there to be a 1-to-1 correspondence between the logo rendered in the landing page and empty dashboard, the idea is that all query params that we currently set in /logo should also work in the other places where the logo is present. that means that you'll have to extract it as separate thing so it can be imported everywhere, that is your goal
```

No additional implementation instructions were added to the prompt.

## Result Summary

The agent produced a useful implementation and opened ready PR
[#848](https://github.com/noter-md/noter/pull/848), but it did not spawn sub-agents.

Follow-up self-report from the completed probe:

> No sub-agents were spawned for the logo task.

The agent reported:

- worktree: `/Users/nicu/.codex/worktrees/5569/noter`
- branch: `codex/shared-logo-query-params`
- sub-agents spawned: none
- nested sub-agents: none
- sub-agent contributions integrated: none
- sub-agent output rejected: none

## Evidence Register

| Sequence | Evidence source             | Observed action                                                                                                                              | Expected behavior                                                                                                          | Observed outcome                                                                                                                       | Why it matters                                                                                                      | Confidence | Hypothesis impacted                                                                    | Suggested follow-up test                                                                                                     |
| -------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1        | User prompt                 | A fresh xhigh probe agent received the exact substantial logo extraction goal.                                                               | The agent should keep the main goal in focus and consider delegating independent source mapping, verification, or PR work. | The agent ran for an extended period and implemented the change directly.                                                              | Tests whether baseline guidance alone causes substantial implementation tasks to fan out.                           | High       | Baseline guidance may permit delegation without making it salient at task start.       | Repeat with a similarly broad refactor after adding a start-of-task delegation checkpoint.                                   |
| 2        | PR #848                     | Agent opened ready PR #848 with one implementation commit.                                                                                   | Success is possible with or without delegation.                                                                            | The PR extracted shared logo state/rendering and updated landing/dashboard/logo search behavior.                                       | Separates implementation success from delegation behavior.                                                          | High       | A good implementation result does not prove context discipline happened internally.    | Review #848 separately for code quality; do not use implementation success as evidence of multi-agent behavior.              |
| 3        | Completed-agent follow-up   | Supervisor asked for a delegation tree after completion, with no further implementation.                                                     | The agent should report spawned children if any existed.                                                                   | The agent explicitly reported no sub-agents and no nested sub-agents.                                                                  | Directly answers the research question.                                                                             | High       | The xhigh agent did not infer the need for multi-agent decomposition from baseline.    | Require final handoffs for substantial tasks to include a delegation tree or "none, because..." statement.                   |
| 4        | Supervisor filesystem check | Other contemporaneous worktrees existed, including one with an overlapping shared-logo-state commit and another dirty dashboard route spike. | Unattributed worktrees should not be counted as this probe's delegation unless tied to the probe agent.                    | The probe agent's self-report did not attribute those worktrees to itself, so they remain background noise for this research question. | Prevents overclaiming from filesystem coincidence.                                                                  | Medium     | Filesystem residue alone is not enough to prove sub-agent use.                         | Future probes should require sub-agents to report child agent IDs, branches, worktrees, and which outputs were integrated.   |
| 5        | PR #848 validation handoff  | Agent ran tests, typecheck, CI check, browser check, commit, push, and PR creation directly.                                                 | Routine process work could have been delegated after implementation.                                                       | The agent reported all research, implementation, verification, commit, push, and PR creation happened directly in its own thread.      | Shows the shortcut/process delegation rule does not automatically apply to implementation agents' own PR mechanics. | High       | Process delegation needs a more explicit trigger for substantial implementation tasks. | Test a future implementation goal with a start instruction that only adds a delegation-decision checkpoint, not a full plan. |

## Delegation Tree

```text
Parent supervisor thread
└── xhigh logo implementation probe: 019e5c6d-f394-7170-8c48-5207985f81e1
    ├── branch: codex/shared-logo-query-params
    ├── PR: #848
    └── child sub-agents: none reported
```

This was not a multi-level delegation success. It was a single sub-agent completing a substantial
task by itself.

## Synthesis

### Did The New Baseline Cause Multi-Agent Decomposition?

No. The xhigh agent used the current baseline instructions and still chose a monolithic workflow for
source discovery, implementation, verification, commit, push, and PR creation.

### Did The Task Itself Need Multiple Agents?

It had several independent lanes that would have been reasonable delegation targets:

| Lane                      | Why it could be delegated                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Source map                | Find all logo renderers, `/logo` query params, and public/dashboard consumers without loading every detail into the main context. |
| Implementation spike      | Prototype the shared route-state/rendering extraction in an isolated worktree.                                                    |
| Verification              | Compare `/logo`, landing, and empty dashboard query-param behavior; run focused tests/browser checks.                             |
| PR/process work           | Commit, push, PR creation, and check watching after implementation.                                                               |
| Alternative design review | Evaluate whether static SVG, Three/canvas, or current component boundaries best preserve the route contract.                      |

The agent completed the task, but it did not use those independent lanes to protect context.

### What Did We Learn About The Current Instructions?

PR #843 and PR #845 made delegation allowed and explicit for sidecar research and shortcut/process
commands. They did not create a strong enough start-of-task habit for substantial implementation
goals.

The missing instruction is not "always spawn agents." The missing instruction is a small
delegation-decision checkpoint before deep work, plus a handoff requirement that makes
non-delegation visible for complex tasks.

## Candidate Instruction Changes

| Candidate                               | Proposed change                                                                                                                                                          | Pros                                                                        | Risks                                                                                       | Evidence fit |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------ |
| Start-of-task delegation checkpoint     | For substantial implementation/research tasks, explicitly identify independent sidecar lanes before deep local work and spawn agents for lanes that can run in parallel. | Makes delegation salient before the main context fills with source details. | Could add planning overhead for small tasks if phrased too broadly.                         | Strong       |
| Delegation tree in final handoff        | For substantial tasks, final handoff should include child agents used, or `none` with a brief reason.                                                                    | Makes behavior observable and easier to improve.                            | Adds a small reporting requirement even when no delegation was useful.                      | Strong       |
| Default explorer for multi-surface work | For tasks spanning multiple routes/surfaces, start at least one explorer for source map or verification unless there is a clear reason not to.                           | Targets the exact class of task where context can balloon.                  | May be too prescriptive if the code path is already obvious.                                | Medium       |
| Process delegation after implementation | After implementation stabilizes, delegate routine `create pr`, `wait`, or review triage using exact shortcut-command shape.                                              | Reuses the proven shortcut delegation rule from PR #845.                    | If the implementation branch is dirty or complex, handoff needs clear exception boundaries. | Medium       |
| No new rule                             | Keep current baseline and rely on operator correction when delegation is missed.                                                                                         | Avoids more baseline text.                                                  | The xhigh probe shows capable agents can still do large tasks monolithically.               | Weak         |

## Candidate Wording

Candidate `AGENTS.md` addition near `Sub-Agent Research`:

```markdown
- For substantial implementation or research tasks, do a quick delegation pass before deep local
  work: identify independent source-map, verification, implementation-spike, or process lanes that
  can run in parallel. Spawn sub-agents for useful lanes, and if you keep the task local, keep the
  reason visible in the final handoff.
```

Optional final-handoff wording:

```markdown
- For substantial tasks, include a compact delegation tree in the final handoff: child agents used,
  worktrees/branches they owned, outputs integrated or rejected, or `none` with the reason.
```

## Recommendation

Promote a narrow start-of-task delegation checkpoint. It should encourage agents to choose
sub-agents early for independent work without forcing delegation for every task.

Do not infer from PR #848 that xhigh agents naturally create multi-level agent structures. This
probe found the opposite: a strong xhigh agent can complete a multi-surface implementation but still
miss the context-preservation behavior we wanted to study.

## Threats To Validity

- The delegation tree was requested after completion, not emitted in the original final handoff.
- Filesystem checks found contemporaneous worktrees with overlapping names or changes, but the probe
  agent did not attribute them to itself. They should not be counted as confirmed child agents.
- This was one implementation task. More probes are needed before deciding whether the checkpoint
  should be always-loaded, workflow-doc-only, or part of an agent-context overlay.

## Current Decision State

This file supports a follow-up decision. The current best candidate is a compact always-loaded
delegation-checkpoint rule plus a final-handoff delegation tree for substantial tasks.
