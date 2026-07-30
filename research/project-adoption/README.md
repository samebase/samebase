# Project Adoption Research

## Status

- Method: candidate
- First case: [Bristol TSX](cases/bristol-tsx.md)
- Worker input: [portable rules](portable-rules.md)
- Next gate: use the portable rules on a second project before private Samebase source is available

## Purpose

Use real projects to find which Samebase practices are useful outside Samebase. The learning must
work in both directions. A target project can also show a better practice that Samebase should
adopt.

This is a lightweight operating method, not a formal research program. Keep only decisions,
failures, and evidence that can improve the next project or Samebase.

## Process

### 1. Manager preflight

Before the first test, spike, or implementation commit, compare the target repository with the
[portable baseline](portable-rules.md) and the current Samebase or generated-app contract, when it
is available.

Classify every difference before implementation. The manager owns and gives this contract to the
workers. A worker cannot ask about a convention that it was never shown.

### 2. Protect current behavior

Create framework-neutral tests for the behavior that must survive. Use synthetic data. Keep security
defects separate from parity, so a characterization test does not make a defect permanent.

### 3. Delegate bounded work

Give each worker the target repository, the portable rules, and one bounded outcome. The worker must
state the missing fact or decision when it cannot continue. The manager routes that request to the
target code, Samebase, a reference app, or a current primary source.

Record only:

- the missing fact
- the source used
- the decision
- the validation result
- where the result belongs

Hidden agent reasoning is not required.

### 4. Prove uncertain boundaries

Use a small spike for the difficult boundary before a broad migration. Keep production commands and
traffic unchanged until the spike passes.

### 5. Review the integrated result

An independent reviewer repeats the preflight against the final scripts, configuration,
dependencies, lock file, CI, and provider commands. Passing an old command proves only that the old
tool still works.

For each finding, select one destination:

- target project only
- Samebase
- shared guidance or code
- intentionally different
- deferred for more evidence

Use separate branches and pull requests for different repositories.

## Promotion

One case can produce candidate guidance. A rule becomes reusable evidence only after another project
uses it successfully.

Commit at meaningful checkpoints. Do not preserve provider journals, temporary identifiers, raw
logs, or historical validation output after they stop helping a current decision.
