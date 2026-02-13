# Spec Update Plan: Vault Infra Auto-Provisioning + Safe AI Prod Access

## Summary
Update the specs to cover two coupled MVP tracks:
1. Auto-provision infrastructure (Convex + Netlify) for new noter-managed vaults.
2. Allow the main AI to inspect production infra/logs/data with explicit per-request approval and auditability.

This keeps your "move fast" single-user workflow, while preventing a dangerous rewrite when real users arrive.

## Spec Files to Add/Update
1. Add `/Users/nicu/dev/my/noter/specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`.
2. Add `/Users/nicu/dev/my/noter/specs/004_AI_PROD_ACCESS_POLICY_SPEC.md`.
3. Add a short cross-link section to `/Users/nicu/dev/my/noter/specs/001_CODESPACE_CONNECTION_SPEC.md` pointing to the new infra specs.

## Required API/Schema Changes (to include in specs)

### Convex data model additions
1. Extend `vaults`:
- `infraState`: `"not_started" | "provisioning" | "ready" | "failed" | "partial"`
- `infraLastError`: optional string
- `infraLastProvisionedAt`: optional number

2. Add table `vaultInfrastructure`:
- `vaultId`
- Convex fields: project/deployment identifiers and URLs
- Netlify fields: site identifiers and URLs
- `status`, `lastError`, `provisioningVersion`

3. Add table `vaultDomains`:
- `vaultId`, `branch`, `kind`, `url`, `source`, `active`

4. Add table `aiProdAccessRequests`:
- requester, vault/global scope, provider, resource kind, params, status, approvedBy, approvedAt, executedAt, redactionLevel, error

5. Add table `aiProdAccessAudit`:
- requestId, actor, action, endpoint/tool, argument hash, row/log counts, timestamp

### Convex function contracts
1. `infraProvisioning.provisionVaultInfrastructure({ vaultId })` internal action.
2. `vaultActions.retryInfrastructureProvisioning({ vaultId })` public action.
3. `vault.getVaultInfrastructure({ vaultId })` public query.
4. `chat.proposeProdRead(...)` internal/public plumbing for approval-first prod reads.
5. `chat.confirmProdRead({ requestId, conversationId })` mutation to execute approved read.
6. Read executors:
- `infraRead.getConvexDeploymentStatus`
- `infraRead.getConvexLogs`
- `infraRead.getNetlifySiteStatus`
- `infraRead.getNetlifyLogs`
- `infraRead.getConvexDataQuery` (MVP allowed, approval required)

### Agent tool surface
1. Add proposal-style tools to `TOOL_CATALOG`:
- `request_convex_status_read`
- `request_convex_logs_read`
- `request_netlify_status_read`
- `request_netlify_logs_read`
- `request_convex_data_read`
2. Do not allow direct prod reads from tool calls.
3. Keep direct execution only after explicit approval mutation.

## Approval and Safety Flow (decision complete)
1. AI requests prod read via proposal tool.
2. Assistant message is stored with `metadata.type="prod_read_proposal"`.
3. UI shows approval card similar to commit proposal.
4. User clicks approve.
5. Backend executes read with admin checks.
6. Output is redacted by policy, saved, and shown in chat.
7. Full audit row is written for proposal, approval, execution, and result.

## Redaction Policy for MVP
1. Always mask secrets and credentials:
- tokens, cookies, API keys, auth headers, env var values
2. Default-mask obvious PII:
- email, phone, access tokens in logs
3. Keep two modes in policy spec:
- `MVP_OWNER_MODE` (you only): allow raw payload fallback after approval
- `MULTI_USER_MODE`: enforced redaction, no raw payload fallback

## Infra Provisioning Workflow
1. `createRepository` succeeds first.
2. Schedule async infra provisioning.
3. Create Convex project/deployment with owner credentials.
4. Create Netlify site linked to repo main branch.
5. Inject required env vars and trigger initial deploy.
6. Persist IDs/URLs and set main branch domain row.
7. Mark vault infra ready.
8. On failure, persist partial state and allow idempotent retry.

## What Is Missing for a Good MVP (must add now)
1. Approval UX for prod reads in chat (not just backend check).
2. Request/audit persistence for prod access.
3. Idempotent retry logic for infra provisioning.
4. Operator-facing infra status in vault dashboard.
5. Provider adapter boundary for Convex/Netlify reads and provisioning so internals can switch to generated OpenAPI SDKs later without changing tool contracts.

## What Can Be Deferred (post-MVP)
1. Per-user linked Convex/Netlify accounts.
2. Branch custom domains and automatic branch routing.
3. Automated teardown/orphan cleanup on vault delete.
4. Fine-grained role model beyond admin-only.
5. Cost-budget automation and spend alerts.

## Testing Scenarios to Specify
1. Provisioning happy path creates Convex + Netlify metadata.
2. Partial failure path sets `partial` and resumes on retry.
3. Duplicate scheduler invocations stay idempotent.
4. Prod read without approval is blocked.
5. Approved prod read executes and writes audit rows.
6. Redaction masks secrets before response storage.
7. Non-admin cannot approve or execute prod reads.

## Assumptions and Defaults
1. Single-owner credentials from environment for MVP.
2. Main-branch-first deployment behavior.
3. Admin user is currently you (`isAdminUser` gate).
4. Explicit approval required for every prod logs/data read.
5. MVP allows broader access under `MVP_OWNER_MODE`, with planned switch to strict mode before external users.
6. For MVP speed, Convex dev/prod deployments share the same `CONVEX_MANAGEMENT_TOKEN` + `CONVEX_TEAM_ID`.
7. For MVP speed, Convex dev/prod deployments share the same `NETLIFY_ACCESS_TOKEN`.

## Provider Boundary and Migration
1. Keep `fetch`-based providers in backend adapter modules for MVP.
2. Keep AI tool contracts provider-agnostic and routed through internal actions.
3. Later migration path:
- swap Netlify adapter internals to `@netlify/api` (OpenAPI-generated client),
- keep Convex adapter internals aligned with Convex Management API,
- avoid changes to chat/tool schemas and approval flow.

## Acceptance Criteria for "Spec Updated"
1. Both new spec files exist with concrete schemas, APIs, flow diagrams, and test matrix.
2. Existing codespace spec cross-links to new infra docs.
3. Each spec includes a migration/rollout section and a "flip to multi-user safe mode" checklist.
