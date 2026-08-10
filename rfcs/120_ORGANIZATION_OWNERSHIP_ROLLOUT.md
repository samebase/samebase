# 120 GitHub-Backed Organization Ownership Rollout

## Document Control

- Status: Active
- Owner: Samebase backend
- Last updated: 2026-08-10
- Sources of truth: `specs/120_ORGANIZATION_OWNERSHIP_SPEC.md` for organization ownership and
  `specs/122_ACCOUNT_SIGN_IN_METHODS_SPEC.md` for account identity, and
  `specs/123_ORGANIZATION_MEMBERSHIP_ADMINISTRATION_SPEC.md` for membership administration
- Replacement branch: `codex-github-app-organizations`
- Replacement PR: [#1367](https://github.com/samebase/samebase/pull/1367)
- Superseded draft: [#1355](https://github.com/samebase/samebase/pull/1355)
- Current checkpoint: PR #1367 merged as `db069c026`; the linked-worktree organization seed
  follow-up passed focused and manual validation

## Purpose

This file is the compact progress record for the organization rollout. Update it only when a product
decision, implementation checkpoint, manual result, or blocker changes. Do not add agent logs,
review transcripts, or a per-commit journal.

## Accepted Direction

- Users can have zero, one, or several organization memberships.
- Every membership is either `owner` or `member`. Members use organization resources; owners also
  manage providers, GitHub reconnection, and billing.
- Every organization always has at least one active owner. Account deletion, membership removal,
  leave, and demotion fail if they would remove the last active owner.
- A Samebase owner can invite one exact GitHub identity as a member. Samebase membership stays
  separate from live GitHub organization membership and role.
- Signup and waitlist entry do not create organizations or billing rows.
- One Samebase organization maps to one stable GitHub repository owner.
- A verified Samebase GitHub App installation creates or reconnects the organization.
- GitHub is not a deployment provider credential.
- GitHub App installation tokens serve normal repository operations.
- GitHub App user authorization stays user-owned and separate. One Samebase user has at most one
  current authorization. Spec 122 owns its personal-owner identity prerequisites.
- Convex and Cloudflare destinations and credentials are organization-owned. During beta, each
  organization has at most one Convex team and one Cloudflare account. This is a product limit, not
  organization identity. `rfcs/122_ORGANIZATION_DEPLOYMENT_PROVIDER_ROLLOUT.md` owns its rollout.
- Vaults and long-lived Convex and Cloudflare resource rows use stable external team, project,
  account, and Worker IDs. They do not depend on a replaceable credential document ID.
- Persistent provisioning plans and deletion retry snapshots also use external provider resource
  IDs. They resolve the current usable connection when work runs or retries.
- Vaults, billing, quotas, and provider resources are organization-owned. MCP grants act as their
  Samebase user across that user's current organization memberships.
- Vault routes derive organization context from `/vault/<owner>/<repository>` and have no opaque
  organization query parameter.
- User deletion is not organization deletion.
- Whole-vault deletion keeps its current member access for pre-beta testing. Commit-aware deletion
  rules and stronger customer guardrails are a later vault-lifecycle task.
- Disposable pre-beta product data can be reset. Compatibility code is not required.
- FileView multi-writer behavior is not a release gate.

## Why The Previous Draft Is Not The Base

Draft [#1355](https://github.com/samebase/samebase/pull/1355) uses independent Samebase workspaces,
automatic organizations for new users, GitHub provider connections, and opaque organization URL
selection. The accepted GitHub owner boundary rejects those assumptions.

The draft had 207 changed files, 13,353 additions, and 4,843 deletions when the restart decision was
made. The old branch remains untouched as a reference. The clean branch starts from current
`origin/main` so rejected tests and compatibility code do not control the final model.

Useful concepts to reapply are membership access, organization-owned resources, external provider
resource identities, and organization billing.

## GitHub Apps

Development App:

- Name: `Samebase Dev`
- Slug: `samebase-dev`
- Owner: `samebase`
- App ID: `4489194`
- Client ID: `Iv23liGcJNuRNU8icweu`
- Callback: `https://quiet-robin-508.convex.site/oauth/github/callback`
- Installation target: Any account
- User authorization during installation: Enabled
- Expiring user tokens: Enabled
- Webhooks: Disabled for the first main-flow implementation

Production App:

- Name: `Samebase`
- Slug: `samebase`
- Owner: `samebase`
- App ID: `4489215`
- Client ID: `Iv23lidFhcIUMzBjZUdN`
- Callback: `https://api.samebase.com/oauth/github/callback`
- Public page: https://github.com/apps/samebase
- Production Convex settings and credentials: Configured and validated
- User authorization during installation: Enabled
- Expiring user tokens: Enabled
- Webhooks: Disabled for the first main-flow implementation

Both Apps have repository Administration read/write, Checks read, Commit statuses read, Contents
read/write, Pull requests read/write, Workflows read/write, organization Members read, and automatic
Metadata read. Both development installations accepted the added Members permission.

Development Convex has the App ID, slug, client ID, client secret, private key, and OAuth callback
URL. The client secret and private key were validated against GitHub without printing them. Convert
each GitHub-generated RSA private key to unencrypted PKCS#8 before storing it as
`GITHUB_APP_PRIVATE_KEY`; the GitHub download is PKCS#1, which the Convex Web Crypto runtime cannot
import. Production Convex now has all six required GitHub App settings. The stored private key
successfully authenticated the exact production App through GitHub's API. Only one active client
secret and one private key remain after setup, and the downloaded private-key file was removed.

## Implementation Checkpoints

### 1. Contract and minimal identity model

Status: Complete

- Clean branch created from `origin/main` at `7d30d805f`.
- Final product contract recorded.
- Exact schema and GitHub App request boundary implemented.

### 2. Released organization flows

Status: Complete on the replacement branch

- Implement verified GitHub App setup.
- Add membership and organization billing access.
- Move Convex and Cloudflare connections to organization ownership.
- Move vaults and attached resources to organization ownership.
- Use GitHub installation tokens for repository operations.
- Keep MCP grants user-wide and apply current organization membership at each target operation.
- Remove opaque organization URL selection.
- Keep user deletion separate from organization deletion.

### 3. Reduction and real validation

Status: Complete on the replacement branch

- Rejected user-owned, GitHub-provider, compatibility, and broad stale test code is removed.
- Full TypeScript validation and the focused organization test set pass.
- The implementation diff removes substantially more code than it adds.
- MCP grants are user-wide and can expose browser handoff only through the explicit
  `access_browser_login_handoff` scope. The handoff creates a session for the grant user and stores
  no organization identity.
- The focused browser-handoff suite passes with 178 tests across 16 files. The provider-page,
  handoff-route, and trusted MCP request-boundary follow-up passes with 28 tests across three files.
- Development data reset complete. Later Google sign-in checks left six test users: four approved
  accounts and two pending accounts. Disposable product data was rebuilt from the final model.
- The real two-user flow passed with GitHub App, Convex OAuth, and Cloudflare OAuth credentials.
- Vault reload, provider observations, shared provisioning, and denied browser access passed.
- Multiple-owner, membership-role, and owner-route checks passed. The earlier organization-bound MCP
  result is superseded by the accepted user-wide MCP decision below.
- The final deletion audit removed a duplicate owner lookup subscription and unused provider
  selection APIs. The branch remains deletion-heavy against `origin/main`.
- Shared staged rows no longer store or authorize through a user owner. Vault organization
  membership authorizes writes, and `lastEditUserId` keeps latest-actor provenance.
- `pnpm check` and the full unit suite pass after the final reduction: 265 test files passed, with
  1,890 tests passed and one skipped.

## Development Manual Results

- A signed-in user with no membership saw no vaults and no provider connections.
- Installing Samebase Dev for `samebase` created one organization, one membership, and one Free
  billing account.
- The first member connected Convex and Cloudflare through OAuth. Live checks passed for Convex
  projects and deployments, and for Cloudflare accounts, Workers, and Workers Builds.
- The first member created `tmp-8462-org-happy-path`. GitHub, Convex, and Cloudflare provisioning
  reached `3/3 passed`; its Worker returned HTTP 200; reload kept the route
  `/vault/samebase/tmp-8462-org-happy-path` with no organization query parameter.
- The internal membership function added a second real Samebase account. That member immediately saw
  the shared vault and both organization provider connections without connecting credentials.
- The second member created `tmp-8462-org-member-app` with the same organization credentials.
  GitHub, Convex, and Cloudflare provisioning reached `3/3 passed`; its Worker returned HTTP 200;
  reload kept the clean vault route.
- An approved account without membership saw no vaults or provider connections. Opening a known
  vault route returned `Vault not found` and did not expose its Convex or Cloudflare resources.
- The two-member provider page exposed that unrestricted memberships also allowed provider and
  billing administration. The accepted fix is a required `owner | member` role before beta, with no
  compatibility path or general role-management feature.
- `/providers/samebase`, `/new-app/samebase`, and `/connect-repo/nicu-typescript` restored their
  selected organization after reload. Their selectors showed GitHub owner logins and did not show
  internal organization IDs.
- The owner provider page kept reconnect, disconnect, account-selection, and billing actions. The
  second member saw the same provider status and vaults, but only the read-only access checks. The
  owner session was restored after this check.
- The earlier manual MCP run used one organization per grant. That result is retained as historical
  evidence only. The accepted final model makes MCP grants user-wide and relies on current
  membership and role checks for each target.
- Real provisioning found two strict Convex argument-boundary defects. The saved fixes construct
  only the arguments accepted by the target query. No compatibility path was added.
- A final Chrome run tested the current owner routes from their base pages. With two memberships,
  `/providers`, `/new-app`, and `/connect-repo` started without a selected owner. Selecting
  `samebase` moved each page to its stable owner route. The `nicu-typescript` organization kept its
  separate, unconnected provider state, and app creation stayed disabled there.
- The owner created `tmp-8462-org-route-owner` from `/new-app/samebase`. GitHub, Convex, and
  Cloudflare reached `3/3 passed`; the Worker served the generated app; reload restored the clean
  vault route and all three resources. The owner also connected `samebase/monorepo-fixture` from
  `/connect-repo/samebase`; its branch and pull-request observations survived reload.
- The member saw both organization provider connections, completed both live access checks, and
  could not reconnect, disconnect, or select provider accounts. The member saw the two new shared
  vaults but did not see the `nicu-typescript` vault.
- The member created `tmp-8462-org-route-member` without personal GitHub, Convex, or Cloudflare
  credentials. The owner then saw the same GitHub repository, Convex project, Worker, and
  observations after signing in and reloading the vault.
- The first Cloudflare build for `tmp-8462-org-route-member` failed because the generated app's
  prerender step timed out while it fetched its temporary local server. Retrying the same build
  without a code or configuration change succeeded. The Worker then served the app and Samebase
  reported `3/3 passed`. This was a Cloudflare build reliability failure, not an organization or
  provider-authorization failure.
- A sanitized database check confirmed one owner and one member in `samebase`, one billing row per
  test organization, two selected organization provider connections, organization-matching vault
  resources and provisioning plans for both new apps, and isolation for the `nicu-typescript` vault.
  Credential fields were not printed or copied.
- A post-review browser pass confirmed that a pending account can open Settings without blocked
  setup actions. Invalid owner routes recovered and kept other query parameters. Owner and member
  reloads restored the member-created vault with its GitHub repository, Worker, Convex project, and
  `3/3 passed` state. The member stayed isolated from `nicu-typescript` and did not receive
  owner-only provider controls.
- A final corrected-model pass signed in as the member and created
  `samebase/tmp-8462-org-final-member` with the organization's GitHub App, Convex connection, and
  Cloudflare connection. The repository, Convex project, Cloudflare Worker, and observations were
  created. The deployed Worker returned HTTP 200. Its GitHub check failed when the generated app's
  prerender request to its temporary local server timed out. The successful Worker deployment and
  provider observations confirmed that this was not an organization authorization failure.
- The owner then saw vaults from both `samebase` and `nicu-typescript`. `/providers` required an
  explicit GitHub owner selection, `/providers/samebase` survived reload, and no internal
  organization ID appeared in the URL. The owner received provider management actions. The member
  received shared provider status and read-only access checks.
- A real Codex OAuth flow showed account-wide MCP consent with no organization selector. One MCP
  grant called `vault_dashboard_getUserVaults` and returned seven vaults across the `samebase` and
  `nicu-typescript` memberships. This confirms that the grant represents the Samebase user and that
  inventory uses all current memberships.
- A real local MCP OAuth flow requested the explicit browser-handoff scope. One link opened `/vault`
  for the grant user, a replay of that link failed, and a second link signed the same browser in
  after a full sign-out. The resulting session saw vaults across the user's current memberships.
  `/providers` showed the user-wide MCP grant before an owner was selected, and the temporary grant
  was revoked after the check.
- Temporary password sign-in and MCP OAuth data used for this development check were disabled or
  cleared after validation.
- A final signed-in Chrome pass checked the current implementation after the durable provider
  resource, last-owner, vault owner-login, and billing route changes. `/vault` listed vaults from
  both current memberships. `/providers/samebase` passed live Convex project and deployment checks
  and live Cloudflare account, Worker, and Workers Builds checks.
- Reloading `/vault/samebase/tmp-8462-org-route-member` kept its clean route and restored its GitHub
  repository, Cloudflare Worker, Convex project, and `3/3 passed` state.
- `/settings` required a GitHub owner selection for organization billing. Selecting `samebase`
  changed the URL to `/settings?owner=samebase`, showed that organization's plan and usage, and
  survived reload. Selecting `nicu-typescript` changed the URL to `/settings?owner=nicu-typescript`
  and showed its separate zero usage. Neither URL exposed an internal organization ID.
- Two fresh linked worktrees completed `pnpm dev --once`. Each had separate local Convex document
  IDs and one GitHub-backed organization, owner membership, Free billing account, Convex connection,
  and Cloudflare connection. Both organizations reused the same non-secret development GitHub owner
  and installation identity. `pnpm dev` then loaded the vault, provider, and New App pages. The
  Connect repository page listed repositories through the shared GitHub App installation.

## Focused Review Decisions

- MCP acts on behalf of the Samebase user across current memberships. The organization chooser and
  organization ID on MCP grants are removed instead of extended.
- Cloudflare account visibility remains a simple business rule for this rollout. Attached resources
  keep stable external account IDs. Operations use the current selected organization credential, and
  Cloudflare verifies its access to the resource account.
- The operator membership function remains a recovery tool. Spec 123 adds the product invitation,
  role, removal, and leave flows. Every organization must retain an active owner.
- Vaults use `organizations.githubOwnerLogin` as current route and display data. Historical workflow
  snapshots can retain the owner login observed when the workflow started.
- Do not add a repository-only rename patch. A future GitHub identity synchronization task must
  define organization-owner and repository rename behavior together.
- Account deletion waits for queued or running vault provisioning and deletion work started by the
  deleting user before it revokes credentials or removes memberships. Manual provider-write locks do
  not record an actor, so exact manual-write dependency tracking stays in a future provider
  operation-lifecycle task.

## Reset Boundary

Before final schema deployment, the operator can clear organizations, memberships, organization
billing, provider connections, vaults, staging, workflows, and MCP authorization data. Keep users,
authentication accounts, approval, and waitlist state. Remove the legacy user billing fields that
are not accepted by the final strict user schema. Do not run a production reset until the exact
targets and final schema deployment are ready.

Clear `observations_vaultConvexSchema_snapshots` before deploying the schema that removes its old
`userId` field. Product code has no compatibility reader for those disposable snapshot rows.

## Current Blockers

- None in the accepted organization schema or ownership model.

## Production Cutover Result

- A full production backup with file storage was created before any destructive action.
- The one pre-beta Polar subscription was revoked immediately and verified as canceled.
- All three old GitHub OAuth grants and both old Cloudflare OAuth grants were revoked.
- Of the three old Convex OAuth tokens, one was already invalid and one was revoked through Convex
  Authorized Applications. The last token belongs to another Convex dashboard account. Samebase's
  stored copy was deleted, so the application cannot use it. Revoke it from that account's Convex
  Authorized Applications page as later provider housekeeping.
- All 30 accepted disposable tables were cleared. This includes vault, provider, workflow, MCP
  authorization, and MCP audit data.
- All six users, authentication tables, approval state, waitlist state, user UI state, vault folder
  definitions, and global MCP client registrations remain.
- All legacy user billing fields were removed. No retained user has an active account deletion.
- The Workflow component has no active run. Its internal history and configuration remain.

Webhook setup is deferred until the main installation and repository flows work. It is not a release
blocker for this rollout.

## Next Exact Task

Merge the focused linked-worktree setup follow-up after review and CI. Keep production provider
housekeeping separate from the organization model.
