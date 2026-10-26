# Git workspace

Private Samebase package for staged Git files and collaborative text editing. It contains one Convex
component and React bindings for CodeMirror and Monaco. Samebase consumes the TypeScript source
directly. There is no separate release or build step.

## Ownership

| Package                                                                     | Host app                                                       |
| --------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Staged files, edit versions, and update history                             | Login, repository access, and write permissions                |
| File changes, GitHub commit/rebase helpers, and conditional acknowledgement | GitHub credentials, action orchestration, and cache updates    |
| CodeMirror collaboration and Monaco edit binding                            | Editor appearance, language services, routes, and file loading |
| References to binary data                                                   | Binary bytes, upload URLs, blob cache, and storage deletion    |

The component has no access to app tables. Repository IDs, actor IDs, and host storage keys are
opaque strings inside it. Staged file IDs belong to the component and remain strings in the app. An
operation addressed by staged file ID also checks its repository and branch.

## Backend

Mount the component in the app's `convex.config.ts`:

```ts
import gitWorkspace from "@samebase/git-workspace/convex.config";

app.use(gitWorkspace);
```

The app calls `components.gitWorkspace.staging` and `components.gitWorkspace.collaborative` from its
own Convex functions. Public wrappers must authorize access before each component call. The
component does not expose an authenticated browser API by itself.

`@samebase/git-workspace/model` exports the boundary validators and inferred types.
`@samebase/git-workspace/stagingChanges` exports file-change classification helpers.
`@samebase/git-workspace/github` exports GitHub commit and rebase functions that take an
authenticated Octokit client from the host. Component functions use their own generated server and
database types.

File initialization returns an existing staged row without overwriting it. Commit acknowledgement
checks the saved snapshot so edits made during a GitHub request remain staged.

When a component mutation removes or replaces a binary reference, it returns released host storage
keys. The host must check remaining component references and its own blob-cache references before it
deletes bytes. These checks and deletion run inside the same host mutation as the component call.
Repository cleanup follows the same rule.

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
records completed browser checks and their coverage limits. Its temporary repository cleanup does
not replace the production cutover checks below.

## Deployment

The component starts with an empty database namespace. It does not read the former app staging
tables. This package includes no data migration or compatibility path. Production deployment
requires a cutover rehearsal on a disposable deployment and a recorded cleanup check.

The rehearsal must establish how to stop writes, clean old state, deploy the component and host
together, and resume service. Convex [pausing](https://docs.convex.dev/production/pause-deployment)
blocks new function calls while allowing dashboard edits and code pushes. Samebase's
`convex-hosting deploy` also calls component functions to upload assets. Do not assume the normal
deployment command works while paused. The order of asset upload, pause, cleanup, code push, and
resume has not been verified for this cutover.

Before switching production to the component, all of these checks must pass:

- Preserve pending edits, including binary bytes. Take a completed backup with file storage and
  record every old staged `storageId` before deleting its row. Follow the
  [production-read procedure](../../docs/convex-production-reads.md) when selecting the deployment.
- Stop browser and MCP writes, close old editor sessions, and wait for in-progress editor, upload,
  and GitHub actions to finish. No old editor work may run after the code switch. Pausing queues
  scheduled jobs; it does not discard them. Drain or cancel calls to
  `fileStaging:deleteCollaborativeUpdatesBatch` and
  `fileStaging:deleteCollaborativeUpdatesForFilePathBatch`.
- Deliberately clear both root tables, `repositoryStagedFiles` and `repositoryStagedFileUpdates`,
  across every repository and branch. Verify that both contain zero rows. Include unchanged opened
  files and orphan history; a zero changed-file count is insufficient.
- Check each recorded storage ID against all `observations_repositoryFiles_blobs` references. Retain
  referenced bytes. Delete only unreferenced bytes from the recorded set, then verify each ID is
  either absent or retained with a cache reference. The old `clearAllStaging` does not delete these
  bytes. Do not clear all root storage.
- Recheck the empty root tables before the switch. Remove the empty legacy tables after the old
  schema definitions are gone. Confirm the new component starts empty and resume with fresh editor
  sessions.

These are deployment requirements, not completed production checks. Do not deploy this extraction
until the rehearsal and cleanup evidence exist.
