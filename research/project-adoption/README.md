# Project Adoption Research

## Status

- Method: second case recorded; its repository-backed Preview gate passed after the first
  default-branch deployment
- First case: [Bristol TSX](cases/bristol-tsx.md)
- Second case: [Teardown Noita 3D](cases/teardown-noita-3d.md)
- Skill-bundle experiment: [Weight TSX](experiments/weight-tsx-skill-bundles.md), where the short
  public skill scored 28/32 and the public skill plus the detailed adoption bundle scored 22/32
- Worker input: [portable rules](portable-rules.md)
- Next gate: compare both skill bundles during an isolated Weight TSX implementation before the
  detailed adoption bundle is reduced or removed

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

### 2. Choose proportionate validation

Keep validation proportionate to the project and the migration risk. Discuss material cost and
coverage tradeoffs with the operator. Do not turn Samebase adoption into an unrelated testing
upgrade.

Preserve the behavior that matters to the operator. Use synthetic data. Keep security defects
separate from parity, so a test does not make a defect permanent.

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

### 6. Prove the repository-backed provider path

For a Samebase adoption, require the repository and Worker to be joined through Samebase, with one
production trigger for the default branch and one preview trigger for other branches. A standalone
manual Worker is a spike, not release evidence.

Bind repository CI and the provider branch build to the reviewed commit. If either fails, use native
logs, repair the repository or trigger, push a new commit, and wait for a new terminal result. Do
not accept an older build or an unrelated upload.

## Promotion

One case can produce candidate guidance. A rule becomes reusable evidence only after another project
uses it successfully. Bristol and Teardown Noita 3D support the complete manager preflight, reviewed
commit binding, and separation of build, upload, deployment, and route evidence. The four-command
provider preflight and authenticated Samebase browser handoff remain Teardown-only candidates.

Commit at meaningful checkpoints. Do not preserve provider journals, temporary identifiers, raw
logs, or historical validation output after they stop helping a current decision.
