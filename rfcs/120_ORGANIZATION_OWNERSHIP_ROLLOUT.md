# 120 Organization Ownership Rollout

## Document Control

- Status: Active
- Owner: Samebase backend
- Last updated: 2026-08-04
- Source of truth: `specs/120_ORGANIZATION_OWNERSHIP_SPEC.md`
- Current branch: `codex-organization-ownership-spec`
- Current state: Organization provider ownership implemented; final validation and review in
  progress
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
- Keep authentication and personal UI state user-scoped.
- Make each provider connection organization-owned and require `connectedByUserId` for the member
  who connected or last reauthorized it. Use the organization for access and the user link for
  provenance and credential lifecycle.
- Permit several connections per provider kind in the schema, while the first UI continues to create
  and display one.
- Store one selected connection ID per provider kind on the organization. Use it for status and new
  resources. Existing resources continue to use their own exact connection ID.
- Bind each vault repository, Convex project, Cloudflare Worker, and provisioning plan to a stable
  provider connection ID. Provider operations use that ID instead of the acting user.
- Disconnect a provider by revoking OAuth when possible and stripping the local credential. Keep a
  disconnected row when resources still refer to its stable ID.
- Keep the current provider OAuth and API-key methods. Do not add a GitHub App flow.
- Keep WorkOS and Clerk out of the runtime and schema.
- Preserve users, authentication data, external provider resources, and the recorded Polar billing
  state. Disconnect and recreate local provider connections during cutover.
- Use an operator-run manual reset for local vault, staging, workflow, and MCP authorization data so
  the final schema can deploy without compatibility code. Require an empty `providerConnections`
  table and empty provider OAuth callback state before the final schema deploy.

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
- Organization name, status, slug, kind, lifecycle, and creator fields: deferred without a current
  behavior.
- Membership roles, status, timestamps, and permission arrays: deferred without a current behavior.
- Auth identity and organization provider-link tables: deferred now, but required before any
  external authentication or organization provider migration starts.
- Migrating existing provider connections: rejected because the operator approved disconnecting all
  current providers before cutover and reconnecting them under the final organization schema.
- Invitation, organization-switching, SSO, SCIM, FGA, and team-management UI: outside this rollout.
- Simultaneous FileView commits, structural edits during a commit, and external Git changes during a
  commit: deferred until FileView becomes a shipped add-on.

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

- Status: Organization provider ownership implemented; final validation and review in progress
- Scope: Add the final organization graph, organization billing, membership access, MCP binding,
  organization provider connections, retained-user bootstrap, organization-aware API results, and
  affected UI and workflow support.
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
- bounded personal UI cleanup that preserves other members' rows;
- shared staged-file ownership and a narrow post-commit baseline update that keeps the current
  editor row for a delayed one-session save;
- explicit MCP query arguments at the deploy-key rotation boundary, with organization context kept
  at the trusted request boundary;
- vault lifecycle preservation during member deletion, with bounded per-vault cleanup that deletes
  events before terminal runs at the vault deletion boundary;
- one small bootstrap for the retained users after the operator-run reset, which rejects unresolved
  checkout attempts;
- a manual cutover runbook that records the exact destructive scope and verification order;
- organization-owned provider connections with required connecting-member provenance, several rows
  per provider kind, and one selected default of each kind on the organization;
- exact provider connection IDs on repositories, Convex projects, Cloudflare Workers, and
  provisioning plans so later reads, writes, observations, and retries do not follow a changed
  default;
- provider-side OAuth revocation before local disconnect for GitHub and Cloudflare, fixed public
  provider failure messages, and account deletion across every connected provider row; and
- the GitHub `workflow` scope required by the shipped starter CI file, plus a normal parented commit
  after empty-repository bootstrap instead of a forced second root commit.

The branch was rebased onto current `origin/main` with operator approval. The supply-chain
dependency patch is present. The approved manual reset replaces the earlier migration code. Current
validation evidence is recorded below.

The operator approved a manual pre-beta reset on 2026-08-04. The mixed runtime and general migration
are removed. The one-time retained-user bootstrap replaces them. Independent authorization,
simplicity, and cutover reviews found and verified the final MCP organization boundary,
credential-dependent account-deletion waits, personal UI cleanup, unused-index removal, and safe
manual reset order. A follow-up review found one strict MCP argument mismatch, one account-deletion
race, and unsupported concurrent FileView commit cases. The focused fixes use an explicit argument
object and one organization deletion lock. FileView keeps the normal one-person edit and commit
path, then clears committed staging. Delayed-save reconciliation and commit retry recovery are
deferred. Organization provider ownership is implemented and has passed real provider creation,
reload, observation, and deletion tests.

Manual testing with two members and one waitlisted account found one development-only credential
problem: the normal auth callback copied the configured seed provider keys to every new local and
preview user. Provider reads were correctly user-scoped, but each test user had received a separate
copy of the same keys. The duplicate callback seeding is removed. Only the explicit development seed
action now installs those keys on the seed account.

On 2026-08-04, the operator changed the accepted provider boundary after the organization-base
validation. The branch now makes provider connections organization-owned with required
`connectedByUserId`, permits several rows of one provider kind without adding selector UI, and binds
provider-backed resources and plans to exact connection IDs. Existing connections will not be
migrated.

### Final review-fix checkpoint

