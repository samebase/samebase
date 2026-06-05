# Repo Documentation Standard

This standard keeps repo documentation useful for humans and coding agents. A small set of current,
high-authority docs is better than many long docs that mix accepted behavior, proposals, research,
and implementation logs.

## Placement

Use the smallest durable home that matches the document's job:

| Location         | Use For                                                                                                                                                    | Do Not Use For                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `specs/`         | Accepted, current product behavior; durable system contracts; active accepted rollout contracts; validation expectations for shipped or accepted behavior. | Drafts, competing proposals, research, per-thread plans, working logs, or historical notes. |
| `rfcs/`          | Concrete proposals, implementation plans, pilots, and rollout plans that are still under discussion or not yet the current contract.                       | Open-ended evidence gathering or accepted current behavior.                                 |
| `research/`      | Investigations, audits, benchmarks, incident notes, external research, and bug-finding memos before a concrete proposal exists.                            | Normative product behavior or active implementation contracts.                              |
| `docs/`          | Durable repo/process/operator reference material that supports the repo but does not define product behavior.                                              | Accepted product contracts, active proposals, or exploratory notes.                         |
| `skills/`        | Reusable conditional workflows that an agent should load only when a task needs them.                                                                      | Broad always-on repo rules or one-off task notes.                                           |
| `archive/`       | Superseded, canceled, or historical documents that should not guide new implementation.                                                                    | Anything still needed as active guidance.                                                   |
| PR body or issue | Short-lived implementation status, validation notes, blockers, and one-PR rationale.                                                                       | Durable source-of-truth behavior.                                                           |

## Spec Threshold

Create or keep a spec only when the repo needs an accepted source of truth that future humans or
agents must obey. A change qualifies when at least one of these is true:

- It defines durable product behavior that is not obvious from code and tests alone.
- It defines a data model, API, auth, security, compliance, migration, or provider boundary.
- It coordinates a multi-PR rollout where current behavior and the target contract must stay clear.
- It replaces or supersedes an existing source-of-truth spec.
- It records validation expectations for shipped behavior that would be expensive to rediscover.

Do not create a spec for an ordinary one-thread or one-PR change. Prefer code, tests, PR text, and
focused comments unless the change crosses one of the thresholds above.

## Spec Shape

Specs should be short enough to scan and precise enough to test. Prefer one or two pages. Longer
specs need a concrete reason, such as a multi-stage migration, a state model, or a provider
contract.

A current spec should usually contain:

1. `Document Control`: status, owner, last updated, related docs, and supersedes/superseded-by when
   relevant.
2. `Current Contract`: the accepted behavior or invariant.
3. `Non-Goals`: important behavior the spec intentionally does not require.
4. `Validation`: tests, manual checks, or observability that prove the contract.
5. `Rollout` or `Migration`: only when the accepted transition is still active.

Do not put these in a spec:

- Working logs or per-commit trackers.
- Open-ended research notes.
- Long implementation journals.
- Draft alternatives that are not accepted.
- Exhaustive code excerpts that will drift.
- Repeated background already covered by related docs.

## Lifecycle

- Start in `research/` when the main output is evidence.
- Move to `rfcs/` when the output becomes a proposed direction or rollout plan.
- Move or rewrite into `specs/` only after the decision is accepted and active.
- After implementation ships, reduce the spec to the current contract and validation expectations.
- Move superseded or canceled material to `archive/` instead of leaving it in active folders.

When updating a spec, delete stale plan sections instead of appending indefinitely. If the accepted
behavior changed, replace the old contract or add a clear supersession link.

## Cleanup Rules

Reclassify existing docs in small batches. Each cleanup should update references in the same change.

High-confidence cleanup candidates:

- A spec whose status says `Proposed`, `Draft`, or `Proposal`: move to `rfcs/` unless it has become
  accepted, then update the status and reduce it to a contract.
- A spec whose status says `Superseded`: move to `archive/` and update current specs to link to the
  active source of truth.
- A spec that mainly compares options or records evidence: move to `research/` unless it records an
  accepted decision.
- A spec that mainly tracks implementation progress: reduce it to current behavior or move the
  tracker content to `archive/`.

Use code and tests as the first authority when deciding whether an old document still describes
reality.
