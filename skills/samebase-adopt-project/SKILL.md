---
name: samebase-adopt-project
description:
  Plan, execute, monitor, review, and document the adoption of an existing repository onto the
  Samebase stack. Use when the user explicitly invokes $samebase-adopt-project or asks for a
  comprehensive move, migration, onboarding, or port of an existing project to Samebase, including
  its framework, toolchain, Convex backend, Cloudflare delivery, authentication, preview, cutover,
  rollback, and reusable findings. Do not use it for a small tool alignment or routine provisioning
  task.
---

# Adopt a project to Samebase

Keep the user's product goal in the main thread. Treat the migration process as a set of observable
gates, not as an informal sequence of agent conversations.

Read [references/adoption-contract.md](references/adoption-contract.md) before the first test,
spike, edit, or delegated implementation task.

## Establish the run

1. Resolve the exact target repository and default branch. Read its current instructions, source,
   lock file, commands, CI, provider configuration, and production contract.
2. State the requested outcome, preserved behavior, external-write boundary, production-cutover
   boundary, and rollback requirement.
3. Start the adoption record from the template in the contract. Keep it in task-local storage
   outside the target repository, or in a separate Samebase worktree and branch. Keep raw logs and
   private data out of the record.
4. Complete and classify the full manager preflight. Do not delegate implementation while a
   preflight difference is unclassified.

Use the portable contract first. Consult private Samebase source only for one named missing fact or
safety boundary. Record each escalation because it identifies either a missing portable rule or a
real target-specific difference.

## Protect current behavior

Add framework-neutral characterization coverage for behavior that must survive. Cover the real
routes, authentication and data boundaries, server endpoints, assets, navigation, browser session
recovery, and provider build that are relevant to the target.

Keep a known security defect separate from parity. Do not make a defect permanent only because the
old application has it.

## Delegate bounded lanes

Keep manager preflight, scope decisions, integration, and the final user handoff in the main thread.
Use a shallow tree:

- Use read-only explorers for target source mapping, current primary documentation, and noisy
  provider or test evidence.
- Use an implementation worker only after its inputs, write scope, output artifact, and acceptance
  criteria are explicit. Use an isolated worktree for edit-capable work.
- Use an independent reviewer after integration. Give the reviewer the target repository, adoption
  contract, final artifact, and acceptance criteria. Do not give it the worker's intended answer.
- Use a process reviewer after the result review when the run was substantial. Have it score the
  observable adoption record for preflight completeness, useful delegation, duplicated work, missing
  evidence, approval handling, and final integration decisions.

Allow a lane owner to fan out cheap read-only scans when this reduces noise or elapsed time. Do not
create recursive reviewer chains. Use one bounded repair loop for review findings unless new
evidence justifies another pass.

## Prove uncertain boundaries

Use a small isolated spike before a broad migration when a runtime, framework, authentication,
provider, clean-checkout, or worktree boundary is uncertain. Keep production configuration and
traffic unchanged until the spike passes.

Delete temporary spike code and obsolete commands after the final path is proven.

Register every temporary Worker, backend, domain, vault, preview, and other provider resource when
it is created. Before handoff, record whether each resource was promoted, retained for review, or
removed. Remove only resources owned by this run.

## Integrate and review

1. Integrate coherent implementation slices into the target branch.
2. Run the target's real checks, clean-checkout or linked-worktree setup, provider build, and route
   checks required by the contract.
3. Have the independent reviewer repeat the full preflight against the integrated scripts,
   configuration, dependencies, lock file, CI, provider commands, and preserved behavior.
4. Fix actionable findings and rerun the affected gates.
5. Prepare a reviewable pull request for the target repository.

Passing an old command proves only that the old tool still works. It does not prove that the final
project uses the selected owner or contract.

## Preview, cutover, and observe

- Bind preview and provider evidence to the reviewed commit.
- Treat a successful build, uploaded version, active deployment, backend state, and working public
  route as separate facts.
- Keep all production changes behind explicit user approval. This includes schema or data changes,
  imports, authentication changes, domains, secrets, provider configuration, backend promotion, and
  traffic cutover. A request to migrate or prepare a preview is not approval for these changes.
- Keep the old host or known-good deployment available until the cutover and observation gates pass.
- Use the operator's named browser profile when saved-session behavior is part of the release gate.
- Before requesting production approval, define the observation duration, signals, failure
  threshold, rollback trigger, rollback command, and rollback verification.

## Finish with bidirectional learning

For every material difference, select one destination:

- target project only
- Samebase only
- shared guidance or code
- intentionally different
- deferred for more evidence

Keep target changes and Samebase changes in separate branches and pull requests. Do not put the
adoption journal in the target application repository. When the Samebase repository is available,
store the compact case record under `research/project-adoption/cases/`. Otherwise, return a complete
case record that can be added there later.

Promote a candidate portable rule only after a second independent project uses it successfully.

## Handoff

Report:

- target pull request and reviewed commit
- current gate and production-cutover state
- preserved behavior and validation evidence
- delegation tree, worktrees, and integrated or rejected outputs
- blockers, approvals, and rollback state
- target-only, Samebase-only, shared, different, and deferred findings
- relevant preview URL, or state that none is running
