# Git workspace

Private Samebase package for GitHub file editing and collaborative text editing. It contains one
Convex component, server operations, and React bindings for CodeMirror and Monaco. Samebase consumes
the TypeScript source directly. There is no separate release or build step.

## Ownership

| Package                                                               | Host app                                                  |
| --------------------------------------------------------------------- | --------------------------------------------------------- |
| Staged files, edit versions, and update history                       | Login, repository access, and write permissions           |
| Branch heads and file trees, file content caches, and refresh control | Repository identity, provisioning, and deletion authority |
| File loading, commit/rebase, draft branch and PR operations           | GitHub credentials and authorized entry points            |
| CodeMirror collaboration and Monaco edit binding                      | Editor appearance, language services, and routes          |
| References to binary data and conditional acknowledgement             | Binary bytes, upload URLs, and guarded storage deletion   |

The component has no access to app tables. Repository IDs, actor IDs, and host storage keys are
opaque strings inside it. Staged file IDs belong to the component and remain strings in the app. An
operation addressed by staged file ID also checks its repository and branch.

## Stored state

| Component table       | Record scope                               | Purpose                                                                                                              |
| --------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `stagedFiles`         | Repository, branch, and file path          | Current and original file contents, rename/delete state, base revision, binary references, and collaboration version |
| `fileUpdates`         | Repository, branch, file path, and version | Text changes used to synchronize editors                                                                             |
| `branchTrees`         | Repository and branch                      | Last observed GitHub commit and its exact file tree                                                                  |
| `fileBlobs`           | Git blob SHA                               | Cached text or a reference to binary bytes in host storage                                                           |
| `repositorySyncState` | Repository                                 | Refresh claim, last failure, and shared GitHub request cooldown                                                      |

GitHub remains the source for branch existence, commits, and pull requests. Cached branch state must
not replace a staged file's original content or base revision. A deleted remote branch must not
erase unpublished edits. Refresh claims remain repository-wide, and commit-status checks use the
same cooldown as tree refresh.

## Backend

Mount the component in the app's `convex.config.ts`:

```ts
import gitWorkspace from "@samebase/git-workspace/convex.config";

app.use(gitWorkspace);
```

The app calls `components.gitWorkspace.staging`, `collaborative`, `branches`, and `blobs` from its
own Convex functions. Public wrappers must authorize access before each component call. The
component does not expose an authenticated browser API by itself.

`@samebase/git-workspace/model` exports the boundary validators and inferred types.
`@samebase/git-workspace/stagingChanges` exports file-change classification helpers.
`@samebase/git-workspace/github` exports GitHub commit and rebase functions that take an
authenticated Octokit client from the host. Component functions use their own generated server and
database types.

`@samebase/git-workspace/operations` owns file opening, upload staging, rename, pull, rebase,
commit, and draft pull request creation. `reads` owns cached file and media reads.
`repositoryRefresh` owns branch-tree refresh sequencing. These are server entry points. Their typed
contexts receive the component reference, the authorized repository, an Octokit client or lazy
credential loader, and the host mutation references needed to check repository state and manage root
storage. Import the editor hooks and pure model helpers directly in the frontend.

File initialization returns an existing staged row without overwriting it. Commit acknowledgement
checks the saved snapshot so edits made during a GitHub request remain staged.

When a component mutation removes or replaces a binary reference, it returns released host storage
keys. The host must check both staging and blob-cache references in the component before it deletes
bytes. These checks and deletion run inside the same host mutation as the component call. Repository
cleanup follows the same rule.

The current host's pending-upload cleanup is staff-only. It checks that no staged file or cached
blob uses the storage ID, but it does not check who uploaded it. A caller who knows another pending
upload ID can delete that upload before it is attached. Add upload ownership before granting this
operation to a wider set of users. This extraction does not add an upload registry or sweeper.

## Editors

