# 120 Organization Ownership Rollout

## Document Control

- Status: Active
- Owner: Samebase backend
- Last updated: 2026-08-03
- Source of truth: `specs/120_ORGANIZATION_OWNERSHIP_SPEC.md`
- Current branch: `codex-organization-ownership-spec`
- Current phase: Phase 0, documentation ready
- Current pull request: Not created

## Purpose

This file is the restart point for the organization rollout. It records accepted decisions, phase
status, evidence, and the next exact task. It does not record raw agent output or a per-commit
journal.

## Review Size Controls

- Phase 0 contains documents only. It contains no product code.
- Each implementation pull request owns one domain and one testable invariant.
- A slice stops for another split before it exceeds 25 production files or 3,000 hand-authored
  changed lines.
- Generated bindings and lockfile changes do not count toward the line limit, but they remain part
  of review.
- No implementation phase starts until the preceding phase is merged and rebased into the next
  worktree.
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
- Bind each user-specific MCP grant to one organization.
- Keep authentication, provider credentials, OAuth callback state, and personal UI state
  user-scoped.
- Keep WorkOS and Clerk out of the runtime and schema.
- Preserve production data by default and use small idempotent backfills.

## Rejected Or Deferred

- Approval-based organization provisioning: rejected because approval is temporary.
- A four-PR implementation: rejected because proposed slices reached 25 to 40 production files.
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

| Phase | Scope                                                                                        | Acceptance gate                                                                                                   | Status   |
| ----- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------- |
| 0     | Accepted spec and this rollout record                                                        | Independent architecture and simplicity reviews agree that the contract is complete and narrow                    | Complete |
| 1     | Empty organization rows, memberships, all-user backfill, collision audit, and access helpers | Every user has one membership; two operator accounts share one organization; deletion removes empty organizations | Pending  |
| 2     | Organization billing, billable attachment keys, quotas, and billing deletion cleanup         | Limits aggregate by organization; shared billing survives one member's deletion                                   | Pending  |
| 3     | MCP grants and delegated tokens                                                              | Only grants store the organization; every tool call rechecks membership                                           | Pending  |
| 4     | Vault roots and ordinary vault paths, prepared without access cutover                        | Every vault has an organization; normal writes keep legacy and new fields consistent                              | Pending  |
| 5     | Shared vault children, staged state, and provider observations                               | Child access can derive from the vault; actor fields do not grant access                                          | Pending  |
| 6     | Provisioning and provider-write workflows                                                    | Every workflow can derive the organization and records users only as actors                                       | Pending  |
| 7     | Vault deletion workflows                                                                     | Deletion authorization can derive the organization and legacy cleanup remains safe                                | Pending  |
| 8     | Membership access cutover and shared account deletion                                        | Shared organizations survive member deletion; normal resources use membership                                     | Pending  |
| 9     | Cleanup migrations and final schema narrowing                                                | No legacy tenant ownership value, fallback, dual write, or index remains                                          | Pending  |

Phases 1 through 7 prepare and verify the new data while legacy resource authorization remains
active. During preparation, shared helpers still require the legacy resource user as well as valid
organization data. Phase 8 removes that legacy-user requirement after every domain uses the shared
helpers. Phase 9 removes compatibility state after the cleanup migrations complete.

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

Open the ready Phase 0 documentation pull request. Do not start Phase 1 code in this branch. After
this pull request merges, create a new worktree from current `origin/main` and implement only
Phase 1.
