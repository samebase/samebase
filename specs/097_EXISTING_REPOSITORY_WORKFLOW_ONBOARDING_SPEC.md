# Existing Repository Workflow Onboarding Spec

## Document Control

- Status: Accepted and implemented
- Owner: Samebase existing repository onboarding and source setup
- Created: 2026-05-08
- Last updated: 2026-09-03
- Related docs:
  - `specs/096_INITIALIZING_REPOSITORY_GITHUB_PROVISIONING_SPEC.md`
  - `specs/003_REPOSITORY_INFRA_PROVISIONING_SPEC.md`
  - `specs/065_GITHUB_REPOSITORY_PICKER_DISCOVERY_SPEC.md`
  - `specs/120_ORGANIZATION_OWNERSHIP_SPEC.md`
  - `research/2026-05-08-existing-repository-workflow-onboarding.md`

## Summary

Connecting an existing GitHub repository is one user action. The public action verifies the selected
GitHub repository, creates a Samebase repository and provisioning run, and starts a durable
Workflow. The dashboard shows source setup until the repository is ready or the run fails.

Existing repositories do not automatically create Convex projects or Cloudflare Workers. Users can
connect those resources later from the repository dashboard.

## Public Action

`repository.connect` accepts an organization ID and a GitHub repository database ID. It performs
these steps:

1. Require the current user's membership in the selected GitHub-backed organization.
2. Create a GitHub installation client restricted to the selected repository ID.
3. Load the repository from GitHub and verify that its owner matches the organization.
4. Create the initializing Samebase repository and provisioning run in one mutation.
5. Start `connectExistingRepository` Workflow.
6. Return `repositoryId`, `runId`, and `githubRepositoryFullName`.

The first GitHub read confirms the user's selected repository before Samebase creates local state.
The Workflow reads and validates the repository again after the run exists. All durable source setup
events and failures start from that run.

If Workflow startup fails, the action marks the run and initializing repository as failed before it
returns the error.

## Repository State

Existing-repository setup uses `githubMode: "connect_existing_repository"` in provisioning, failed,
and connected states. The relevant fields are:

```ts
type ExistingRepositoryGitHubState =
  | {
      state: "provisioning";
      githubMode: "connect_existing_repository";
      runId: Id<"workflow_repositoryProvisioning_runs">;
      startedAt: number;
      githubRepositoryDatabaseId?: string;
      githubRepositoryName: string;
    }
  | {
      state: "failed";
      githubMode: "connect_existing_repository";
      runId: Id<"workflow_repositoryProvisioning_runs">;
      failedAt: number;
      githubRepositoryDatabaseId?: string;
      githubRepositoryName: string;
    }
  | {
      state: "connected";
      githubMode: "connect_existing_repository";
      runId: Id<"workflow_repositoryProvisioning_runs">;
      githubRepositoryDatabaseId: string;
      githubRepositoryName: string;
      visibility: "private" | "public";
      defaultBranch: string;
      connectedAt: number;
    };
```

Each complete repository row also has `organizationId`, `deletion`, and `createdAt`. The
organization stores the current GitHub owner login. The repository does not duplicate that owner
login.

Connected GitHub identity is immutable. Samebase must not change one connected repository to a
different `githubRepositoryDatabaseId`.

## Workflow

The `connectExistingRepository` Workflow uses these steps:

1. `fetch_github_repository`: load the selected repository, verify its database ID and owner,
   require a default branch, verify that branch is readable, and record the canonical name and
   visibility.
2. `connect_github_repository`: write the connected GitHub identity to the Samebase repository.
3. `sync_tree`: read the default branch and write its recursive tree to
   `observations_repository_branchTrees`.
4. `finish`: mark the run as succeeded.

Current user-visible event text is:

1. `fetch_github_repository`: "Checking existing GitHub repository." and "Checked existing GitHub
   repository <owner>/<repository>."
2. `connect_github_repository`: "Connecting the Samebase repository to GitHub." and "Connected the
   Samebase repository to GitHub."
3. `sync_tree`: "Syncing the default branch tree." and "Synced the default branch tree."
4. `finish`: "Connected existing repository."

The GitHub fetch and connection steps do not use automatic Workflow retry. Tree synchronization is
idempotent and uses the standard provider-step retry policy.

## Failure Handling

A failure before `connect_github_repository` completes moves the repository to `state: "failed"` and
keeps the failed run ID. The user-safe reason comes from provisioning events. It is not copied to a
repository field.

A failure after GitHub connection keeps the repository in `state: "connected"`. The failed run and
events describe the source setup failure. This preserves confirmed GitHub identity while tree-based
features remain unavailable until the required branch tree exists.

## Duplicate And Authorization Rules

1. A user must be a current member of the selected organization.
2. The selected GitHub repository owner ID must match the organization's GitHub owner ID.
3. Another active Samebase repository in the organization cannot use the same normalized GitHub
   repository name.
4. A GitHub repository database ID cannot belong to two connected Samebase repositories.
5. A Workflow continuation must match its repository, run, user, and repository deletion gate.

## Provider Boundary

Existing-repository onboarding creates no managed provider plan and no Convex or Cloudflare
attachment. The repository dashboard exposes the standard `?add-convex` and `?add-cloudflare`
actions after GitHub connects.

## User Interface

`/org/:owner/connect-repo` lists accessible GitHub repositories that are not already connected to
Samebase. When the user selects Connect, the page disables that action while it is pending. After
the action returns, it opens the repository dashboard.

The dashboard shows the repository and its source setup from the provisioning run and events. File,
staging, editor, and tree-dependent actions require connected GitHub state and the requested branch
tree. A failed repository stays visible so the user can inspect the failure or use Remove from
Samebase before another connection attempt.

A direct file route that offers connection also opens the repository dashboard after the action
returns. It does not render a blank file workspace while source setup is pending.

## Validation

Backend coverage must prove:

1. The selected GitHub repository and owner are verified.
2. The Samebase repository and run are created before Workflow work starts.
3. The run uses trigger `connect_existing_repository`.
4. Successful connection stores `runId`, `githubRepositoryDatabaseId`, canonical
   `githubRepositoryName`, visibility, and default branch.
5. A failure before connection writes failed state.
6. A tree-sync failure after connection preserves connected GitHub identity.
7. Duplicate names and duplicate GitHub repository IDs fail closed.
8. The flow creates no Convex or Cloudflare resources.

Frontend coverage must prove:

1. The connect action is disabled only while its request is pending.
2. A successful request opens the repository dashboard.
3. The dashboard shows running and failed source setup with event-derived text.
4. Tree-dependent controls stay unavailable until the requested tree exists.
5. A direct file-route connection opens the dashboard instead of a blank file route.

## Acceptance Criteria

1. Existing repository connection is one user action.
2. The selected GitHub repository and organization owner are verified before local creation.
3. Durable source setup starts from a Samebase repository and provisioning run.
4. Connected state stores immutable GitHub repository identity and the establishing run.
5. A post-connection tree failure does not erase connected GitHub identity.
6. Existing-repository onboarding does not provision Convex or Cloudflare resources.
7. Source setup is visible from the repository dashboard.
