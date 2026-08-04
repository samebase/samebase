# 120 GitHub-Backed Organization Ownership Rollout

## Document Control

- Status: Active, architecture revised
- Owner: Samebase backend
- Last updated: 2026-08-05
- Source of truth: `specs/120_ORGANIZATION_OWNERSHIP_SPEC.md`
- Current branch: `codex-organization-ownership-spec`
- Current pull request: [#1355](https://github.com/samebase/samebase/pull/1355)
- Current state: Existing implementation does not match the accepted GitHub App model

## Purpose

This is the compact progress and restart record for the organization rollout. Update it when an
architecture decision, implementation checkpoint, manual test, or blocker changes. Do not add raw
agent output, review transcripts, or a per-commit journal.

## Accepted Direction

- A Samebase user can have zero, one, or several organization memberships.
- Signup, sign-in, waitlist entry, and approval do not create an organization or billing row.
- Google and other supported sign-in methods remain independent from GitHub access.
- One Samebase organization maps to exactly one stable GitHub repository owner ID.
- An organization has no unbound state. A verified Samebase GitHub App installation creates it.
- The GitHub owner login is display and route data. The stable owner ID is the external identity.
- A GitHub App installation is replaceable connection state. App removal blocks GitHub operations
  but does not erase the owner binding or organization data.
- GitHub is not a `providerConnections` kind. Installation authentication is organization-owned.
- GitHub user authorization is user-owned and exists only for operations that require user context.
- Cloudflare and Convex connections remain organization-owned, record `connectedByUserId`, and
  permit several rows of one provider kind.
- Cloudflare and Convex resources and plans keep exact provider connection IDs.
- Vault routes derive organization ownership from the GitHub owner and repository. They do not use
  an opaque organization query parameter.
- Billing, quotas, vaults, provider connections, and MCP organization grants belong to the
  organization.
- A user with no organization has no organization billing row.
- User deletion is not organization deletion. It must not delete a GitHub-backed organization or
  shared resources because the user was its only Samebase member.
- The pre-beta cutover can clear disposable product data. No compatibility runtime is required.
- FileView multi-writer behavior remains outside the release gate.

## Decision Change On 2026-08-05

The former model treated a Samebase organization as an independent customer workspace that could
contain repositories from several GitHub owners. It also created one personal organization for every
new and waitlisted user.

That model is rejected. It caused three separate choices in common flows: Samebase organization,
GitHub owner, and provider connection. It also required an opaque organization URL parameter even
when `/vault/<owner>/<repository>` already identified the resource.

The revised model makes the GitHub repository owner the organization boundary. It removes automatic
personal organizations and uses a Samebase GitHub App as the required GitHub connection.

## Current Pull Request Audit

Against `origin/main` on 2026-08-05, pull request #1355 has 207 changed files, 13,716 additions, and
4,843 deletions. Approximately 6,400 additions are tests or snapshots. The current branch also has
six unstaged GitHub OAuth scope changes that predate the GitHub App decision.

### Keep as accepted design

- Many-to-many `organizationMemberships` and membership-based access checks
- Organization ownership on vaults, Cloudflare and Convex connections, billing, quotas, and MCP
  grants
- `connectedByUserId` provenance for Cloudflare and Convex credentials
- Exact Cloudflare and Convex provider connection IDs on attached resources and provisioning plans
- Resource-derived organization checks for existing vault operations
- MCP grants bound to an exact organization
- Personal UI and authentication state kept on the user
- Shared vault staging ownership without FileView multi-writer expansion

These ideas remain valid, but many current files mix them with rejected GitHub provider and URL
selection behavior. They are references, not code that must be preserved unchanged.

### Delete

- Automatic personal organization and billing creation during authentication
- Retained-user organization bootstrap and its tests
- Personal organization names derived from profile data
- GitHub as a generic OAuth or API-key `providerConnections` variant
- `selectedGithubProviderConnectionId`
- GitHub provider connection IDs on vaults, plans, observations, and deletion workflows
- Sticky `?organization=<Convex ID>` routing, selection hooks, selector effects, and related tests
- Account deletion code that requires one membership or deletes a sole member's organization
- Organization account-deletion locking that exists only for the rejected sole-member cleanup
- GitHub OAuth scope-health work that the GitHub App permissions model replaces
- Tests whose only purpose is preserving the rejected model
- The old cutover guide that bootstraps one organization for every retained user

### Rework

- Organization schema and creation around stable GitHub owner identity and App installation state
- GitHub API calls to use installation authentication by default
- Personal GitHub repository creation to use the acting user's GitHub App user authorization
- Billing creation to run only with verified organization creation
- Root vault, provider, billing, provisioning, and MCP context without opaque organization IDs
- Account deletion to remove user state and memberships without organization deletion
- Cloudflare and Convex provider code after removal of the GitHub union variants
- Manual reset and two-member acceptance instructions

## Implementation Strategy Recommendation

Start the implementation again from the latest `origin/main`. Use pull request #1355 only as a
source for small, reviewed organization ownership fragments.

Do not reduce the current 207-file tree by trying to find every hidden dependency on automatic
organizations, GitHub provider connection IDs, and explicit URL selection. The new GitHub App model
changes the assumptions used by the largest connected parts of the diff. A clean base gives old
tests no authority over the new schema.

This recommendation does not authorize rewriting or deleting the current remote branch. Preserve
pull request #1355 until the operator chooses whether the clean implementation replaces that pull
request or updates its branch.

The clean implementation remains one complete rollout, not nine pull requests. Use a small number of
coherent commits for review:

1. GitHub App organization identity, zero-organization users, membership, and billing creation.
2. Vault, Cloudflare, Convex, MCP, account deletion, and UI routing on the new boundary.
3. Delete-first reduction, generated files, accepted manual validation, and rollout records.

## GitHub App Prerequisite

Create separate development and production GitHub App registrations before implementation of the
provider boundary. Record only non-secret configuration in the rollout or environment templates.
Store private keys, client secrets, and webhook secrets only in the deployment secret stores.

The registration work must decide and verify:

- application names and owners;
- home, callback, setup, and webhook URLs;
- development and production App IDs and client IDs;
- repository and organization permissions required by current Samebase operations;
- webhook events for installation lifecycle, repository access, and owner rename;
- whether repository access is all repositories or selected repositories;
- installation user authorization for secure setup and personal-account repository creation; and
- local development callback and webhook delivery through the approved tunnel.

Do not request a GitHub permission because it could be useful later. Map each permission to a
current Samebase API operation before registration.

## Retained Manual Evidence

The old implementation completed one useful two-user manual test:

- Two separate Samebase users accessed one organization.
- The second user used organization-owned GitHub, Cloudflare, and Convex credentials without adding
  personal provider credentials.
- The second user created a repository, Convex project, and Cloudflare Worker.
- Both users reloaded the same vault and saw the same resources and observations.
- Normal product deletion removed the temporary external resources.

This proves the value of shared organization-owned deployment access. It does not validate the new
GitHub App identity, zero-organization signup, or final URL model. Those checks must run again.

## Reset Boundary

The operator approved destructive cleanup of disposable pre-beta product data. Before the final
schema deploy, the operator can clear organizations, memberships, organization billing, provider
connections, vault records, staging, workflow state, and MCP grants. Retain users, authentication
accounts, approval, waitlist state, and external provider resources unless the operator explicitly
deletes them.

Do not create compatibility fields, fallback reads, dual writes, or a general data migration. Do not
run a production reset until the final code, runbook, and exact measured targets are ready.

## Validation Gates

The rollout is not ready until manual checks prove the main flows:

- A new Google-authenticated or waitlisted user has zero organizations and no billing row.
- A verified GitHub App installation creates one organization for one stable owner ID.
- The second retained user joins through the internal membership function without getting a personal
  organization or linking GitHub.
- Both members can list and reload organization vaults.
- A member can create a GitHub organization repository, Convex project, and Cloudflare Worker using
  organization connections.
- `/vault/<owner>/<repository>` reloads with no organization query and shows current GitHub,
  Cloudflare, and Convex observations.
- GitHub App suspension or removal blocks GitHub operations without deleting Samebase data.
- A user outside the organization cannot read or change its resources.
- MCP consent and tool calls use the exact organization membership.
- Account deletion removes the user and memberships without deleting the organization.

Focused automated tests must protect these invariants. Do not rebuild the former broad test volume
before the real flows pass manually.

## Current Blockers

- Development and production GitHub Apps do not exist yet.
- Their exact permission and callback configuration is not recorded yet.
- The current implementation and tests describe the rejected model.
- The current branch is two commits behind `origin/main` and has six unstaged OAuth scope changes.
- The operator has not chosen whether the clean implementation gets a replacement branch and pull
  request or replaces the current pull request branch.

## Next Exact Task

1. Review and accept the revised spec and clean-start recommendation.
2. Define the exact development and production GitHub App registration values and permissions.
3. Create both GitHub Apps and store their secrets in the correct environments.
4. Start the clean implementation from current `origin/main`.
5. Implement the main flow before broad automated coverage.
6. Run the two-user manual acceptance flow, then add only the focused regression tests it proves are
   needed.
