# 027 Hosting Provider Abstraction and Railway Pilot Spec

## Document Control

- Status: Proposed
- Owner: Noter platform
- Last updated: 2026-02-27
- Related specs:
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
  - `specs/004_AI_PROD_ACCESS_POLICY_SPEC.md`
  - `specs/016_FRONTEND_HOSTING_PROVIDER_SELECTION_SPEC.md`
  - `specs/017_NETLIFY_OAUTH_AND_TEAM_SELECTION_SPEC.md`
  - `specs/026_PROVIDER_CONNECTIONS_SPEC.md`

## Summary

Introduce a strict, function-based hosting-provider abstraction so Noter can
support both Netlify and Railway for noter-managed vault infrastructure.

Primary direction:

1. Refactor current Netlify implementation behind a hosting interface first.
2. Keep behavior unchanged while Netlify is the only implementation.
3. Add Railway as a second implementation after abstraction is stable.
4. Run a side-by-side pilot before any default-provider change.

## Why this spec exists

Current infra and prod-read flows are Netlify-coupled across schema,
provisioning, chat approval reads, and dashboard UX. Adding Railway directly
without a boundary would duplicate coupling and make future provider changes
expensive.

## Goals

1. Add a first-class hosting provider boundary for provisioning, status, logs,
   inventory, and teardown.
2. Preserve strict type-safety:
   - discriminated unions by `provider`
   - required provider-specific fields
   - no broad optional result shapes
3. Use function modules, not classes.
4. Keep Netlify fully working during the transition.
5. Add Railway as an additional provider for pilot comparison.

## Non-goals

1. Full Netlify removal in this phase.
2. Immediate default-provider switch to Railway.
3. Major redesign of Convex/GitHub provider boundaries.
4. Over-specifying final Railway rollout mechanics before pilot evidence.

## Design Constraints (locked)

1. No class-based provider implementations unless explicitly approved later.
2. Prefer discriminated unions over provider-indexed generic maps.
3. Optional fields are allowed only when truly partial:
   - DB patch payloads
   - migration/transitional persistence boundaries
4. Exhaustiveness checks in provider `switch` branches should use the
   `value satisfies never` pattern.
5. External behavior should remain stable while Netlify-only path is being
   refactored.

## Proposed Boundary

Hosting provider boundary covers only frontend hosting lifecycle:

1. Provision resources
2. Resolve production/default URL
3. Read status/logs/inventory for approved prod-access
4. Teardown provider resources

It explicitly does not own:

1. GitHub repo creation/seeding
2. Convex project/deployment provisioning
3. Non-hosting provider auth flows

## Data and Type Direction

1. Introduce `HostingProvider = "netlify" | "railway"`.
2. Add vault-level hosting selection for noter-managed vaults.
3. Use discriminated unions for provider results and read payloads.
4. Keep provider-specific identifiers in provider-specific union branches.
5. Avoid one large shape with many optional provider fields.

## Execution Plan (phased)

## Implementation Progress

- [ ] Phase 1 complete: Netlify abstraction extraction
- [ ] Phase 2 complete: Schema and API alignment
- [ ] Phase 3 complete: Railway provider connection
- [ ] Phase 4 complete: Railway hosting implementation
- [ ] Phase 5 complete: Provider selection and pilot rollout
- [ ] Phase 6 complete: Pilot evaluation and decision

### Phase 1: Netlify abstraction extraction (no behavior change)

- [ ] Add hosting provider function contract and `switch(provider)` dispatch.
- [ ] Move existing Netlify provisioning/read/teardown logic behind this
      contract.
- [ ] Keep Netlify as the only active implementation.
- [ ] Validate no behavioral regressions.

Exit criteria:

- [ ] Netlify path still passes existing flows.
- [ ] Callers no longer directly depend on Netlify implementation internals.

### Phase 2: Schema and API alignment for multi-hosting

- [ ] Introduce provider-aware hosting state and typed results.
- [ ] Add additive schema updates only.
- [ ] Keep backward compatibility for existing Netlify records and queries.

Exit criteria:

- [ ] Existing vaults continue to function without migration breakage.
- [ ] New types compile with strict provider discrimination.

### Phase 3: Railway provider connection

- [ ] Add Railway OAuth connect/disconnect/status surface.
- [ ] Persist required Railway token metadata for long-lived access.
- [ ] Add Railway connection UI beside existing providers.

Exit criteria:

- [ ] User can connect Railway and see stable connection state.
- [ ] Netlify connection flow remains unchanged.

### Phase 4: Railway hosting implementation

- [ ] Implement Railway provisioning through the hosting boundary.
- [ ] Implement Railway status/log/inventory reads for prod-approval flow.
- [ ] Implement Railway teardown path.

Exit criteria:

- [ ] Railway path can provision a noter-managed vault to a working URL.
- [ ] Retry and teardown semantics remain idempotent.

### Phase 5: Provider selection + pilot rollout

- [ ] Add hosting-provider selection in vault creation flow.
- [ ] Keep Netlify as default initially.
- [ ] Guard Railway path behind feature flag until pilot-ready.

Exit criteria:

- [ ] Create flow supports explicit provider choice.
- [ ] Pilot can run side-by-side Netlify vs Railway safely.

### Phase 6: Pilot evaluation and next decision

- [ ] Compare reliability, speed, operational friction, and cost.
- [ ] Decide one of:
  - keep dual-provider support
  - switch default to Railway
  - rollback Railway path

Exit criteria:

- [ ] Decision documented with measurable pilot outcomes.

## Validation Checklist

- [ ] Netlify create/provision/retry/delete still works.
- [ ] Railway create/provision/retry/delete works for pilot users.
- [ ] Prod-read approval flow supports both providers without unsafe bypass.
- [ ] No broad provider result optionals.
- [ ] No `any`.
- [ ] No class state introduced for provider logic.

## Open Questions (to resolve during implementation)

- [ ] Exact Railway OAuth scopes needed for minimum viable provisioning and
      reads.
- [ ] Final normalized field set for shared UI status rendering across
      providers.
- [ ] Whether teardown should be per-provider toggle in delete dialog from day
      one or follow-up.

## Acceptance Criteria

- [ ] A provider boundary exists and Netlify runs through it with unchanged
      behavior.
- [ ] Railway is implemented as a second provider through the same boundary.
- [ ] Vault creation supports provider selection for noter-managed vaults.
- [ ] Netlify remains available while Railway pilot runs.
- [ ] Pilot outcome can be used to make a provider-default decision.
