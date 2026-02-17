# Convex Backend Overview

This directory contains Noter's backend: schema, auth, repository workflows, collaboration logic, chat orchestration, and infrastructure provisioning.

## Start Here

1. `schema.ts` - full data model and indexes
2. `vaultActions.ts` - repository connect/create/delete + infra retry actions
3. `infraProvisioning.ts` - async Convex/Cloudflare provisioning flow
4. `chat.ts` + `chatActions.ts` - conversation lifecycle, response generation, approval flows
5. `codespaces.ts` + `vaultCodespaceIntegration.ts` - Codespaces lifecycle integration

## Key Workflows

### Vault Creation Paths

- `createRepository` (`vaultActions.ts`): creates a noter-managed GitHub repo, creates vault, and schedules infra provisioning.
- `connectRepository` (`vaultActions.ts`): connects an existing GitHub repo and creates vault without infra auto-provisioning.

### Infrastructure Provisioning

- Entrypoint: `internal.infraProvisioning.provisionVaultInfrastructure`
- State tracking: `vaults.infraState` and `vaultInfrastructure` table
- Domain tracking: `vaultDomains` table
- Retry path: `vaultActions.retryInfrastructureProvisioning`

### Chat Approval Flows

- Commit proposals in chat
- Production read proposals (Convex/Cloudflare/logs/data)
- Explicit approve/reject with audit trails (`aiProdAccessRequests`, `aiProdAccessAudit`)

## Useful Local Commands

From `apps/noter`:

```bash
npm run dev
npm run lint
npx convex logs
npx convex logs --prod --history 50
npx convex env list
```
