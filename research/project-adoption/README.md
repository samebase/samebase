# Project Adoption Lab

## Document Control

- Status: active research method
- Started: 2026-07-29
- Owner: Samebase project adoption
- First case: [Bristol TSX](cases/bristol-tsx.md)
- Working guidance: [portable rules](portable-rules.md)

## Purpose

Use real projects to find which Samebase practices are useful outside Samebase. Learning is
bidirectional. A project can also show a better practice that Samebase should adopt.

This is a lightweight working method, not a formal research program. Record observable questions,
decisions, code changes, tests, and operator results. Agent hidden reasoning is not required.

## Principles

1. Code and tests are stronger evidence than guidance documents.
2. Samebase is a mature source of knowledge, but it is not the automatic winner.
3. Start with the target project's current behavior and operating needs.
4. Give a project worker the current portable rules. Let it ask for missing knowledge.
5. Give the worker the smallest useful answer from Samebase, public sources, or another project.
6. Record where knowledge came from and where the result should go.
7. Prove important decisions with tests, a small spike, or an operator workflow.
8. Keep project changes, Samebase changes, and shared extractions in separate branches and pull
   requests.

## Working Roles

| Role              | Responsibility                                                                  |
| ----------------- | ------------------------------------------------------------------------------- |
| Manager           | Own the capability and toolchain contract, run preflight, and keep records.     |
| Project worker    | Inspect or change one bounded project area and state which guidance is missing. |
| Samebase adviser  | Find relevant Samebase code, tests, rules, and past decisions.                  |
| Public researcher | Verify current platform and framework contracts from primary sources.           |
| Reviewer          | Challenge the decision and check that the evidence supports it.                 |

One agent can perform more than one role when the scope is small. Edit-capable agents use isolated
worktrees and disjoint file ownership.

## Manager Preflight

Before the first test, spike, or implementation commit, the manager compares:

1. the target repository baseline
2. the current portable rules
3. the current generated-app or reference-project contract for the capabilities in scope

The comparison must include:

- package manager, lockfile, and workspace model
- runtime version, module type, authored source language, configuration language, and imports
- public package-script names and every local, CI, and provider caller
- development server and bundler
- linter, configuration owner, important rule parity, and formatter
- test runner, test projects, type checker, and code generation
- framework, CSS toolchain, build adapter, and deployment adapter
- real CI, build, deploy, preview, and dry-run commands
- core version pins

Existing target files show the current state. They do not define the desired toolchain.

Record each difference as one of:

- an accepted target constraint
- a rule to adopt
- a question that needs a source check
- an explicit exception with a test

The manager owns this preflight. Do not wait for a project worker to ask about a policy that the
worker cannot see. Do not start implementation while a row is not classified.

After integration, an independent architecture review repeats the comparison against the finished
package scripts, configuration, dependencies, lockfile, CI, and provider commands. Passing the
existing commands proves that the current tools run. It does not prove that they are the selected
tools.

## Knowledge Request Loop

1. The project worker uses the target repository and the current portable rules.
2. The worker states a concrete missing fact, decision, or operating requirement.
3. The manager routes the question to the best source.
4. The manager gives the worker the minimum answer needed to continue.
5. The case record captures the question, source, adaptation, and validation.
6. The result becomes one of:
   - keep in the target project
   - adopt in Samebase
   - extract as a shared asset
   - keep different because the constraints differ
   - defer because the evidence is not sufficient

The manager observes the worker's questions, requested actions, provider reads, pass or fail
results, elapsed work, and rework. The manager does not need hidden reasoning. Ask the worker to
state the missing fact and the evidence that will let it continue.

## Public Guidance Forward Tests

When adoption work changes public agent guidance, the manager tests the published guidance, not an
internal copy. First select the request route from the public request and skill. Then discover the
available server and tool descriptions from the live test environment. Tool-description order can
bias routing when several tools appear to match the same request.

Run the complete positive and negative prompt suite with a fresh agent for each prompt and each
selected model class. Do not give the agent prior answers, expected results, or earlier test output.
A harness run is invalid when it does not expose the public skill and the actual live server and
tool descriptions. Discard that run, correct the harness, and rerun the complete suite.

## Decision Record

Each important decision records:

| Field             | Meaning                                                                    |
| ----------------- | -------------------------------------------------------------------------- |
| Requirement       | The user or operator result that must exist.                               |
| Project evidence  | Current code, tests, commands, failures, or operator behavior.             |
| Samebase evidence | Relevant Samebase code, tests, guidance, or history.                       |
| Public evidence   | Current primary platform or framework source, when needed.                 |
| Decision          | The selected action and the rejected action that was closest to it.        |
| Direction         | Project only, Samebase only, shared, intentionally different, or deferred. |
| Validation        | Test, spike, preview, review, or operator check that proves the decision.  |
| Destination       | File, package, skill, script, pull request, or follow-up record.           |

## Promotion

A practice found in one case stays a candidate. It can become working portable guidance when the
case proves it and the rule does not depend on hidden Samebase context.

The next project should first use only the portable rules and its own repository. Samebase becomes
an escalation source. Each escalation shows a missing rule or a project-specific boundary. A rule
becomes validated for reuse only after it succeeds in that later project.

Stable results can move to:

- a durable operator runbook in `docs/`
- a triggerable skill
- an agent-context core or overlay
- a package or repository template
- a product change in Samebase
- a project-local rule when sharing would add coupling

## Checkpoints

Create a coherent commit at each important checkpoint:

1. process charter and capability inventory
2. current behavior tests
3. framework and deployment spike
4. runtime migration
5. preview, worktree, cleanup, and production workflows
6. bidirectional findings and reusable outputs

Do not combine changes from different repositories in one pull request.
