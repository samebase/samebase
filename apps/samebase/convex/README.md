# Convex Backend Overview

This directory contains Samebase's backend: schema, auth, repository workflows, collaboration, MCP,
billing, and infrastructure provisioning.

## Start Here

1. `schema.ts` - full data model and indexes
2. `repository/dashboard.ts` - repository dashboard queries and infrastructure summary
3. `repository/actions.ts` - repository connect, create, removal, and infrastructure retry actions
4. `infraProvisioning.ts` - async Convex/Cloudflare provisioning flow
5. `mcp/` - remote MCP protocol, OAuth, grants, and tokens
6. `toolRuntime/` - shared action catalog, validation, authorization, and execution

## Identity And Organization Models

- `identity/` owns account tables, sign-in and account-linking helpers, user lifecycle validators,
  viewer access, and new-user notification content.
- `organization/` owns organization, membership, invitation, and provider credential models, member
  capacity checks, and GitHub membership response parsing.
- Registered functions remain in their existing modules. They import these owners directly.

## Repository Module Map

- `repository/actions.ts` - public actions for GitHub repository ownership, connect/create,
  provisioning retry, and deletion retry.
- `repository/dashboard.ts` - public dashboard queries for repository cards, pull request display
  preferences, and infrastructure summaries.
- `repository/records.ts` - repository row creation, lookup, readiness, and GitHub connection
  mutations.
- `repository/branches.ts` - exact branch-tree cache and tree refresh claims.
- `repository/model.ts` + `repository/state.ts` - validators and runtime guards.
- `repository/deletion/` - removal eligibility, runs, events, local cleanup, workflow orchestration,
  and provider actions.
- The root provisioning and shared workflow authority modules retain their registered function
  paths.
  [Spec 100 records the runtime boundary](../../../specs/100_CONVEX_REPOSITORY_MODULE_LAYOUT_SPEC.md#registered-function-path-exceptions).

## Key Workflows

### Repository Creation Paths

- `create` (`repository.ts`, Node half in `repository/actions.ts`): creates a repository
  provisioning run and starts the complete create-app Workflow.
- `connect` (`repository.ts`, Node half in `repository/actions.ts`): connects an existing GitHub
  repository and creates a Samebase repository without automatic infrastructure provisioning.

### Infrastructure Provisioning

- Retry admission, confirmation, and run insert (one transaction):
  `internal.repositoryProvisioningRuns.createRetryForRepository`
- State tracking: `workflow_repositoryProvisioning_plans`,
  `workflow_repositoryProvisioning_writeLocks`, `repositoryConvexProjects`, and
  `repositoryCloudflareWorkers`
- Retry path: `api.repository.retryProviderSetup`

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
