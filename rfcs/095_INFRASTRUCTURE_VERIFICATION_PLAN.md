# 095 Infrastructure Verification Plan

## Document Control

- Status: Proposed
- Owner: Nicu Chiciuc
- Created: 2026-07-07
- Last updated: 2026-07-08 (rewritten around the block-verifier registry after operator review)
- Origin: operator question after the v1651 deploy-key rename (PR #1171,
  https://github.com/samebase/samebase/pull/1171): fresh provisioning wires the conventional
  `CONVEX_DEPLOY_KEY` contract, but a Worker wired before the rename keeps its recorded
  `convexBuildAccess: wired` state, and the product offers no way to notice or repair the stale
  wiring.
- Related rfcs: `rfcs/090_PROVISIONING_BUILDING_BLOCKS_PLAN.md` (the block set this extends),
  `rfcs/093_AGENT_NATIVE_ONE_BASE_PLAN.md` (the status noun and `nextAction` that render
  verification results), and the agent action docs registry plan (guide layer; pending as
  `rfcs/094_AGENT_ACTION_DOCS_REGISTRY_PLAN.md` on branch `codex-agent-docs-registry-rfc`, already
  referenced from rfcs/093 on main — the long-form `verify_infrastructure` guide lands there once it
  merges)
- Related specs: `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`,
  `specs/105_CLOUDFLARE_MANUAL_WORKER_CONNECTION_SPEC.md`,
  `specs/106_CONVEX_MANUAL_DEPLOYMENT_CONNECTION_SPEC.md`
- Related research: `research/2026-05-16-cloudflare-workers-build-preview-env-ui-gap.md`

## Problem

Registry state is trust-on-write. Every rfcs/090 block records durable state when it succeeds
(`deployment.builds`, `deployment.convexBuildAccess` on `vaultCloudflareWorkers`), and every surface
derives from that record alone — `getUserVaults` resolves `convexDeployKeys` from
`deployment.convexBuildAccess.state` (`apps/samebase/convex/vault/dashboard.ts:347`) and nothing
ever writes a fresh observation back. Live state and the wiring contract both move underneath the
record: users edit or delete triggers, variables, and Workers in the Cloudflare dashboard, and
Samebase's own conventions change — v1651 renamed the production variable to `CONVEX_DEPLOY_KEY`
while the build script shipped into user repos hard-requires the new name
(`apps/samebase/scripts/build-cloudflare.ts`), so a pre-rename Worker plus a refreshed starter
script fails its next production build while the dashboard shows deploy keys set.

A wrong record does not just hide the problem; it locks the repair. The resource rail shows "Set
Convex deploy keys" only while the record says missing
(`apps/samebase/src/components/vault-dashboard/vaultResourceRailState.ts:428`), and the wiring
mutation early-returns while the record says wired
(`apps/samebase/convex/vault/cloudflareMutations.ts:1157`). The only unlock is correcting the record
itself.

The same disease exists one level up. If verification shipped as one action with a hand-maintained
list of checks, the block set would keep growing while the check list silently lagged — verification
coverage itself becoming trust-on-write. The design below makes coverage grow with the block set by
construction.

## The Rule: The Verifier Is Part Of The Block

Each rfcs/090 block writes one durable registry axis (`source_setup` → the vault row and
`vaultBranchTrees`, `wire_builds` → `deployment.builds`, `wire_convex_build_access` →
`deployment.convexBuildAccess`, `attach_worker` → the Worker row, `attach_convex` → the deployment
row). Verification pairs with that write, not with a central list:

1. Every provisioning block that owns a durable registry axis declares its verification story in one
   registry entry: either a **verifier** for that axis, or a **not-verifiable declaration** carrying
   a closed-union `category` plus prose `detail`. The registry is exhaustively typed against the
   union of axis-owning blocks (`satisfies`), so adding a block without deciding its verification
   story fails typecheck instead of relying on review memory — and a reason outside the taxonomy
   fails the same way:

   ```ts
   const blockVerification = {
     wire_builds: { verify: verifyConnectedBuilds },
     wire_convex_build_access: { verify: verifyConvexBuildAccess },
     attach_worker: {
       notVerifiable: {
         category: "state_shape_not_ready",
         detail: "existence verifier lands in Phase 2 with the missing-upstream variant",
       },
     },
     attach_convex: {
       notVerifiable: {
         category: "state_shape_not_ready",
         detail: "existence verifier lands in Phase 2 with the missing-upstream variant",
       },
     },
     source_setup: {
       notVerifiable: {
         category: "no_remedy",
         detail: "a deleted or renamed source repo has no re-create/re-link verb in the catalog",
       },
     },
   } satisfies Record<DurableAxisBlockId, BlockVerification>;
   ```

2. A verifier is a pure decision over (recorded row, live reads) returning
   `confirmed | contradicted | unverifiable`. `unverifiable` is a first-class honest outcome, never
   an error path — a fake verifier written to satisfy the type is worse than a declared gap.
3. The `category` is a closed union on the registry shape, so an unlisted reason fails typecheck
   rather than review — "we didn't bother" is unrepresentable. Extend the union (and this list) only
   when a real new category appears:
   - **`no_remedy`** — detection would surface a dead-end. `source_setup`: a deleted or renamed
     source repo has no re-create/re-link verb in the catalog.
   - **`state_shape_not_ready`** — the read is possible but there is no truthful variant to write.
     `attach_worker` / `attach_convex` until Phase 2's missing-upstream variant.
   - **`no_authoritative_read`** — trigger variable values are write-only in the Builds API;
     variable names are the honest proxy, the values stay permanently unverifiable.
   - **`needs_user_intent`** — a moved app root is detectable against the synced tree, but the fix
     is the user re-picking the root, not a mechanical repair; declared until such a flow exists as
     a verb.
   - **`owned_elsewhere`** — provider token validity belongs to the existing connection health
     checks; a verifier would duplicate a fact that already has one owner.
4. The registry key union is exactly the blocks that own a durable registry axis. Read-only
   discovery contracts and one-shot events that leave no ongoing claim (the initial production build
   trigger, for example) have nothing to re-verify. `verify_infrastructure` itself owns no axis — it
   writes corrections into axes owned by the blocks above — so it is the registry's consumer, not an
   entry; there is no recursive verification story.

## Locked Decisions

1. One new block, `verify_infrastructure`, app-scoped (`{ vaultId, appRoot }`) like the wire repair
   verbs and the Worker rows it verifies. It fans out over the applicable verifiers, patches the
   registry rows to what they observed, and renders nothing new: the refreshed status noun and
   `nextAction` resurface the existing repair actions. One dashboard action — per-block checks are
   composition, not buttons.
2. Presence-only assertions. Verifiers check only the facts the Samebase contract depends on — the
   expected variable names on the expected triggers. Anything else on the trigger is the user's
   configuration: never judged, never deleted, never reported.
3. Names, never values. Verifiers read variable names and resource identity; secret values are never
   fetched, stored, logged, or compared (existing rfcs/090 doctrine).
4. Fail closed on unverifiable. A provider error, a missing or expired connection, or a Worker-scope
   404 writes nothing; only a successful authoritative read that contradicts the record flips state.
   The authority is not always the provider: for the wired-without-deployment reset the registry
   itself is the authoritative read — whether a Convex deployment row exists for the app root is a
   Samebase fact, so that contradiction flips with no provider call. Writes are per-row atomic:
   every live read a row needs must succeed before that row's single conditional patch, so a mid-run
   provider failure never leaves a half-verified row.
5. On-demand only. No cron, no background reconciliation, no polling. Freshness is expressed by
   `lastObservedAt` (already on both `vaultCloudflareWorkers` and `vaultConvexDeployments`; also
   refreshed today by Convex schema snapshot reads,
   `apps/samebase/convex/vault/convexSchemaGraph.ts:1291`). Phase 1 stamps it only on Worker rows a
   verifier confirmed or corrected — it means Cloudflare-trigger freshness, nothing broader.
6. Existing run machinery. One `appProvisioningRuns` run per execution with trigger
   `verify_infrastructure` — one new literal in `vAppProvisioningRunTrigger`
   (`apps/samebase/convex/schema.ts:108`), the only validator edit in Phase 1 — fenced by the same
   `vaultInfrastructureOwnership` claim pattern the blocks use. Verification refuses to start while
   another run for the vault is active.
7. One contract, every surface. The `verify_infrastructure` contract module registers in the action
   catalog (`apps/samebase/convex/toolRuntime/actionCatalog.ts`, shipped v1656), which renders the
   MCP tool, the generated `/docs/actions/verify_infrastructure.md` page, llms.txt, and usage
   attribution in one move; the catalog `id` doubles as the `nextAction` vocabulary. Because catalog
   entry means MCP exposure, the implementation PR carries the catalog convention's
   MCP-write-surface section: this tool writes only Samebase registry rows, and its provider access
   is read-only.

## Seed Verifiers (Phase 1)

| Verifier                                        | Live read                                                         | Contradicted when                                                                                                                                                                           | Remedy the noun then names                                                 |
| ----------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `verifyConnectedBuilds` (`deployment.builds`)   | Recorded production and preview triggers fetched by `triggerUuid` | A recorded trigger is gone (404) while the Worker itself is present                                                                                                                         | `wire_builds`                                                              |
| `verifyConvexBuildAccess` (`convexBuildAccess`) | Variable names on both recorded triggers                          | Either recorded trigger is missing `CONVEX_DEPLOY_KEY` or `PREVIEW_CONVEX_DEPLOY_KEY`; or recorded `wired` with no Convex deployment row for the app root (registry-internal, no live read) | `wire_convex_build_access` (after `attach_convex` when the row is missing) |

Rules:

- A trigger that exists but is bound to a different repo or root does not flip in Phase 1: today's
  `wire_builds` throws on a conflicting same-kind trigger
  (`assertBuildTriggerMatchesRepositoryAndRoot`, `apps/samebase/convex/cloudflareResources.ts:1182`)
  instead of repairing it, so flipping would point the noun at a dead-end remedy. Rebind detection
  ships in Phase 2 together with that `wire_builds` repair path.
- Flipping `builds` to `not_connected` also resets `convexBuildAccess` to `not_wired`: the keys were
  wired into triggers that no longer exist, and re-wiring builds creates new triggers that need
  access wired again.
- Phase 1 needs no provider-row schema change — verifiers write existing union variants plus
  `lastObservedAt`.

## Phases

Phase 1 — **Registry and seed verifiers**: the `blockVerification` registry with the two Cloudflare
verifiers above and explicit not-verifiable declarations for `source_setup`, `attach_worker`, and
`attach_convex`; the `verify_infrastructure` block, contract module in the action catalog, and a
"Verify infrastructure" entry in the app resource rail (shown when the app has an attached Worker
row, disabled while any run is active; no result UI beyond the refreshed noun — for an agent the
verb closes the operate loop: read the noun, act, verify, read the noun). Truth-table tests extend
the existing `nextAction` enumeration.

Phase 2 — **Existence verifiers**: fill the `attach_worker` and `attach_convex` registry entries —
Worker and Convex deployment existence, each with a new explicit missing-upstream variant on its row
and a `nextAction` mapping to `connect_cloudflare_worker` / `connect_convex_deployment` /
`retry_infrastructure_provisioning`. This is a state-shape change and ships as its own reviewed
slice. Phase 2 also takes trigger rebinding, paired with teaching `wire_builds` to repair a
conflicting same-kind trigger instead of throwing.

## Rollout Notes

- Cohort check before treating this as the rename remedy: count production `vaultCloudflareWorkers`
  rows wired before v1651 (2026-07-06) using `docs/convex-production-reads.md`. Expected near zero.
  The registry's value is standing regardless: the wiring contract changed three times in the week
  before this RFC.
- No data migration. Running verification is the migration path for stale rows: it flips exactly the
  states whose repair re-wires them under the current contract.

## Non-Goals

- No scheduled or background reconciliation.
- No per-block user-facing buttons; verifiers compose under one action.
- No GitHub repo rename/transfer detection: no remedy verb exists, and provisioning keys off the
  immutable `ghRepoId`.
- No provider token validity checks: the existing connection health checks own that.
- No custom-domain, D1/queues/crons, or other day-2 verification: rfcs/093 keeps day-2 surfaces
  provider-direct via taught referrals.
- No build success/failure reporting: Cloudflare's build history is that surface.
- No environment-variable value reads, ever.
- No standalone health-report UI.

## Risks

- **False degraded flip**: bounded by the fail-closed rule; the cost is one redundant wire re-run,
  which is not a silent no-op — re-running `wire_convex_build_access` rotates the deploy keys and
  starts a production build (`apps/samebase/convex/vault/cloudflare.ts:1078`).
- **Fake verifiers**: the exhaustive registry invites writing a shallow verifier just to satisfy the
  type. `notVerifiable` with a reason is the honest and reviewable alternative; reviewers treat a
  verifier without an authoritative live read as a defect.
- **Racing an active run**: excluded by ownership fencing (Locked Decision 6).
- **Builds API drift**: the env-var listing endpoint is the same one `wire_convex_build_access`
  already uses for read-back verification; both go through one shared helper.

## Open Questions

1. Should verifiers also compare `buildCommand` / `deployCommand` against the current starter
   contract? Recommendation: no — the commands are legitimately user-customized; presence-only stays
   the rule until a concrete incident argues otherwise.
2. Should the rail surface `lastObservedAt` ("verified 2h ago")? Recommendation: not in v1; the
   verification run is visible in run history, and the rail stays minimal.

## Validation

- Registry exhaustiveness is the type check itself: a new block fails compilation until it declares
  a verifier or a not-verifiable reason.
- Per-verifier state-axis enumeration tests over (recorded row, live reads): confirmed /
  contradicted / unverifiable, and unverifiable never writes.
- Extended `nextAction` truth-table coverage in
  `apps/samebase/convex/vault/dashboard.convex.test.ts` for post-verification degraded states.
- Manual recipe: wire an app; delete the `PREVIEW_CONVEX_DEPLOY_KEY` variable from the production
  trigger in Cloudflare; run "Verify infrastructure"; "Set Convex deploy keys" reappears; run it;
  verify again and observe the axis back at `set` with a fresh `lastObservedAt`.
