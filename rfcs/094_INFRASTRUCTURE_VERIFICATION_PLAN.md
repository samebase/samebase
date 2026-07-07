# 094 Infrastructure Verification Plan

## Document Control

- Status: Proposed
- Owner: Nicu Chiciuc
- Created: 2026-07-07
- Origin: operator question after the v1651 deploy-key rename (PR #1171,
  https://github.com/samebase/samebase/pull/1171): fresh provisioning wires the conventional
  `CONVEX_DEPLOY_KEY` contract, but a Worker wired before the rename keeps its recorded
  `convexBuildAccess: wired` state, and the product offers no way to notice or repair the stale
  wiring.
- Related rfcs: `rfcs/090_PROVISIONING_BUILDING_BLOCKS_PLAN.md` (the block set this extends),
  `rfcs/093_AGENT_NATIVE_ONE_BASE_PLAN.md` (the status noun and `nextAction` that render
  verification results; names the "state lies amplified" risk this plan mitigates)
- Related specs: `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`,
  `specs/105_CLOUDFLARE_MANUAL_WORKER_CONNECTION_SPEC.md`,
  `specs/106_CONVEX_MANUAL_DEPLOYMENT_CONNECTION_SPEC.md`
- Related research: `research/2026-05-16-cloudflare-workers-build-preview-env-ui-gap.md`

## Problem

Registry state is trust-on-write. The rfcs/090 blocks record durable state when they succeed
(`deployment.builds`, `deployment.convexBuildAccess` on `vaultCloudflareWorkers`), and every
downstream surface derives from that record alone: `getUserVaults` resolves `convexDeployKeys` from
`deployment.convexBuildAccess.state` (`apps/samebase/convex/vault/dashboard.ts:329`) without ever
re-reading the live trigger. Nothing in the product re-observes provider state after a block
succeeds.

Live state and the wiring contract both move underneath the record:

1. Users can edit or delete trigger variables, triggers, build tokens, and Workers directly in the
   Cloudflare dashboard; the registry keeps saying `wired`.
2. Samebase's own contract evolves. v1651 renamed the production trigger variable from
   `PROD_CONVEX_DEPLOY_KEY` to `CONVEX_DEPLOY_KEY`, and the build script that consumes it
   (`apps/samebase/scripts/build-cloudflare.ts`) lives in the user's repo and hard-requires the new
   name with no legacy fallback. A pre-rename Worker plus a refreshed starter script fails its next
   production build with "Set CONVEX_DEPLOY_KEY…" while the dashboard shows deploy keys set.

When the record is wrong, the repair is unreachable, not merely missing: the resource rail hides
"Set Convex deploy keys" unless `convexDeployKeys.state === "missing"`
(`apps/samebase/src/components/vault-dashboard/vaultResourceRailState.ts:428`), and the wiring
mutation early-returns for a Worker already recorded as wired
(`apps/samebase/convex/vault/cloudflareMutations.ts:1157`). The only unlock is correcting the
recorded state itself.

rfcs/093 already names both halves of the fix. Its boundary rule wraps an operation when "it must
update the durable registry to stay truthful" — attach, import, and retry do that only at
user-initiated write time; nothing does it at read time. And its risk register calls the consequence
"state lies amplified": an agent repeating a wrong dashboard state acts on it confidently.
Verification is the missing verb for both.

## Locked Decisions

1. One new block, `verify_infrastructure`, joins the rfcs/090 block set. It is vault-scoped
   (`{ vaultId }`, covering every app's provider rows in the vault, matching
   `retry_infrastructure_provisioning`). It re-reads the live provider facts behind the status noun
   and patches the registry rows to what it observed. It renders nothing new: the refreshed noun and
   `nextAction` resurface the existing repair actions.
2. Presence-only assertions. Verification checks only the facts the Samebase contract depends on —
   the expected variable names on the expected triggers, the trigger's binding to the recorded repo
   and root directory. Anything else on the trigger is the user's configuration: never judged, never
   deleted, never reported. Extra variables a user added are invisible to verification.
3. Names, never values. Verification reads variable names and resource identity. Secret values are
   never fetched, stored, logged, or compared (existing rfcs/090 doctrine).
4. Fail closed on unverifiable. A provider error, a missing or expired connection, or a Worker-scope
   404 writes nothing. Only a successful authoritative read that contradicts the record flips state.
   "Could not verify" and "verified false" are different outcomes; only the second writes.
5. On-demand only. No cron, no background reconciliation, no polling. Freshness is expressed by
   `lastObservedAt`, which already exists on `vaultCloudflareWorkers` and `vaultConvexDeployments`
   and is today written once at attach; verification stamps it on every row it confirms or corrects.
6. Existing run machinery. One `appProvisioningRuns` run per execution with trigger
   `verify_infrastructure`, the same single-owner fencing, events for progress. Verification refuses
   to start while another run for the vault is active.

## Verification Checks (Phase 1)

| Axis                           | Live read                                                            | Flips when                                                                                         | Remedy the noun then names   |
| ------------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------- |
| `deployment.builds`            | Triggers by recorded `triggerUuid`; repo binding and `rootDirectory` | Trigger gone or bound to a different repo/root while the Worker itself is present                  | `wire_builds`                |
| `deployment.convexBuildAccess` | Variable names on the recorded production and preview triggers       | `CONVEX_DEPLOY_KEY` absent on the production trigger or `PREVIEW_CONVEX_DEPLOY_KEY` on the preview | `wire_convex_build_access`   |
| Confirmed rows                 | —                                                                    | —                                                                                                  | none; stamp `lastObservedAt` |

Rules:

- A trigger-scope 404 with the Worker present is authoritative and flips `builds` to
  `not_connected`. A Worker-scope 404 is not authoritative in Phase 1 and writes nothing: recording
  `builds: not_connected` against a deleted Worker would point the noun at `wire_builds`, which
  cannot succeed. Worker existence is Phase 2.
- Flipping `builds` to `not_connected` also resets `convexBuildAccess` to `not_wired`, the
  `buildVaultCloudflareDeploymentNotConfigured` pairing: the keys were wired into triggers that no
  longer exist, and re-wiring builds creates new triggers that need access wired again.
- Phase 1 requires no schema change. It writes existing union variants plus `lastObservedAt`.

## Phases

Phase 1 — **Block and dashboard action**: the `verify_infrastructure` block covering the two
Cloudflare deployment axes above; a "Verify infrastructure" entry in the app resource rail, shown
when the vault has at least one attached Worker row, disabled while any run is active; no result UI
beyond the refreshed noun. Truth-table tests extend the existing `nextAction` enumeration.

Phase 2 — **Existence checks**: Worker and Convex deployment existence, each with a new explicit
missing-upstream variant on its row and a `nextAction` mapping to `connect_cloudflare_worker` /
`connect_convex_deployment` / `retry_infrastructure_provisioning`. This is a state-shape change and
ships as its own reviewed slice.

Phase 3 — **MCP exposure**: a `verify_infrastructure` contract joins the rfcs/093 Phase 2c catalog
slice. For an agent the verb closes the operate loop — read the noun, act, verify, read the noun —
and per rfcs/093 exposure is a contract file, not new provisioning code.

## Rollout Notes

- Cohort check before treating this as the rename remedy: count production `vaultCloudflareWorkers`
  rows wired before v1651 (2026-07-06) using `docs/convex-production-reads.md`. Expected near zero
  given the age of these tables. The block's value is standing regardless: the wiring contract
  changed three times in the week before this RFC (app-root suggestions, the deploy-key rename, the
  deploy command).
- No data migration. Running verification is the migration path for stale rows: it flips exactly the
  states whose repair re-wires them under the current contract.

## Non-Goals

- No scheduled or background reconciliation.
- No GitHub repo rename/transfer detection: no remedy verb exists, and provisioning keys off the
  immutable `ghRepoId`. Revisit only with a remedy in hand.
- No provider token validity checks: the existing connection health checks own that
  (`checkGithubConnectionHealth`, `checkCloudflareMcpTokenHealth`).
- No custom-domain, D1/queues/crons, or other day-2 verification: rfcs/093 keeps day-2 surfaces
  provider-direct via taught referrals.
- No build success/failure reporting: Cloudflare's build history is that surface.
- No environment-variable value reads, ever.
- No standalone health-report UI.

## Risks

- **False degraded flip**: verification wrongly marks a healthy axis. Bounded by the fail-closed
  rule, and the cost is one redundant re-run of an idempotent wire block.
- **Racing an active run**: excluded by run fencing (Locked Decision 6).
- **Builds API drift**: the env-var listing endpoint is the same one `wire_convex_build_access`
  already uses for read-back verification; both go through one shared helper.
- **Scope creep toward a provider health dashboard**: the presence-only rule and Non-Goals are the
  guard; verification only ever checks facts with an existing remedy.

## Open Questions

1. Should verification also compare `buildCommand` / `deployCommand` against the current starter
   contract? Recommendation: no. The commands are legitimately user-customized; repo binding and
   `rootDirectory` define which code builds and are checked, the commands are the user's.
2. Should the rail surface `lastObservedAt` ("verified 2h ago")? Recommendation: not in v1; the
   verification run is already visible in run history, and the rail stays minimal.

## Validation

- State-axis enumeration tests for the verification decision as a pure function over (recorded row,
  live reads): per axis, confirmed / contradicted / unverifiable, and unverifiable never writes.
- Extended `nextAction` truth-table coverage in
  `apps/samebase/convex/vault/dashboard.convex.test.ts` for post-verification degraded states.
- Manual recipe: wire an app; delete the `CONVEX_DEPLOY_KEY` variable on the production trigger in
  Cloudflare; run "Verify infrastructure"; "Set Convex deploy keys" reappears; run it; verify again
  and observe the axis back at `set` with a fresh `lastObservedAt`.
