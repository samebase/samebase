# 090 Provisioning Building Blocks Plan

## Document Control

- Status: Proposed
- Owner: vault infrastructure provisioning, Cloudflare/Convex resource attachment
- Created: 2026-07-03
- Last updated: 2026-07-03
- Related specs:
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
  - `specs/090_CREATE_APP_WORKFLOW_PROVISIONING_SPEC.md`
  - `specs/096_INITIALIZING_VAULT_GITHUB_PROVISIONING_SPEC.md`
  - `specs/097_EXISTING_REPOSITORY_WORKFLOW_ONBOARDING_SPEC.md`
  - `specs/101_CLOUDFLARE_WORKERS_SINGLE_STACK_MIGRATION_SPEC.md`
  - `specs/105_CLOUDFLARE_MANUAL_WORKER_CONNECTION_SPEC.md`
  - `specs/106_CONVEX_MANUAL_DEPLOYMENT_CONNECTION_SPEC.md`
- Related research:
  - `research/2026-05-19-existing-app-resource-adoption.md`
  - `research/2026-05-22-provider-resource-discovery-and-configuration.md`
- Origin: operator design discussion following draft PR #1146
  (https://github.com/samebase/samebase/pull/1146), which collapsed Worker attachment and deployment
  wiring into one step and was closed in favor of this plan.

## Problem

Provisioning today is two disjoint systems that share plumbing but not composition:

1. The previous full create-app workflow reached a single combined Cloudflare deployment state
   through the `ensure_cloudflare` mega-step, which spans three providers in one action: it re-runs
   Convex preview provisioning (the `ensure_convex_preview` step result is discarded because the
   preview URL is never persisted), mints both Convex deploy keys, fetches GitHub repo identity, and
   only then does Cloudflare work. The Convex dependency is structural
   (`CloudflareProvisionConvexState` inside `EnsureCloudflareResourcesArgs`).
2. The manual attach flows (specs 105/106) attach resources and stop. Nothing ever transitions a
   manually attached Worker into connected builds or fills manually attached Convex deploy-key
   slots. Imported repositories therefore can never reach a built, deployed state through Samebase.

Both specs 105 and 106 defer "deployment wiring" as a later state model. This RFC is that state
model, plus the block decomposition that lets the full flow and the partial flows share it.

Draft PR #1146 demonstrated the failure mode of wiring this ad hoc: attachment happened only if the
entire wiring succeeded (a failed env-var call deleted the just-created Worker), Worker creation
hard-required a pre-attached Convex deployment, and a Cloudflare-flow mutation overwrote
Convex-domain deploy-key state.

## Locked Decisions

1. One block set. The full create-app flow is eventually recomposed from the same building blocks
   the partial flows use. `ensure_cloudflare` as a three-provider mega-step dissolves.
2. Convex is optional. Cloudflare-only apps with no Convex at all are a supported product case.
   Worker creation and builds wiring must never require a Convex deployment.
3. Builds wiring and Convex build access are two separate durable states on the Worker row, each
   with its own block. A Worker can build and deploy without Convex; Convex build access is added
   later when a deployment is attached.
4. Cloudflare's own Worker-to-repository/root link is the adoption evidence for existing Workers.
   Discovery preselects candidates whose build triggers reference the vault's immutable GitHub repo
   id and app root; the user approves. No auto-attach: multiple Workers per repo is a legitimate,
   documented Cloudflare configuration (monorepos, staging/production environments).
5. PR #1146 stays closed. Its useful pieces (helper exports, deploy-key recording, build-context
   read) re-land inside the block shapes below.

## Building Blocks

| #   | Block                                          | Provider effects                                                                                     | Durable state written                                 | Status                                                |
| --- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| 1   | `source_setup` (create or import repo)         | GitHub repo create / fetch, seed, tree sync                                                          | vault row, `observations_vaultRepository_branchTrees` | exists                                                |
| 2   | `attach_convex` (create or select project)     | Convex project/deployment reads or create                                                            | `vaultConvexDeployments` row                          | exists (spec 106)                                     |
| 3   | `attach_worker` (create or select Worker)      | Worker create or list-verify                                                                         | `vaultCloudflareWorkers` row                          | exists (spec 105); selection becomes discovery-driven |
| 4   | `configure_workers_builds_for_github`          | repo connection, prod+preview triggers, build token, first build when no Convex env wiring is needed | `builds` axis on the Worker row                       | new                                                   |
| 5   | `rotate_convex_deploy_keys_for_workers_builds` | mint prod+preview deploy keys, PATCH trigger env vars                                                | `convexBuildAccess` axis + `deployKeys` slots         | new                                                   |