Use `useCodeMirrorCollaboration` from `@samebase/git-workspace/codemirror` or
`useMonacoCollaboration` from `@samebase/git-workspace/monaco`. Each hook accepts the host's typed
`pullUpdates` and `pushUpdates` references, file scope, initial document state, and page-leave
guard. The hooks use the host's Convex React provider.

The CodeMirror hook returns extensions and a sync error. The Monaco hook returns an `onMount`
binding and a sync error. The app owns the editor surface and decides how to show errors. Mount a
new editor when its repository, branch, or file path changes. Keep the API-reference object and the
page-leave guard callback stable so the CodeMirror extensions do not rebuild during a render.

Both editors use CodeMirror operational transformation. They preserve CRLF bytes and share internal
final-flush code. This extraction does not add offline storage or a cursor-presence system.

## Development

Run `pnpm run dev --once` from the repository root to prepare a linked worktree. Run Convex codegen
from the host app after component API changes. It generates both the component and host bindings.

`pnpm --filter @samebase/git-workspace check` checks package types, lint, and unit tests. Host
Convex tests use `register` from `@samebase/git-workspace/test` to install the component into
`convex-test`. Existing editor interaction tests exercise the package through the Samebase editor
surfaces.

The [live editor check](../../research/2026-10-26-git-workspace-live-editor-check.md#browser-matrix)
records completed browser checks and their coverage limits. Production uses the one-time cutover
below.

## Deployment

The owner is the only person using file editing. The app grants file access to staff accounts, not
ordinary members. This allows a short break in editing during the normal deployment.

The component starts with empty staging, edit-history, and cache tables. Repository content remains
on GitHub. Old staging rows are not copied into the component, so save wanted edits to GitHub first.
Branch trees and file caches are fetched again. This package needs no data migration or
compatibility path for this cutover.

1. Stop MCP and agent operations that edit through Samebase. Push all wanted changes on every edited
   repository and branch, including new files, renamed files, and images. Wait for pushes and
   uploads to finish.
2. Close all Samebase editor tabs and wait for any active rebase or other editor action to finish.
3. Confirm that repository rows have none of the removed refresh fields: `treeRefreshStartedAt`,
   `lastTreeRefreshFailedAt`, `treeRefreshFailureKind`, `treeRefreshFailureMessage`, and
   `treeRefreshCooldownUntil`. Follow the production-read procedure below. These fields were absent
   from all 41 production repositories at `2026-10-26T10:38:12.724Z`. Repeat the check after editing
   stops because a later failed request can set them again. If any remain, clear that obsolete
   operational state before changing the repository schema. Do not copy it into the component.
4. Deploy the component and host app through the normal deployment flow.
5. Open a fresh editor tab. Check that a file opens, an edit saves, push succeeds, and reload
   retains the result. Editing resumes with fresh collaboration history.

A database pause, separate rehearsal, and pre-deployment table purge are not required for this
one-user cutover. Convex
[validates only tables listed in the schema](https://docs.convex.dev/database/schemas#schema-validation),
so the ignored old tables do not block deployment. Wanted edits that remain only in old staging, or
editor actions still running at deployment, must be resolved before the switch.

After the editor check, perform one-time cleanup:

- Follow the [production-read procedure](../../docs/convex-production-reads.md) when selecting the
  deployment. Record `storageId` values from old staging and blob-cache rows before removing them.
- Remove the unused root tables `repositoryStagedFiles`, `repositoryStagedFileUpdates`,
  `observations_repository_branchTrees`, and `observations_repositoryFiles_blobs`. Cancel any
  remaining scheduled `fileStaging:deleteCollaborativeUpdatesBatch` and
  `fileStaging:deleteCollaborativeUpdatesForFilePathBatch` calls.
- Delete recorded binary bytes only if neither component staging nor its blob cache references them.
  The host's `deletePendingUploadBlob` already checks both. Keep referenced bytes and do not clear
  unrelated root storage.

Cleanup does not move data and does not require a compatibility layer. This procedure is documented;
the production switch and cleanup have not been performed.
