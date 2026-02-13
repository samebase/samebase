# Vault Infrastructure Auto-Provisioning Specification

## Document Control

- Status: Implemented for MVP
- Owner: Noter backend/frontend
- Last updated: 2026-02-13
- Related plan: `specs/002_VAULT_INFRA_AUTO_PROVISIONING_AND_AI_PROD_ACCESS_PLAN.md`

## Summary

For noter-managed vaults, infrastructure is provisioned automatically after vault creation:

1. Convex project/deployment resources
2. Netlify site + environment setup
3. Main-domain tracking in Convex tables

Provisioning is asynchronous and resumable. Vault creation succeeds even if downstream provisioning partially fails.

## Important Behavior

- `vaultActions.createRepository` (new noter-managed repo) schedules `internal.infraProvisioning.provisionVaultInfrastructure` automatically.
- `vaultActions.connectRepository` (existing GitHub repo connection) does **not** auto-provision infra.
- `vaultActions.retryInfrastructureProvisioning` allows manual retries for noter-managed vaults.

## Source of Truth Files

- `apps/noter/convex/vaultActions.ts`
- `apps/noter/convex/infraProvisioning.ts`
- `apps/noter/convex/infraProviders.ts`
- `apps/noter/convex/vault.ts`
- `apps/noter/convex/schema.ts`
- `apps/noter/src/components/VaultDashboard.tsx`

## Data Model

### `vaults` additions

- `infraState: "not_started" | "provisioning" | "ready" | "failed" | "partial"`
- `infraLastError?: string`
- `infraLastProvisionedAt?: number`
- `infraProvisioningStartedAt?: number`

### `vaultInfrastructure`

- `vaultId`
- `status`, `lastError`, `provisioningVersion`, `lastProvisionedAt`
- Convex fields: `convexProjectId`, `convexProjectSlug`, `convexDeploymentName`, `convexDeploymentType`, `convexCloudUrl`, `convexSiteUrl`, `convexDeployKeyId`
- Netlify fields: `netlifySiteId`, `netlifySiteName`, `netlifyTeamId`, `netlifyDefaultUrl`, `netlifyProductionUrl`, `netlifyBuildHookId`

Indexes:
- `by_vault`
- `by_status`

### `vaultDomains`

- `vaultId`, `branch`, `kind`, `url`, `source`, `active`, `lastSyncedAt`

Indexes:
- `by_vault`
- `by_vault_and_branch`

## Runtime Configuration

Required env vars:

- `CONVEX_MANAGEMENT_TOKEN`
- `CONVEX_TEAM_ID`
- `NETLIFY_ACCESS_TOKEN`
- `NETLIFY_TEAM_ID`

Optional:

- `INFRA_DEFAULT_BRANCH` (defaults to `main`)

## API/Function Contracts

### Public

1. `vaultActions.createRepository`
- Returns: `{ vaultId: string }`
- Side effect: schedules async infra provisioning

2. `vaultActions.retryInfrastructureProvisioning`
- Args: `{ vaultId: Id<"vaults"> }`
- Returns: `null`
- Behavior: validates ownership + noter-managed, schedules forced provisioning retry

3. `vault.getVaultInfrastructure`
- Args: `{ vaultId: Id<"vaults"> }`
- Returns: vault infra state + infrastructure snapshot + domain mappings (or `null` if not accessible)

### Internal

- `infraProvisioning.provisionVaultInfrastructure({ vaultId, force? })`
- `infraProvisioning.claimProvisioning({ vaultId, force? })`
- `infraProvisioning.setProvisioningState(...)`
- `infraProvisioning.upsertInfrastructureRecord(...)`
- `infraProvisioning.upsertDomainRecord(...)`

## Provisioning Flow

```mermaid
sequenceDiagram
  participant VA as "vaultActions.createRepository"
  participant SCH as "Convex Scheduler"
  participant IP as "infraProvisioning.provisionVaultInfrastructure"
  participant CVX as "Convex Mgmt API"
  participant NFL as "Netlify API"
  participant DB as "Convex DB"

  VA->>DB: addVault(isNoterManaged=true, infraState=not_started)
  VA->>SCH: schedule provisionVaultInfrastructure(vaultId)
  SCH->>IP: start
  IP->>DB: claim + set infraState=provisioning
  IP->>CVX: ensure project/deployment/deploy key
  IP->>NFL: ensure site/env/build hook/deploy
  IP->>DB: upsert vaultInfrastructure + vaultDomains
  IP->>DB: set infraState=ready
```

## State Machine

- `not_started` -> initial vault state
- `provisioning` -> active run (with stale-lock handling)
- `ready` -> full success
- `partial` -> at least one provider succeeded but run failed before completion
- `failed` -> run failed before any provider success

## UI Surface

In `VaultDashboard`:

- Infra status label per vault
- Production URL when available
- `Provision infra` (not started)
- `Retry infra` (failed/partial)

## MVP Notes

- Uses shared operator credentials from env vars.
- Provisioning is idempotent/resumable and does not auto-teardown resources on vault deletion unless explicitly requested.

## Deferred

- Per-user provider credentials
- Automatic teardown/orphan cleanup
- Branch custom domains and routing automation
- Budget/usage alerting

## Acceptance Checklist

- [x] New noter-managed vault creation schedules infra provisioning automatically.
- [x] Existing-repo connect flow does not auto-provision infra.
- [x] Retry path exists and is guarded to noter-managed vaults.
- [x] Infra status + URL are visible in dashboard query/UI surfaces.