Rules:

- `configure_workers_builds_for_github` takes an attached Worker (either origin) and the vault's
  connected GitHub repo. It has no Convex inputs. Trigger env vars at this stage carry no Convex
  values.
- `rotate_convex_deploy_keys_for_workers_builds` requires `attach_convex` and
  `configure_workers_builds_for_github` to have completed. It ensures the preview deployment
  (persisting its identity, unlike today), mints the two deploy keys, records their ids on the
  Convex row, and PATCHes the Workers Builds env vars with both `CONVEX_DEPLOY_KEY` and
  `PREVIEW_CONVEX_DEPLOY_KEY` on every recorded trigger. This mirrors the Cloudflare dashboard's
  visible build-variable table while the build script still selects the branch-appropriate key from
  `WORKERS_CI_BRANCH`. This block patches only those deploy-key variables; key material never
  touches the workflow journal (existing doctrine).
- The temporary dashboard repair path exposes the same blocks after manual or partial setup:
  `Configure Workers Builds for GitHub` runs `configure_workers_builds_for_github` when an attached
  Worker is not connected to the vault's GitHub repository, and
  `Rotate Convex deploy keys for Workers Builds` runs `rotate_convex_deploy_keys_for_workers_builds`
  when the same app root has Convex, connected Builds, and missing Convex build access.
- Blocks keep the existing run machinery: one `workflow_vaultProvisioning_runs` run per block
  execution, the acquire/ensure/finish write-lock pattern, and events for progress. The triplicated
  lock-acquisition helper stack should collapse into one shared implementation as blocks land.
- Failure isolation: a failed `configure_workers_builds_for_github` never deletes the attached
  Worker. Rollback deletes only what the failing block itself created in that run.

Flow compositions:

- New app: 1(create) → 2(create) → 3(create) → 4 → 5.
- Cloudflare-only app: 1 → 3 → 4.
- Imported repo moving to Cloudflare (the chessmerge.com case, Convex exists + Netlify today):
  1(import) → 2(select existing) → 3(create or discovered) → 4 → 5.
- Late Convex adoption: 2 + 5 against an already-built Worker (env-var PATCH only).
- Manual repair after partial setup: run 4 from the Cloudflare row when the Worker is not connected
  to the GitHub repository; run 5 from the Cloudflare row when only the Convex deploy keys are
  missing.

## Worker Deployment State Model

`vaultCloudflareWorkers.deployment` is two independent axes:

- `builds`: `{ state: "not_connected" }` |
  `{ state: "connected", rootDirectory, buildCommand, deployCommand, previewDeployCommand, pathIncludes, pathExcludes, production: { triggerUuid, buildTokenUuid }, preview: { triggerUuid, buildTokenUuid } }`
- `convexBuildAccess`: `{ state: "not_wired" }` | `{ state: "wired" }` (deploy-key identifiers stay
  on the `vaultConvexDeployments.deployKeys` slots, which remain the single home for key ids)

No backwards-compatibility adapter is kept for the old Samebase row variants. If local or operator
data still contains the previous shape, delete and recreate those rows instead of carrying that
state through the model.

## Worker-Repo Discovery Contract

Facts established from Cloudflare's published API (generated subset refreshed in v1634) and docs:

- The link is trigger-mediated: an account-scoped `repo_connection`
  (`provider_type`/`provider_account_id`/`repo_id` → `repo_connection_uuid`, soft-deletable) is
  referenced by per-Worker build triggers (`external_script_id` = immutable Worker tag). A newer
  aggregate `GET /accounts/{account_id}/builds/workers/{script_tag}` exposes `git_repository`
  (including `repo_id`) directly. A trigger's repo binding is fixed at creation; PATCH cannot
  repoint it.
- Worker → repo/app-root is strong and callable today: `listBuildTriggers` already fetches the
  embedded `repo_connection` and trigger `root_directory`; the code just never reads that pair
  together.
- Repo → Workers has no direct endpoint (no account-level list of connections or triggers, no repo
  filter — upstream API truth, not a subset artifact). Discovery scans: list account Workers, then
  one Builds read per Worker, matching `repo_id === vault.ghRepoId` (Samebase writes the immutable
  numeric GitHub repo id into `repo_id`). Cost is 1 + N calls against a 1,200-requests/5-min
  user-token budget; acceptable for realistic account sizes.
- Candidate tiers follow `research/2026-05-22`: strong = repo-id and normalized root-directory match
  with `deleted_on == null`; owner/name or Worker-name similarity is suggestion-only. Strong
  candidates are preselected in the add-Cloudflare dialog with their repo/root evidence shown;
  "create new Worker" remains alongside.
