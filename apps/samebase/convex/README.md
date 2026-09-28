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
  viewer access, user preference and GitHub user authorization tables, and new-user notification
  content.
- `organization/` owns organization, membership, invitation, provider credential, billing account,
  and GitHub App setup models, member capacity and billing limit checks, and GitHub membership
  response parsing.

## Provider And Shared Modules

These folders hold plain modules. They register no functions, so moving them does not change a
function path.

- `githubApi/` - GitHub App configuration and Octokit clients, repository REST reads, and blob
  content helpers.
- `cloudflare/` - Cloudflare Workers, builds, and token resource calls, and the Cloudflare MCP
  client and token health.
- `cloudflareApi/` and `convexManagementApi/` - generated OpenAPI clients and validators.
- `polar/` - the Polar client and product catalog.
- `providers/` - provider auth validators, auth fingerprints, and OAuth completion responses.
- `logging/` - provider API call logs, provider response validation logs, and usage attribution.
- `staging/` - staged-file rebase.
- `lib/` - generic helpers for JSON reads, bounded concurrency, slugs, and OAuth tokens and env.

Registered functions remain in their existing root modules and import these owners directly. A root
module path is part of every function path it registers, so moving one needs its own migration
decision. See the
[domain ownership rollout record](../../../archive/124_MONOREPO_DOMAIN_OWNERSHIP_ROLLOUT.md#intentional-deferrals).

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

- `createRepository` (`repository/actions.ts`): creates a repository provisioning run and starts the
  complete create-app Workflow.
- `connectRepository` (`repository/actions.ts`): connects an existing GitHub repository and creates
  a Samebase repository without automatic infrastructure provisioning.

### Infrastructure Provisioning

- Retry admission: `internal.repositoryProvisioningRuns.createRetryForRepository`
- State tracking: `workflow_repositoryProvisioning_plans`,
  `workflow_repositoryProvisioning_writeLocks`, `repositoryConvexProjects`, and
  `repositoryCloudflareWorkers`
- Retry path: `api.repository.actions.retryInfrastructureProvisioning`

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