Accepted before merge:

- keep the normal one-person FileView edit and commit path, then clear committed staging;
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
- compatibility code for the data removed by the approved manual reset;
- simultaneous FileView commits, structural edits during a commit, external Git changes during a
  commit, and full two-member FileView acceptance.

The FileView release boundary is intentionally narrow. A normal one-person edit and commit remains.
Post-commit delayed-save reconciliation, retry recovery after Git accepted a commit, ambiguous
rename retry handling, commit locks, and multi-writer merging are deferred.

## Prior Organization-Base Validation Evidence

Final integrated code head before this progress-record update: `22846b8c`.

- `pnpm check`: passed, with existing repository warnings only.
- `pnpm test`: 292 files passed, with 2,309 tests passed and 1 skipped.
- `pnpm test:convex`: 47 files passed, with 452 tests passed.
- Focused FileView and development-auth suite: 4 files passed, with 75 tests passed.
- `pnpm --filter samebase typecheck`: passed after Convex code generation.
- `pnpm format:check` and `git diff --check`: passed.
- `pnpm test:visual:linux`: 209 tests passed, 1 skipped, and the same unchanged public landing
  URL-editor test failed. That test also failed on clean `main` in the earlier acceptance check. All
  Settings route tests passed. The staged-editor row identity intentionally changes no pixels.
- Real-route local acceptance passed for the seeded operator, a second member in the same
  organization, and one waitlisted account. Both members loaded the same Free plan, zero shared
  resource usage, and empty organization vault list. The second member kept three disconnected
  personal providers after a new login. The waitlisted account saw `Account access pending` on
  `/vault` and `/providers` and did not receive app access.

## Provider Ownership Validation Evidence

- The local final-schema cutover required the approved reset of old user-owned provider rows. The
  previous isolated local database was moved to a recoverable backup. No preview or production data
  changed.
- The seeded organization displayed its GitHub, Convex, and Cloudflare connections on `/providers`.
  Live GitHub access checks loaded the expected account, repositories, and organizations.
- A real `/new-app` run created the temporary GitHub repository, seeded the starter commit, created
  the Convex project, created the Cloudflare Worker, configured Workers Builds, and rotated the
  Convex deploy keys.
- Reloading the real `/vault` route loaded the same repository commit, Cloudflare Worker and build,
  Workers URL, and Convex deployment through their stored provider connection IDs.
- Manual testing found and fixed one broad argument object passed to a strict Convex query. It also
  found that the starter CI file requires GitHub's `workflow` scope. The GitHub connection contract
  now requests and reports that scope.
- The first Cloudflare build timed out in Cloudflare before a project command started. One clean
  retry built the app, deployed the Convex functions, deployed the Worker, passed all three checks,
  and returned HTTP 200 from the Workers URL.
- The normal vault deletion flow removed the temporary vault, GitHub repository, Convex project, and
  Cloudflare Worker. Follow-up reads through the product and provider APIs confirmed that all four
  resources were gone.
- `pnpm --filter samebase check:ci` passed. `pnpm test` passed 294 files and 2,304 tests, with one
  existing skipped test.
- The canonical Linux visual run passed the updated provider connection image and 209 other tests.
  One unrelated mobile URL-editor test missed its input during the full parallel run, then passed in
  an isolated Linux rerun without a code change.
- Independent release-path and delete-first reviews found no provider-ownership or main-flow blocker
  and no safe production code to remove before the one-time retained-user bootstrap runs.
- The first pull request preview deploy found one old user-owned provider row in the exact Convex
  preview deployment. Convex rejected the row because it had no organization fields. The preview
  deployment was confirmed as `preview/codex-organization-ownership-spec`, deleted, and recreated.
  The clean retry passed without migration or compatibility code, and all pull request checks were
  green.

## UI And Workflow Coverage

This is a full-stack rollout. The implementation owns the code changes and the two-member acceptance
pass for every shipped organization surface whose data or behavior changes.

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
- the organization access boundary and final actor-field names for editor, staged-file,
  pull-request, Data, and Schema operations;
- provider observation, provider-write, provisioning, vault deletion, and account deletion flows;
- organization provider connection setup, shared status, and backend use by both members, with the
  connecting member retained as provenance;
- final organization-aware query and action results used by current routes;
- route-level interaction tests and screenshot coverage for every changed shipped UI state.

The implementation verifies the shipped organization surfaces with both members of the shared
operator organization. Full two-member FileView editing is not part of this release acceptance. The
implementation also verifies sole-member and shared-member account deletion, MCP token validation,
`tools/list`, `tools/call`, tool execution, and browser handoff before the production reset.

Personal UI settings remain separate for two members. Provider connections and their non-secret
status are shared by the organization. The rollout adds no organization name, switcher, invitation
flow, membership page, or new organization chrome.

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

1. Validate shared provider status and resource access through both members when the member setup
   flow is ready for release testing.
2. Record the Polar billing state and confirm that no destructive workflow is active.
3. Disconnect all providers, pause product writes, and follow the accepted manual reset runbook
   while the old schema is live.
4. Merge and deploy the final schema and organization-authoritative runtime.
5. Run the retained-user bootstrap with the two explicit operator user IDs and recorded billing
   state.
6. Verify the bootstrap counts and the required two-member flows, reconnect MCP and the retained
   vaults, then resume product writes.