- Root-directory evidence stays transient Cloudflare state during discovery. Samebase persists a
  root only after it wires or records a connected Workers Builds config for the vault app root.

Discovery UI classification:

- `recommended`: at least one active Builds trigger has `repo_connection.repo_id === vault.ghRepoId`
  and normalized `root_directory` equal to the vault app root's Cloudflare build root. Show the
  repo/root evidence and preselect the Worker when it is the only strong match, but still require
  user confirmation.
- `available`: no active Builds repo trigger is present. The Worker is selectable because wiring the
  vault repo would not overwrite an existing repo relation.
- `blocked`: an active Builds trigger points at a different repo id, or it points at the same repo
  id with a different normalized root directory. Show the conflicting repo/root evidence when
  available and disable selection; Samebase must not connect or patch this Worker for the current
  vault app root until Builds is disconnected, another Worker is chosen, or the matching app root is
  selected. Same-repo/different-root candidates rank above `available` candidates because they are
  the most likely operator mistake.
- `unknown`: Samebase cannot read trigger repo identity or root directory. Do not wire
  automatically; fail closed for wiring until the repo/root relation can be inspected.

Verification probes required before implementation (one-time, live):

1. Do dashboard-created repo connections return a numeric `repo_id` (the OpenAPI example shows a
   repo name)?
2. Does the per-Worker triggers list include soft-deleted triggers (`deleted_on` set)?
3. Is `PUT /builds/repos/connections` a true upsert (same uuid for the same repo triple)?
4. Does `GET /builds/workers/{script_tag}` return populated `git_repository` for trigger-only
   Workers created before Samebase used the aggregate Builds read, or 404?
5. `GET /workers/scripts` behavior past ~100 Workers (callers currently slice at 100; never-deployed
   Workers are absent from this listing).

## Phases

1. **Phase 0 — safety + probes.** Run the five probes. Fix the trigger-adoption guard:
   `matchesTriggerKind` adopts existing triggers by branch shape only and the upsert path PATCHes
   them without checking `repo_connection.repo_id`, so provisioning onto a Worker whose triggers
   point at a different repo silently reuses wrong-repo triggers. Stop before any schema change.
2. **Phase 1: state split + `configure_workers_builds_for_github`.** Narrow the Worker `deployment`
   shape to the two-axis model; local/operator data can be cleared instead of carrying internal
   backwards compatibility. `configure_workers_builds_for_github` as its own run (new trigger
   vocabulary), exposed on any attached Worker regardless of origin. Auto-queue it only after
   Samebase provisions a new Worker; selected existing Workers require an explicit user action.
   Convex-backed app roots defer the first build until Phase 2 writes build env vars; Convex-less
   roots can trigger immediately. Stop before Convex wiring.
3. **Phase 2: `rotate_convex_deploy_keys_for_workers_builds`.** Persist preview-deployment identity;
   deploy-key minting with slot recording owned by the Convex domain; env-var PATCH. Stop before
   discovery UI.
4. **Phase 3 — discovery.** Repo-id scan behind the add-Cloudflare dialog; preselected candidates
   with evidence. Stop before touching the full flow.
5. **Phase 4 — recompose the full flow.** `provisionApp` drives blocks 2–5 instead of
   `ensure_convex_preview` + `ensure_cloudflare`; delete the mega-step and the duplicated claim
   stacks. Update specs 003/105/106 (all three still describe superseded storage models).

## Non-Goals

- Per-resource detach (the inverse blocks). Noted dead end to resolve later: monorepo conversion
  errors with "Disconnect root providers before converting" while no disconnect flow exists.
- Custom domains and routing automation.
- Convex resource discovery from provider build/runtime env vars and any auto-creation of Convex
  projects during Cloudflare work.
- A generic provider framework or resource registry.

## Open Questions

- Run/trigger vocabulary for the new blocks: one new `workflow_vaultProvisioning_runs` trigger per
  block versus a parameterized wiring run.
- Whether the single-row-per-vault `workflow_vaultProvisioning_writeLocks` lock stays as-is when
  block runs compose in sequence (today three lock-acquisition paths contend on one row with a
  10-minute stale window).
- Teardown of wiring on `selected_existing` Workers: vault deletion currently skips such Workers
  wholesale, which would leave Samebase-created triggers behind; wiring state likely needs to make
  "triggers we created" deletable independently of the Worker.
- Whether `deleteCloudflareResources` should start deleting repo connections and build tokens it
  created (both are currently left orphaned at the provider).
