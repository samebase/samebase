# Sub-Agent Shortcut Delegation Probe

## Document Control

- Status: Research note; decision input, not accepted baseline guidance
- Date: 2026-05-25
- Related:
  - `AGENTS.md`
  - `docs/agent-workflows.md`
  - `research/2026-05-23-agent-context-shortcut-routing-decision.md`
  - [PR #843](https://github.com/noter-md/noter/pull/843)

## Question

After PR #843 added baseline guidance to use sub-agents for sidecar research and routine process
work, do repo shortcut commands such as `clean` need an additional rule about preserving the
operator's terse command shape when delegated?

The practical behavior we want:

1. the main thread stays focused on the user's goal
2. a delegated agent receives the same command shape the operator would have used
3. the delegated agent proves it can route from current repo instructions
4. the supervisor receives only a short result or exception handoff

## Purpose And Scope

This note records a small corrected-thread probe, not a shipped product or workflow change. Its
scope is agent behavior around delegation, context hygiene, and shortcut routing. It does not
authorize cleanup of any resource and does not prove provider-preview cleanup correctness.

The probe is useful because it exposed two different behaviors that can look similar in a
transcript:

- a sub-agent can execute a process checklist when the supervisor gives it a detailed prompt
- a sub-agent can route from repo instructions when the supervisor gives it only the operator's
  terse command

Only the second behavior answers the shortcut-routing question.

## Evidence Register

| Sequence | Evidence source                     | Observed action                                                                                                     | Expected behavior                                                                                                     | Observed outcome                                                                                                                                                          | Why it matters                                                                                     | Confidence | Hypothesis impacted                                                                       | Suggested follow-up test                                                                                |
| -------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1        | PR #843                             | Added baseline `Sub-Agent Research` guidance to `AGENTS.md`.                                                        | Agents should consider sub-agents for research, routine process work, and context filtering.                          | The baseline included process delegation, model/worktree choice, and context-filter language.                                                                             | Establishes the context variant being tested.                                                      | High       | PR #843 might be enough for routine process delegation.                                   | Test several bare shortcut commands from a thread that has loaded the merged baseline.                  |
| 2        | Expanded `clean` worker             | Supervisor delegated `clean` with a custom paragraph containing repo path, docs instructions, and blocker contract. | If testing shortcut routing, the worker should receive only the operator-shaped command.                              | The worker was interrupted, but the original worktree appeared removed afterward.                                                                                         | Shows cleanup can happen even when the test prompt is contaminated by extra route instructions.    | Medium     | Expanded prompts may hide whether repo instructions are sufficient.                       | Avoid expanded prompts in routing tests; record them only as invalid or low-validity probes.            |
| 3        | Recreated exact-command probe setup | Supervisor recreated `/Users/nicu/.codex/worktrees/5569/noter` from updated `origin/main`.                          | A controlled retry should start from current baseline instructions.                                                   | The recreated worktree had current `AGENTS.md`, but not the original worktree's cleanup seed environment.                                                                 | Gives a fairer routing test but weakens provider-cleanup conclusions.                              | High       | Worktree recreation can introduce environmental differences.                              | Use an existing terminal-PR worktree with seed env intact for a stronger cleanup probe.                 |
| 4        | Exact `clean` forked agent handoff  | Supervisor sent a forked sub-agent exactly `clean`.                                                                 | The delegated agent should route through repo instructions and either complete or fail closed with a concise handoff. | The agent reported delegating actual cleanup to another Codex agent, removing the recreated worktree/local branch, and skipping provider cleanup for missing credentials. | Supports the operator-shape delegation rule while keeping provider cleanup outside the conclusion. | Medium     | Bare command delegation can work after PR #843, but may need a sharper prompt-shape rule. | Repeat with `wait` and `create pr`; repeat `clean` in a non-recreated terminal worktree when available. |

## Probe Results

| Probe                      | Setup                                                                                                     | Delegated prompt shape                                                             | Observed behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                | Validity for shortcut-routing question                                                                                                | Lesson                                                                                                                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expanded `clean` worker    | Current branch after PR #843; original `5569` worktree still existed.                                     | Custom paragraph that named the repo, command, instructions, and blocker contract. | The worker was interrupted, but it appeared to remove the original `/Users/nicu/.codex/worktrees/5569/noter` before shutdown.                                                                                                                                                                                                                                                                                                                                    | Low. It tested cleanup mechanics with over-specified instructions, not bare shortcut routing.                                         | A detailed prompt can mask whether the delegated agent would have loaded and applied repo shortcut instructions on its own.                                                           |
| Exact `clean` forked agent | Recreated `/Users/nicu/.codex/worktrees/5569/noter` from updated `origin/main`, after PR #843 had landed. | Exactly `clean`.                                                                   | The agent reported that it delegated the actual cleanup to another Codex agent, verified [PR #843](https://github.com/noter-md/noter/pull/843) was `MERGED`, removed the recreated worktree and local branch, found the remote branch already absent, found no `~/.noter/checkouts/5569` state, found no `tmp-5569-*` vault repos, and skipped provider preview cleanup fail-closed because cleanup seed credentials were unavailable in the recreated worktree. | Medium. It tested the desired operator-shape routing, but the worktree had been recreated and therefore lacked the original seed env. | With only `clean`, the delegated agent did route through the baseline and treated cleanup as delegate-friendly process work. The credential skip limits provider-cleanup conclusions. |

## Synthesis

### Did Delegation Drift Occur?

Yes, in the first probe. The supervisor converted the user's terse `clean` command into an expanded
delegation prompt. That made the worker's success less meaningful because the worker did not have to
discover the shortcut semantics from repo instructions.

### Did The Exact-Command Probe Validate PR #843?

Partially. The exact `clean` probe showed the post-#843 baseline was enough for a forked agent to
treat cleanup as delegated process work and return a concise handoff. It did not validate provider
cleanup because the recreated worktree lacked the original cleanup seed environment.

### What Is The Minimal Shortcut Delegation Contract?

A fair shortcut-delegation test needs these pieces:

1. start the sub-agent in the intended checkout or thread context
2. send the same terse command the operator used
3. avoid adding route instructions, step lists, or hidden acceptance criteria
4. require a short result handoff or exception handoff
5. keep the supervisor responsible for ambiguity, approval boundaries, and risky decisions

## Candidate Changes And Acceptance Criteria

| Candidate                         | Proposed change                                                                                                                  | Acceptance criteria                                                                                                | Rationale                                                                                                 |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Always-loaded shortcut-shape rule | Add one `AGENTS.md` bullet saying delegated shortcut/process commands should preserve the operator's exact terse command shape.  | A future `clean`, `wait`, or `create pr` delegation receives only the command and still routes through repo rules. | Bare commands are interpreted before optional docs or overlays are guaranteed to load.                    |
| Workflow-doc explanation          | Add a short note near the `docs/agent-workflows.md` shorthand table explaining delegated shortcuts should not become checklists. | Agents that already load the workflow docs can explain why terse delegation matters.                               | Useful for durability, but probably insufficient without a compact always-loaded router.                  |
| More validation before promotion  | Keep this research-only note and run `wait` and `create pr` exact-command probes first.                                          | Two more terse-command probes complete or fail closed with concise handoffs and no expanded prompts.               | Reduces the risk of promoting one corrected high-salience thread into baseline policy.                    |
| Overlay/skill follow-up           | Add the rule to `noter-operator-workflows` or a shortcut-routing skill after live loader behavior is proven.                     | Runtime can prove the overlay is loaded before bare command routing, or `AGENTS.md` keeps a compact pointer.       | Matches the agent-context package direction but does not solve immediate bare-command behavior by itself. |
| Delegated-action traceability     | Require shortcut sub-agent handoffs to identify delegated child agents, final actor, and any destructive local/provider actions. | A `clean` handoff makes clear which agent deleted which worktree, branch, provider preview, or state directory.    | Helps debug process delegation without loading raw operational logs into the main thread.                 |

## Prompt Examples

This prompt is not a good shortcut-routing test because it explains the route before the agent has
to discover it:

```text
In /Users/nicu/.codex/worktrees/5569/noter, execute the repo shortcut command: clean.

Follow the repository instructions from AGENTS.md and docs. You are not alone in the codebase; do
not revert or overwrite others' edits. Report what you did, what you delegated if anything, and the
final cleanup result. If cleanup is blocked by a fail-closed condition, stop and report the exact
condition.
```

This prompt is the useful shortcut-routing probe:

```text
clean
```

The second prompt only works as a fair test when the sub-agent starts in the intended checkout or
thread context, with current repo instructions available.

## Decision Options

| Option                                  | Change                                                                                                                           | Pros                                                                  | Risks                                                                                                 | Evidence fit                                          |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Keep PR #843 as-is                      | Do not add more guidance.                                                                                                        | Avoids adding more always-loaded text.                                | Agents may keep over-prompting delegated shortcut work, so tests stop proving real operator behavior. | Weak. The correction happened immediately after #843. |
| Add compact `AGENTS.md` rule            | Add one always-loaded bullet requiring delegated shortcut/process commands to preserve the operator's exact terse command shape. | Bare commands are routed before optional docs are necessarily loaded. | More baseline text in an already large file.                                                          | Strongest current fit.                                |
| Add `docs/agent-workflows.md` rule only | Document the operator-shape rule near the shorthand command table.                                                               | Keeps details out of always-loaded context.                           | A single-word `clean` may not cause docs to load before the agent chooses a delegation shape.         | Useful as supporting detail, not sufficient alone.    |
| Add research-only note for now          | Keep this file as evidence and run more probes before baseline changes.                                                          | Avoids promoting from one high-salience corrected thread.             | Leaves the newly observed failure mode unfixed for `wait`, `create pr`, `ship`, and cleanup work.     | Reasonable if more validation is required.            |
| Add skill/overlay follow-up             | Update `noter-operator-workflows` or a future shortcut-routing skill with the same rule.                                         | Aligns with the agent-context package direction.                      | Does not help until loader behavior guarantees the overlay is present before shortcut routing.        | Good follow-up, not a replacement for core yet.       |
| Add delegated-action traceability       | Ask shortcut sub-agents to report the delegation chain and destructive actions in the final handoff.                             | Makes cleanup/PR/process debugging easier without raw logs.           | Can turn concise handoffs into bureaucracy if over-specified.                                         | Good supporting rule if added narrowly.               |

## Candidate Wording

Candidate `AGENTS.md` bullet:

```markdown
- When delegating or testing shortcut/process commands such as `clean`, `wait`, `create pr`, or
  `ship`, start the sub-agent in the intended checkout/thread context and send only the exact
  command shape the operator used. Do not expand it into a checklist prompt.
```

Candidate `docs/agent-workflows.md` note near the shorthand command table:

```markdown
When a shorthand command is delegated, tested, or handed off for execution, preserve the operator's
terse command form exactly, such as `clean`, `wait`, `create pr`, or `ship`, and avoid adding extra
instructions or checklists.
```

## Recommendation

Promote the compact `AGENTS.md` rule if the team wants this behavior immediately for bare operator
commands. Also add the `docs/agent-workflows.md` note if the docs should explain why shortcut
delegation must use the same command shape as the operator.

Before broadening the rule further, run at least two more terse-command probes:

| Command     | Why test it                                                                 |
| ----------- | --------------------------------------------------------------------------- |
| `wait`      | Confirms routine CI watching can delegate without flooding the main thread. |
| `create pr` | Confirms PR bureaucracy can be handed off without custom checklist prompts. |

## Threats To Validity

- The successful `clean` probe ran after recreating the worktree, so provider cleanup skipped
  fail-closed because cleanup seed credentials were unavailable in that recreated environment.
- This is a high-salience corrected thread. It should influence routing guidance, but not be treated
  as frequency evidence by itself.
- The exact `clean` probe used a forked context from this thread. A future test should use an
  existing operator thread/worktree without extra discussion context when practical.

## Current Decision State

This file supports a decision; it does not itself make the rule accepted. The narrowest live change
would be one `AGENTS.md` bullet plus an explanatory `docs/agent-workflows.md` note, using the
candidate wording above.
