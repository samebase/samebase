# 120 Organization Ownership Rollout

## Document Control

- Status: Active
- Owner: Samebase backend
- Last updated: 2026-08-03
- Source of truth: `specs/120_ORGANIZATION_OWNERSHIP_SPEC.md`
- Current branch: `codex-organization-ownership-spec`
- Current phase: Phase 1, implementation in progress
- Current pull request: [#1355](https://github.com/samebase/samebase/pull/1355)

## Purpose

This file is the compact progress and restart record for the organization rollout. It records
accepted decisions, phase status, evidence, and the next exact task. It does not record raw agent
output or a per-commit journal.

## Review Controls

- Phase 0 contains documents only. It contains no product code.
- The rollout has three implementation pull requests. Add another only if Convex requires another
  deployed schema state.
- Pull request size is not a split trigger. Use coherent commits and focused agent reviews inside
  each pull request.
- A backend phase is not complete until every affected shipped UI, query contract, and workflow is
  updated and tested in the same pull request.
- Phase 1 is authorized in pull request #1355 after Phase 0 completion. Phase 2 and Phase 3 start
  only after the preceding implementation phase is merged and rebased into the next worktree.
- Each phase gets one implementation review and one independent simplicity review before merge.
- New enterprise features do not enter this rollout without a spec change.

## Accepted Decisions

- Use local `users`, `organizations`, and `organizationMemberships` as the tenant graph.
- Backfill an organization for every user, including waitlisted users.
- Put the two known operator accounts in one organization through explicit migration input.
- Use membership presence as access. Do not add a role until two roles have different behavior.
- Keep organization context out of `users` and derive it from the resource or verified request
  context.
- Make vaults, billing, and resource quota ownership organization-scoped.
- Treat staged files as one shared collaborative vault draft. Remove `vaultStagedFiles.ownerId` as
  an access gate in the final model.
- Use `requestedByUserId` on provisioning and vault-deletion runs, derive event requesters through
  `runId`, and use `editUserId` on staged-file updates. Actor fields are provenance only.
- Bind each user-specific MCP grant to one organization.
- Keep authentication, provider credentials, OAuth callback state, and personal UI state
  user-scoped.
- Keep WorkOS and Clerk out of the runtime and schema.
- Preserve production data by default and use small idempotent backfills.

## Rejected Or Deferred

- Approval-based organization provisioning: rejected because approval is temporary.
- Nine domain-sized implementation pull requests and fixed file or line caps: rejected because they
  add process without adding a required deployment boundary.
- One data-preserving implementation pull request: not selected because Convex must deploy the
  widened schema before backfill and must deploy the cleaned data before final schema narrowing.
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
the related migration runs.

## Rollout Phases

### Phase 0: Specification

- Status: Complete
- Scope: Accept the target schema and rollout.
- Gate: Independent architecture and simplicity reviews pass.

### Phase 1: Prepare and backfill

- Status: In progress in pull request #1355
- Scope: Add the organization graph, organization billing, organization keys, MCP binding, shared
  helpers, dual writes, backfills, migration checks, organization-aware API results, and affected UI
  and workflow support across all domains.
- Gate: Every user and resource is prepared, the two operator accounts share one organization, and
  legacy resource access still applies.

### Phase 2: Switch and clean

- Status: Pending
- Scope: Make organization keys authoritative, switch all resource access and account deletion to
  memberships, stop legacy ownership writes, and remove legacy ownership values with bounded
  migrations. Activate and verify the UI and workflow support prepared in Phase 1.
- Gate: Shared access, billing, quotas, MCP, and account deletion use the organization boundary, and
  cleanup checks pass.

### Phase 3: Narrow

- Status: Pending
- Scope: Remove legacy ownership fields, indexes, fallbacks, dual-write code, and completed
  migration code.
- Gate: The final schema and current specs contain no legacy tenant ownership path.

Phase 1 is intentionally one large preparation pull request, not several domain pull requests. Its
commits can separate schema and backfills, billing and MCP, vault paths and workflows, and tests for
review. Phase 2 is one coordinated authorization cutover. Phase 3 is the small schema-narrowing pull
request required after production cleanup completes.

## Phase 1 Implementation Progress

Implemented in the current pull request and worktree:

- the organization, membership, and organization billing tables, including automatic provisioning
  for every new account without coupling ownership to temporary approval;
- organization billing reads and writes, organization Worker and Convex project quotas, and the
  temporary legacy-user fallback for users that the backfill has not prepared yet;
- optional organization keys and dual writes for vaults, billable attachments, and MCP grants;
- final provenance fields for provisioning runs, deletion runs, and staged-file updates;
- shared Phase 1 ownership checks that require the legacy user owner and use organization keys only
  as consistency checks, so this phase does not widen resource access;
- sole-member and shared-member account-deletion behavior for memberships, billing, active work, and
  organization cleanup;
- vault lifecycle preservation during member deletion, with bounded per-vault cleanup that deletes
  events before terminal runs at the vault deletion boundary;
- one bounded, atomic, idempotent preparation mutation and one counts-only verification query for
  the organization graph, billing authority, resources, actors, event references, and repository
  collisions; and
- explicit two-account migration input for the operator organization, canonical billing source, and
  retained vault selections. Duplicate vault cleanup stays a separate, explicit, non-provider
  operation.

Final local evidence is complete. The Convex run passed 47 files and 433 tests. The full Samebase
check passed. The focused account-deletion Linux visual run passed all 4 tests, and the unit copy
tests passed all 24 tests. Migration, access, integration, and lifecycle reviews passed after their
fixes. Two canonical full Linux visual runs were not green only because unrelated route URL editor
tests failed inconsistently. All account-deletion tests passed in both runs.

Phase 1 remains in progress. It is pending commit and push, pull request CI, merge, deployment, and
production backfill verification.

## UI And Workflow Coverage

This is a full-stack rollout. Phase 1 owns the code changes for every existing surface whose data or
behavior changes. Phase 2 activates shared access and runs the two-member acceptance pass. It is not
a second set of domain UI projects.

Phase 1 covers:

- normal sign-up and admin-created account provisioning for the organization, membership, and
  billing row;
- the account billing plan, subscription, and Worker and Convex project usage;
- account deletion confirmation and progress for membership and shared billing cleanup, including
  the sole-member and shared-member active-work wait rules;
- MCP consent and grant binding to the current user's one organization;
- repository connection and app creation contracts that create organization-owned vaults;
- vault lists, pickers, navigation, dashboards, resource dialogs, and resource routes;
- editor, collaborative, shared staged-draft, pull-request, Data, and Schema behavior, including the
  final actor-field names;
- provider observation, provider-write, provisioning, vault deletion, and account deletion flows;
- the rule that each member uses their own provider credentials while shared resources stay with the
  organization;
- migration-compatible query and action results used by current routes;
- route-level interaction tests and screenshot coverage for every changed shipped UI state.

Phase 2 verifies those prepared surfaces with both members of the shared operator organization. It
also verifies sole-member and shared-member account deletion, MCP token validation, `tools/list`,
`tools/call`, tool execution, and browser handoff before it removes the legacy access requirement.

Personal UI settings and provider connections remain separate for two members. No phase adds an
organization name, switcher, invitation flow, membership page, or new organization chrome. Phase 3
has no intended user-visible behavior change.

## Evidence Integrated

- WorkOS and Clerk both use separate user, organization, and membership records.
- WorkOS recommends an organization for an organization-scoped user who has none.
- Clerk keeps active organization state in session or browser context, not as permanent user
  ownership.
- Current Samebase ownership reaches at least 51 production files and 36 tests.
- Current production row counts support bounded one-time migrations without a new general component.
- Existing Samebase access keys remain useful as the coarse gate above organization membership.

Primary external sources:

- https://workos.com/docs/authkit/modeling-your-app
- https://workos.com/docs/authkit/users-organizations
- https://workos.com/docs/rbac/configuration
- https://clerk.com/docs/guides/organizations/overview
- https://clerk.com/docs/guides/organizations/control-access/roles-and-permissions
- https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html

## Next Exact Task

1. Commit and push the completed Phase 1 implementation, then require green pull request CI for pull
   request #1355.
2. Merge pull request #1355 only after its CI is green, then deploy the widened Phase 1 code and
   schema.
3. Run the bounded organization preparation mutation with the two explicit operator user IDs, the
   explicit canonical billing source user ID, and the explicit retained vault ID list.
4. If preparation reports a duplicate repository identity, perform explicit full cleanup of each
   reported losing vault's local Samebase data only. Do not delete its provider infrastructure.
5. Rerun the same preparation mutation with the same explicit input after any required cleanup. A
   clean first run must also permit an idempotent rerun.
6. Run the counts-only verification query until it reports `ready` with zero issue counts.
7. Do not start Phase 2 before Phase 1 is merged, the widened deployment is live, and the production
   backfill verification reports `ready`. Rebase the Phase 2 worktree onto current `origin/main`
   before implementation starts.
