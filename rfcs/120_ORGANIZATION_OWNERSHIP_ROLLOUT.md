# 120 GitHub-Backed Organization Ownership Rollout

## Document Control

- Status: Active
- Owner: Samebase backend
- Last updated: 2026-08-05
- Source of truth: `specs/120_ORGANIZATION_OWNERSHIP_SPEC.md`
- Replacement branch: `codex-github-app-organizations`
- Replacement PR: [#1367](https://github.com/samebase/samebase/pull/1367)
- Superseded draft: [#1355](https://github.com/samebase/samebase/pull/1355)
- Current checkpoint: Focused post-review corrections complete; final manual validation and
  production cutover remain

## Purpose

This file is the compact progress record for the organization rollout. Update it only when a product
decision, implementation checkpoint, manual result, or blocker changes. Do not add agent logs,
review transcripts, or a per-commit journal.

## Accepted Direction

- Users can have zero, one, or several organization memberships.
- Every membership is either `owner` or `member`. Members use organization resources; owners also
  manage providers, GitHub reconnection, and billing.
- Signup and waitlist entry do not create organizations or billing rows.
- One Samebase organization maps to one stable GitHub repository owner.
- A verified Samebase GitHub App installation creates or reconnects the organization.
- GitHub is not a deployment `providerConnections` kind.
- GitHub App installation tokens serve normal repository operations.
- User-specific GitHub App authorization stays user-owned and separate.
- Convex and Cloudflare connections are organization-owned and record who connected them.
- Several Convex or Cloudflare connections per organization are valid in the schema.
- Vaults, billing, quotas, and provider resources are organization-owned. MCP grants act as their
  Samebase user across that user's current organization memberships.
- Vault routes derive organization context from `/vault/<owner>/<repository>` and have no opaque
  organization query parameter.
- User deletion is not organization deletion.
- Disposable pre-beta product data can be reset. Compatibility code is not required.
- FileView multi-writer behavior is not a release gate.

## Why The Previous Draft Is Not The Base

Draft [#1355](https://github.com/samebase/samebase/pull/1355) uses independent Samebase workspaces,
automatic organizations for new users, GitHub provider connections, and opaque organization URL
selection. The accepted GitHub owner boundary rejects those assumptions.

The draft had 207 changed files, 13,353 additions, and 4,843 deletions when the restart decision was
made. The old branch remains untouched as a reference. The clean branch starts from current
`origin/main` so rejected tests and compatibility code do not control the final model.

Useful concepts to reapply are membership access, organization-owned resources, exact Convex and
Cloudflare connection references, and organization billing.

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
- Production secrets: Not generated yet

Both Apps have repository Administration read/write, Checks read, Commit statuses read, Contents
read/write, Pull requests read/write, Workflows read/write, and automatic Metadata read.

Development Convex has the App ID, slug, client ID, client secret, private key, and OAuth callback
URL. The client secret and private key were validated against GitHub without printing them. Convert
each GitHub-generated RSA private key to unencrypted PKCS#8 before storing it as
`GITHUB_APP_PRIVATE_KEY`; the GitHub download is PKCS#1, which the Convex Web Crypto runtime cannot
import. Production credentials are required before production deployment, not for local or
development validation.

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
- MCP grants do not expose the browser handoff tool.
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
  billing account. No GitHub provider connection or user authorization row was created.
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
- Installing Samebase Dev on `nicu-typescript` created a second organization and owner membership
  for the same user. The installation was limited to one test repository. The two organizations had
  separate provider state and separate Free billing accounts.
- Connecting `nicu-typescript/codespace-test` created a vault only in that organization. Its clean
  vault route reloaded and did not expose or require provider connections from `samebase`.
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

## Manual Acceptance Order

1. Confirm a user can exist with zero organizations.
2. Install Samebase Dev for one GitHub owner and verify one organization, membership, and billing
   row are created.
3. Reinstall for the same owner and confirm no duplicate organization exists.
4. Install for a second GitHub owner and confirm the same user can access both organizations.
5. Add the second Samebase user through the internal function.
6. Confirm that user needs no GitHub, Convex, or Cloudflare credential for organization operations.
7. Connect one Convex and one Cloudflare account to the first organization.
8. Create or connect a repository, create the Convex project and Cloudflare Worker, and open the
   vault as both members.
9. Reload `/vault/<owner>/<repository>` with no organization query parameter.
10. Confirm both members see the same provider resources and observations.
11. Confirm a non-member cannot read or change the vault.
12. Confirm one MCP grant can access both organizations of its user, then confirm that removing one
    membership removes access to that organization's vault.

## Focused Review Decisions

- A first Samebase organization claim for a GitHub organization requires an active GitHub
  administrator membership whose stable organization ID matches the installation owner.
- GitHub organization repositories can be created by any Samebase member. A personal-owner
  repository requires the acting Samebase user's exact GitHub user authorization.
- MCP acts on behalf of the Samebase user across current memberships. The organization chooser and
  organization ID on MCP grants are removed instead of extended.
- Cloudflare account visibility remains a simple business rule for this rollout. The schema already
  keeps the selected account plus exact account and connection IDs on attachments, so account
  visibility can be refined before member invitations ship without changing the ownership model.
- The operator membership function accepts a required role so an organization without an owner is
  manually recoverable. No invitation UI, role editor, or last-owner workflow is added.

## Reset Boundary

Before final schema deployment, the operator can clear organizations, memberships, organization
billing, provider connections, vaults, staging, workflows, and MCP authorization data. Keep users,
authentication accounts, approval, and waitlist state. Remove the legacy user billing fields that
are not accepted by the final strict user schema. Do not run a production reset until the exact
targets and final schema deployment are ready.

Clear `observations_vaultConvexSchema_snapshots` before deploying the schema that removes its old
`userId` field. Product code has no compatibility reader for those disposable snapshot rows.

## Current Blockers

- Repeat the realistic organization and MCP flows on the corrected model before the production
  cutover.
- Production GitHub App secrets block production deployment only.

Webhook setup is deferred until the main installation and repository flows work. It is not a release
blocker for this rollout.

## Next Exact Task

Repeat the realistic manual organization and MCP flows. Then generate and configure the production
GitHub App secrets and perform the accepted pre-beta product-data reset.
