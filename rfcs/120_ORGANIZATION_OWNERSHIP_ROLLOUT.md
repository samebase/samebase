# 120 Organization Ownership Rollout

## Document Control

- Status: Active
- Owner: Samebase backend
- Last updated: 2026-08-04
- Source of truth: `specs/120_ORGANIZATION_OWNERSHIP_SPEC.md`
- Current branch: `codex-organization-ownership-spec`
- Current state: Final review fixes in progress; operator cutover pending
- Current pull request: [#1355](https://github.com/samebase/samebase/pull/1355)

## Purpose

This file is the compact progress and restart record for the organization rollout. It records
accepted decisions, phase status, evidence, and the next exact task. It does not record raw agent
output or a per-commit journal.

## Review Controls

- The accepted specification contains no product code.
- The rollout has one implementation pull request and one final-schema deployment.
- Pull request size is not a split trigger. Use coherent commits and focused agent reviews inside
  each pull request.
- The implementation is not complete until every affected shipped UI, query contract, and workflow
  is updated and tested in the same pull request.
- The implementation is authorized in pull request #1355.
- The implementation gets one implementation review and one independent simplicity review before
  merge.
- New enterprise features do not enter this rollout without a spec change.

## Accepted Decisions

- Use local `users`, `organizations`, and `organizationMemberships` as the tenant graph.
- Bootstrap an organization for every retained user, including waitlisted users.
- Put the two known operator accounts in one organization through explicit bootstrap input.
- Use membership presence as access. Do not add a role until two roles have different behavior.
- Keep organization context out of `users` and derive it from the resource or verified request
  context.
- Make vaults, billing, and resource quota ownership organization-scoped.
- Treat staged files as one shared collaborative vault draft. Remove `vaultStagedFiles.ownerId` as
  an access gate in the final model.
- Use `requestedByUserId` on provisioning and vault-deletion runs, derive event requesters through
  `runId`, and use `editUserId` on staged-file updates. Actor fields are provenance only.
- Bind each user-specific MCP grant to one organization.
- Authorize each MCP HTTP request with one complete token, grant, client, and membership snapshot
  before internal tool dispatch. Internal runtime actions are not an independent public boundary and
  do not reload the grant.
- Apply a concurrent MCP grant revocation, membership change, or client disable to the next request.
  Continue to reload and recheck the grant, membership, scope, and client during browser handoff
  creation and redemption because they are separate requests.
- Keep authentication, provider credentials, OAuth callback state, and personal UI state
  user-scoped.
- Keep WorkOS and Clerk out of the runtime and schema.
- Preserve users, authentication data, provider connections, external provider resources, and the
  recorded Polar billing state.
- Use an operator-run manual reset for local vault, staging, workflow, and MCP authorization data so
  the final schema can deploy without compatibility code.

## Rejected Or Deferred

- Approval-based organization provisioning: rejected because approval is temporary.
- Nine domain-sized implementation pull requests and fixed file or line caps: rejected because they
  add process without adding a required deployment boundary.
- A data-preserving multi-deploy migration: rejected because the operator approved a pre-beta manual
  reset and values one final ownership model over local development data retention.
- A general Convex migration component: rejected for now because every measured source table has
  fewer than 500 rows.
- `users.organizationId`: rejected because a user row is not the durable resource boundary.
- `users.activeOrganizationId`: rejected because future organization selection belongs to verified
  request or session context.
- Organization name, status, slug, kind, lifecycle, creator, and provider ID fields: deferred
  without a current behavior.
- Membership roles, status, timestamps, and permission arrays: deferred without a current behavior.
- Auth identity and organization provider-link tables: deferred now, but required before any
  external authentication or organization provider migration starts.
- Organization-owned provider credentials: deferred until the product needs shared service
  credentials. Current provider connections remain user-owned.
- Invitation, organization-switching, SSO, SCIM, FGA, and team-management UI: outside this rollout.

## Current Production Shape

Read on 2026-08-03 without printing document contents:

| Table                             | Rows |
| --------------------------------- | ---: |
| `users`                           |    6 |
| `vaults`                          |   10 |
| `providerConnections`             |    8 |
| `vaultCloudflareWorkers`          |   11 |
| `vaultConvexProjects`             |    8 |
| `vaultStagedFiles`                |    5 |
| `workflow_vaultProvisioning_runs` |   10 |
| `workflow_vaultDeletion_runs`     |   13 |
| `mcpGrants`                       |   26 |
| `mcpAccessTokens`                 |  437 |
| `mcpRefreshTokens`                |  437 |

Empty callback-state and provisioning-plan tables are omitted. Counts must be measured again before
the manual reset.

## Rollout Status

### Specification

- Status: Complete
- Scope: Accept the target schema and rollout.
- Gate: Independent architecture and simplicity reviews pass.

### Final organization cutover

- Status: Final review fixes in progress; operator cutover pending
- Scope: Add the final organization graph, organization billing, membership access, MCP binding,
  retained-user bootstrap, organization-aware API results, and affected UI and workflow support.
- Gate: The operator completes the manual reset, every retained user has one membership, the two
  operator accounts share one organization, and all organization access uses membership.

The cutover is intentionally one complete authorization pull request, not several domain pull
requests. Its commits can separate the runtime cutover, final schema, bootstrap and runbook, and
tests for review.

## Implementation Progress

Implemented in the current pull request and worktree:

- the organization, membership, and organization billing tables, including automatic provisioning
  for every new account without coupling ownership to temporary approval;
- organization-only billing reads and writes and organization Worker and Convex project quotas;
- required organization keys for vaults, billable attachments, and MCP grants;
- final provenance fields for provisioning runs, deletion runs, and staged-file updates, without
  legacy actor copies;
- shared organization membership checks that reject missing organization data and give every member
  access to the organization's resources;
- exact MCP organization propagation from access-token validation through tool dispatch, including
  organization-bound vault creation, inventory, and existing-vault checks;
- sole-member and shared-member account-deletion behavior for memberships, billing, active work, and
  organization cleanup;
- one organization account-deletion lock that prevents two members from starting deletion together,
  remains through staff retry, and leaves manual staff retry as the recovery path;
- user-owned provider and repository-refresh lock attribution, plus bounded personal UI cleanup that
  preserves other members' rows;
- shared staged-file initialization and commit cleanup that preserve a teammate's newer edit;
- explicit MCP query arguments at the deploy-key rotation boundary, with organization context kept
  at the trusted request boundary;
- vault lifecycle preservation during member deletion, with bounded per-vault cleanup that deletes
  events before terminal runs at the vault deletion boundary;
- one small bootstrap for the retained users after the operator-run reset, which rejects unresolved
  checkout attempts; and
- a manual cutover runbook that records the exact destructive scope and verification order.

The branch was rebased onto current `origin/main` with operator approval. The supply-chain
dependency patch is present. The approved manual reset replaces the earlier migration code. Current
validation evidence is recorded below.

The operator approved a manual pre-beta reset on 2026-08-04. The mixed runtime and general migration
are removed. The one-time retained-user bootstrap replaces them. Independent authorization,
simplicity, and cutover reviews found and verified the final MCP organization boundary,
credential-dependent account-deletion waits, personal UI cleanup, unused-index removal, and safe
manual reset order. A follow-up review found one strict MCP argument mismatch and two realistic
two-member races. The focused fixes use an explicit argument object, one organization deletion lock,
and the existing exact staging-snapshot cleanup. The work is pending the operator-run reset, merge,
deployment, bootstrap, and production verification.

### Final review-fix checkpoint

Accepted before merge:

- reconcile a shared staged row onto the new Git baseline after a commit while preserving newer
  edits and delayed client writes;
- prevent deletion of a storage blob attached anywhere and derive deletion baseline data from the
  authorized vault instead of a client-supplied Git blob SHA;
- revoke an MCP grant after rotated refresh-token replay even when current membership is absent;
- require dashboard access for the organization billing portal;
- reject shared-member account deletion during an organization checkout and reject account deletion
  during the applicable current repository refresh;
- reject incoherent retained-user billing input before the one-time bootstrap writes anything; and
- restore focused organization-boundary denial tests and the missing staged-path collision check.

Explicitly not part of this fix:

- an account-deletion abort or force-success path;
- an account-wide vault-deletion run sweep;
- automatic recovery for an uncertain Polar checkout;
- duplicate membership reads inside consumers of the validated MCP request snapshot; and
- compatibility code for the data removed by the approved manual reset.

The shared staged-file fix is the only non-trivial design change in this checkpoint. All other
accepted items are focused boundary checks or input validation. Prior validation evidence below
applies to the pre-fix head and must be replaced after the final fixes are integrated.

## Validation Evidence

- Pull request CI passed for follow-up code head `c14d1ac39`: the supply-chain check, the complete
  checks and unit-test job, the final CI job, and both Cloudflare preview builds.
- `pnpm check`: passed after the follow-up review fixes, with existing repository warnings only.
- `pnpm test`: 292 files passed, with 2,282 tests passed and 1 skipped.
- `pnpm test:convex`: 47 files passed, with 431 tests passed.
- Focused organization authorization review: 9 files passed, with 109 tests passed.
- `pnpm --filter samebase typecheck`: passed.
- `pnpm format:check` and `git diff --check`: passed.
- Two full `pnpm test:visual:linux` runs each passed 209 tests, skipped 1 test, and failed the same
  unchanged public landing URL-editor test. The focused canonical test passed on clean `main` and on
  this branch. This known unrelated failure remains visible and is not patched in this rollout.

## UI And Workflow Coverage

This is a full-stack rollout. The implementation owns the code changes and the two-member acceptance
pass for every existing surface whose data or behavior changes.

The implementation covers:

- normal sign-up and admin-created account provisioning for the organization, membership, and
  billing row;
- the account billing plan, subscription, and Worker and Convex project usage;
- account deletion confirmation and progress for membership and shared billing cleanup, including
  the sole-member and shared-member active-work wait rules;
- MCP consent and grant binding to the current user's one organization;
- one MCP HTTP request-boundary authorization snapshot for token validation, tool listing, tool
  calls, and internal tool dispatch, with concurrent authorization changes applied to the next
  request;
- browser handoff grant, membership, scope, and client rechecks at both creation and redemption;
- repository connection and app creation contracts that create organization-owned vaults;
- vault lists, pickers, navigation, dashboards, resource dialogs, and resource routes;
- editor, collaborative, shared staged-draft, pull-request, Data, and Schema behavior, including the
  final actor-field names;
- provider observation, provider-write, provisioning, vault deletion, and account deletion flows;
- the rule that each member uses their own provider credentials while shared resources stay with the
  organization;
- final organization-aware query and action results used by current routes;
- route-level interaction tests and screenshot coverage for every changed shipped UI state.

The implementation verifies those surfaces with both members of the shared operator organization. It
also verifies sole-member and shared-member account deletion, MCP token validation, `tools/list`,
`tools/call`, tool execution, and browser handoff before the production reset.

Personal UI settings and provider connections remain separate for two members. The rollout adds no
organization name, switcher, invitation flow, membership page, or new organization chrome.

## Evidence Integrated

- WorkOS and Clerk both use separate user, organization, and membership records.
- WorkOS recommends an organization for an organization-scoped user who has none.
- Clerk keeps active organization state in session or browser context, not as permanent user
  ownership.
- Current Samebase ownership reaches at least 51 production files and 36 tests.
- Current production row counts make the operator-run manual reset practical.
- Existing Samebase access keys remain useful as the coarse gate above organization membership.

Primary external sources:

- https://workos.com/docs/authkit/modeling-your-app
- https://workos.com/docs/authkit/users-organizations
- https://workos.com/docs/rbac/configuration
- https://clerk.com/docs/guides/organizations/overview
- https://clerk.com/docs/guides/organizations/control-access/roles-and-permissions
- https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html

## Next Exact Task

1. Integrate and review the accepted final fixes as focused commits.
2. Replace the pre-fix validation evidence with focused, full, and affected UI validation from the
   final head.
3. Get fresh independent reviews and green pull request checks.
4. Record the Polar billing state and confirm that no destructive workflow is active.
5. Pause product writes and follow the accepted manual reset runbook while the old schema is live.
6. Merge and deploy the final schema and organization-authoritative runtime.
7. Run the retained-user bootstrap with the two explicit operator user IDs and recorded billing
   state.
8. Verify the bootstrap counts and the required two-member flows, reconnect MCP and the retained
   vaults, then resume product writes.
