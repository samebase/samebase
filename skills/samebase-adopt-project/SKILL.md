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

Treat a comprehensive Samebase adoption request as authority for reviewable repository changes, a
pull request, a new isolated Samebase-connected Worker, GitHub Builds trigger configuration that
cannot start an active deployment, and preview version uploads. These actions must not replace
existing traffic. A pull request is not a production change. Require explicit approval before
changing an existing production resource, starting an active deployment, changing schema, data,
authentication, secret, domain, route, backend promotion, or current traffic.

## Use the Samebase control surface

1. Read the installed Samebase skill and Samebase inventory before each Samebase resource write.
   Reuse the vault that matches the exact repository.
2. Create a new isolated Worker through a Samebase action or the Samebase UI by default. Attach an
   existing Worker only after the user selects it and you verify its ownership and live traffic. A
   standalone Worker created directly at the provider is only a boundary spike. It is not a
   completed Samebase adoption.
3. Require the Worker to report the target GitHub repository and root as ready. Require one
   production trigger for the default branch and one preview trigger for other branches. Test and
   record this Teardown candidate before you create or update the triggers: run the exact install,
   build, production deploy dry-run, and preview deploy dry-run commands from the commit that the
   provider will build. Keep this check as a candidate until another project validates it. If
   trigger setup automatically builds the default branch, continue without new approval only when
   the provider can skip that build or the exact default-branch command must stop before deployment.
   Otherwise, require explicit approval for the named first active deployment before trigger
   creation. An expected pre-deploy failure is not release evidence.
4. Reread Samebase inventory after every attachment, trigger configuration, retry, or repair. Use
   provider-native reads for terminal build, version, deployment, route, and log evidence.

Test and record this Teardown candidate when the Samebase MCP does not expose the required action:
verify the active Samebase session and selected provider account, create an authenticated browser
handoff, complete only the missing action in the in-app Browser, and then reread inventory. Do not
replace the missing Samebase action with a manual standalone provider workflow. Keep this handoff as
a candidate until another project validates it.

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
- Do not pass the Preview gate until repository CI and the provider branch build both finish
  successfully for that commit. If either fails, read the native logs, repair the repository or
  trigger, push a new commit, and wait for a new successful build.
- Treat a successful build, uploaded version, active deployment, backend state, and working public
  route as separate facts.
- Require a reachable non-production version URL or a provider-specific preview deployment. A
  version record with an unreachable URL does not pass Preview.
- Keep all production changes behind explicit user approval. This includes schema or data changes,
  imports, authentication changes, domains, secrets, changes to an existing production provider
  configuration, backend promotion, and traffic cutover. A request to migrate or prepare a preview
  is not approval for these changes.
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
