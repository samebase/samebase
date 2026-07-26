# Convex Backend Overview

This directory contains Samebase's backend: schema, auth, repository workflows, collaboration, MCP,
billing, and infrastructure provisioning.

## Start Here

1. `schema.ts` - full data model and indexes
2. `vault/dashboard.ts` - vault dashboard queries and infrastructure summary
3. `vault/actions.ts` - repository connect/create/delete + infra retry actions
4. `infraProvisioning.ts` - async Convex/Cloudflare provisioning flow
5. `mcp/` - remote MCP protocol, OAuth, grants, and tokens
6. `toolRuntime/` - shared action catalog, validation, authorization, and execution

## Vault Module Map

- `vault/actions.ts` - public actions for GitHub repository ownership, connect/create, provisioning
  retry, and deletion retry.
- `vault/dashboard.ts` - public dashboard queries for vault cards, pull request display preferences,
  and infrastructure summaries.
- `vault/records.ts` - vault row creation, lookup, readiness, and GitHub connection mutations.
- `vault/branches.ts` - exact branch-tree cache and tree refresh claims.
- `vault/model.ts` + `vault/state.ts` - validators and runtime guards.
- `vault/deletion/` - deletion eligibility, runs, events, local cleanup, workflow orchestration, and
  provider actions.

## Key Workflows

### Vault Creation Paths

- `createRepository` (`vault/actions.ts`): creates an app provisioning run and starts the full
  create-app Workflow.
- `connectRepository` (`vault/actions.ts`): connects an existing GitHub repo and creates vault
  without infra auto-provisioning.

### Infrastructure Provisioning

- Entrypoint: `internal.appProvisioningWorkflow.startVaultInfrastructureProvisioning`
- State tracking: `workflow_vaultProvisioning_plans`, `workflow_vaultProvisioning_writeLocks`,
  `vaultConvexProjects`, and `vaultCloudflareWorkers`
- Retry path: `api.vault.actions.retryInfrastructureProvisioning`

## Useful Local Commands

From the repo root in a worktree, use the Samebase workflow instead of raw Convex dev commands:

```bash
pnpm dev --once
pnpm dev
pnpm check
```

For production Convex reads, follow the root `AGENTS.md` production-read safety rule: run from the
primary checkout, derive `CONVEX_DEPLOYMENT` from that checkout, and clear `CONVEX_DEPLOY_KEY` in
the same command environment before using `npx convex ... --prod`.
