# 125 Convex Registered Module Layout

## Document Control

- Status: Proposed
- Owner: Samebase backend
- Updated: 2026-09-28
- Related: [Convex repository module layout](../specs/100_CONVEX_REPOSITORY_MODULE_LAYOUT_SPEC.md),
  [domain ownership rollout](../archive/124_MONOREPO_DOMAIN_OWNERSHIP_ROLLOUT.md), and the
  [Convex backend map](../apps/samebase/convex/README.md)

## Problem

Plain backend modules now live in owner folders. The Convex root still holds 48 modules that
register functions, plus their tests. A reader who looks for GitHub, Cloudflare, billing, staging,
or organization code must still search the root.

A Convex function path is the module path plus the export name. Moving a registered module changes
every function path in it. Three runtimes can hold an old path:

- A scheduled job stores its function path when it is scheduled.
- A running Workflow stores its step and completion references (see Spec 100).
- A browser tab that loaded an older bundle calls public functions by the old path until it reloads.

## Decision Needed

Approve or reject moving registered root modules into owner folders, one folder per pull request,
with the checks below. The archived rollout deferred this decision because it needs production
coordination.

## Proposed Layout

| Folder            | Registered root modules                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `organization/`   | `organizations`, `organizationAccess`, `organizationAdmin`, `organizationMembers`, `organizationProviderCredentials`       |
| `identity/`       | `users`, `authAdmin`, `devAuth`, `previewSeedAccount`, `workspaceSidebarState`, `oauthState`                               |
| `githubApi/`      | `github`, `githubAppAccess`, `githubAppConnection`, `githubAppInstallation`, `githubChecks`, `githubUserAuthorizations`    |
| `cloudflare/`     | `cloudflareOAuth`, `cloudflareMcpOAuth`, `cloudflareProviderAccess`, `cloudflareAccountDiscovery`, `cloudflareBuildTokens` |
| `polar/`          | `billing`, `billingResourceQuotas`, `polarBillingState`, `polarCheckout`, `polarWebhooks`                                  |
| `staging/`        | `fileStaging`, `fileStagingActions`, `collaborative`, `folderExpansion`, `gitOperations`                                   |
| `convexPlatform/` | `convexOAuth`, `convexProviderAccess`, `convexDeploymentRegions`, `deploymentProfile`                                      |

When `github.ts` moves, rename `githubApi/` to `github/`; a root module and a folder with the same
name would merge into one `api.github` namespace.

These stay at the root:

- Framework entry points: `schema`, `auth`, `auth.config`, `http`, `convex.config`, and the custom
  function builders in `functions`.
- The Spec 100 runtime-owned paths: `infraProvisioning`, `repositoryProvisioningEvents`,
  `repositoryProvisioningRuns`, `repositoryProvisioningWorkflow`,
  `repositoryProvisioningWorkflowActions`, and `repositoryWorkflowAuthority`.
- `agentBrowserHandoff`, because `deleteExpired` is scheduled for the handoff expiry time.
- `email`, `repositoryPullRequests`, and `starterSeed` until an owner folder exists for them.

## Runtime Checks Per Move

Each move pull request lists the moved function paths and checks these before merge:

1. Scheduled jobs. Every scheduled target in the proposed folders is scheduled with a zero delay
   (`collaborative.pruneOldUpdates`, `fileStaging.deleteCollaborativeUpdates*`,
   `github.updateRepositoryTree`, `users.recordNameChangeAnalytics`). Read the production
   `_scheduled_functions` table for pending jobs in the moved module, following
   [the production read runbook](../docs/convex-production-reads.md). Merge only when none are
   pending with a future time.
2. Workflows. `githubUserAuthorizations` has one Workflow step target. Move it only when no account
   deletion Workflow is running, or keep that module at the root.
3. Browser tabs. Public functions in the moved module fail in tabs with an older bundle until the
   tab reloads. Merge the move with the Convex deploy and the frontend build in one deployment, as
   the repository module moves did.

No forwarding module, re-export shim, or compatibility path is added.

## Unused Registered Functions

No production code calls these registered functions. Delete them before the moves so the moves carry
less surface:

- `collaborative.getDocument`, `collaborative.getActiveEditors`, and
  `collaborative.pushSerializedChangeSetUpdate`
- `dashboardSettings.getDashboardSettings`, `setAccountPanelOpen`, and `setPricingBillingCycle` (the
  whole module)
- `fileStaging.listStagedFilesBranchSummariesByRepository` and
  `folderExpansion.clearFolderExpansionStates`
- `repository.dashboard.getUserRepositoryPullRequestFilters`, `setRepositoryPullRequestFilters`,
  `getUserRepositoryResourceLinksState`, and `setRepositoryResourceLinksOpen`
- `repository.deletion.events.listForRepository` and
  `repositoryProvisioningEvents.listForRepository` (the second one is used only by a test)
- `users.currentViewerRole` and `users.checkCloudflareMcpTokenHealth`
- `organizationAccess.requireOrganizationRoleForUser` and
  `repository.convexMutations.requireConvexProjectConnectionRepository`

Keep operator entry points that people run by hand, such as
`authAdmin.createOrUpdatePasswordAccount`, `organizationAdmin.addExistingUserToOrganization`, and
`polarBillingState.reconcileCustomerFromPolar`. Tables that lose their last reader or writer stay in
the schema until a separate data decision.

## Validation

- The deployed function list before and after each move differs only in the moved paths.
- Focused owner tests, `pnpm check:ci`, and `pnpm --filter samebase build:ci` pass.
- The Convex README and Spec 100 list the new folders.
