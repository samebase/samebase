# 120 GitHub-Backed Organization Ownership Rollout

## Document Control

- Status: Active
- Owner: Samebase backend
- Last updated: 2026-08-05
- Source of truth: `specs/120_ORGANIZATION_OWNERSHIP_SPEC.md`
- Replacement branch: `codex-github-app-organizations`
- Superseded draft: [#1355](https://github.com/samebase/samebase/pull/1355)
- Current checkpoint: Implementation complete, real development validation pending

## Purpose

This file is the compact progress record for the organization rollout. Update it only when a product
decision, implementation checkpoint, manual result, or blocker changes. Do not add agent logs,
review transcripts, or a per-commit journal.

## Accepted Direction

- Users can have zero, one, or several organization memberships.
- Signup and waitlist entry do not create organizations or billing rows.
- One Samebase organization maps to one stable GitHub repository owner.
- A verified Samebase GitHub App installation creates or reconnects the organization.
- GitHub is not a deployment `providerConnections` kind.
- GitHub App installation tokens serve normal repository operations.
- User-specific GitHub App authorization stays user-owned and separate.
- Convex and Cloudflare connections are organization-owned and record who connected them.
- Several Convex or Cloudflare connections per organization are valid in the schema.
- Vaults, billing, quotas, provider resources, and MCP organization grants are organization-owned.
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
Cloudflare connection references, organization billing, and organization-bound MCP grants.

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
URL. The client secret and private key were validated against GitHub without printing them.
Production credentials are required before production deployment, not for local or development
validation.

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
- Bind MCP grants to one organization.
- Remove opaque organization URL selection.
- Keep user deletion separate from organization deletion.

### 3. Reduction and real validation

Status: In progress

- Rejected user-owned, GitHub-provider, compatibility, and broad stale test code is removed.
- Full TypeScript validation and the focused organization test set pass.
- The implementation diff removes substantially more code than it adds.
- An organization-bound MCP grant no longer exposes the full-user browser handoff tool.
- Reset disposable local product data.
- Run real two-user and multiple-organization manual flows with OAuth credentials.
- Validate vault reload, GitHub, Convex, Cloudflare, observations, MCP, and denied access.
- Record exact evidence and remaining production cutover work.

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
12. Confirm an organization-bound MCP grant can access the vault and a different organization
    cannot.

## Reset Boundary

Before final schema deployment, the operator can clear organizations, memberships, organization
billing, provider connections, vaults, staging, workflows, and MCP authorization data. Keep users,
authentication accounts, approval, and waitlist state. Do not run a production reset until the exact
targets and final schema deployment are ready.

## Current Blockers

- No implementation blocker exists for development validation.
- Production GitHub App secrets block production deployment only.
- Webhook setup is deferred until the main installation and repository flows work.

## Next Exact Task

Run the real development GitHub App, provider, vault reload, two-member, denied-access, and MCP
organization-boundary checks. Record the exact results before opening the replacement pull request.
