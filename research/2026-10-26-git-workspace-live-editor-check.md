# Git editor live editor check

Date: 2026-10-26. This records browser acceptance checks for the private `@samebase/git-editor`
extraction and the fixes made during those checks.

## First run

The worktree app ran at [localhost:5176](http://localhost:5176), with a local Convex backend and a
real temporary GitHub repository, `samebase-live-tests/tmp-git-workspace-package-editor-check`. No
public tunnel URL was recorded. Two browser tabs used the same signed-in account. Monaco and
CodeMirror edits went through the app's public functions and the extracted component. Saved
component content and GitHub file reads were used to check bytes that browser text rendering cannot
show. After the checks, the test browser was closed and the development server was stopped. No local
preview is running.

This is a bounded acceptance run. It does not cover a forced Git ref retry, update-history
compaction beyond 200 updates, many simultaneous users, large files, mobile behavior, offline
recovery, or cross-account and cross-organization authorization. Unit-test results are not used as
acceptance evidence here. A separate fresh browser context checked the signed-out route only.

## Browser matrix

| Scenario                                                     | Result                        | Observed result                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------ | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LF text, Monaco and CodeMirror                               | Passed                        | Both clients' markers reached the shared document. Saved text contained `// client B`, both original declarations, and `// client A` in the expected order.                                                                                                                                                            |
| CRLF text, Monaco and CodeMirror                             | Passed after fix              | Both clients edited `code-crlf.ts`. Monaco's rows, sorted by screen position, matched CodeMirror's lines. Push reached **All Synced**. GitHub retained CRLF endings and both clients' edits.                                                                                                                           |
| CRLF line-end insertion                                      | Passed after fix              | Typing `!`, Enter, and `New CRLF line` in Markdown saved `Alpha!\r\nNew CRLF line\r\nBeta\r\n`. The GitHub read matched.                                                                                                                                                                                               |
| Undo, redo, and reload                                       | Passed                        | Undo removed the new CRLF line. Redo restored it. Reloading the other tab showed the restored line, and push retained the exact CRLF bytes.                                                                                                                                                                            |
| Immediate push after editing                                 | Passed for the observed order | The first push after rename left the later `EDIT_AFTER_RENAME` edit staged. The push control remained available. A second push reached **All Synced** and retained that edit.                                                                                                                                          |
| Edit from another client during push                         | Passed for the observed race  | The browser first observed **Pushing...**, then the other client added `// EDIT_DURING_PUSH`. GitHub received the resolved content without the new marker. The marker remained staged with that first commit as its base. A second push reached **All Synced**; reload retained the marker.                            |
| Rename and continue editing                                  | Passed                        | `notes-lf.md` became `notes-renamed.md`. Editing continued after rename. After push and reload, the route and GitHub path used the new name and the content retained both test markers.                                                                                                                                |
| Delete while another client has a pending edit, then restore | Passed after fix              | Before the fix, the deleted row lost the pending marker. After the fix, the deleted row retained `PENDING_DELETE_AFTER_FIX` at version 1. **Revert deletion** restored the marker in the editor.                                                                                                                       |
| Upload a new binary file                                     | Passed after fix              | The upload dialog accepted the file and push reached **All Synced**. The provider blob hash matched the local 158-byte source: `80b7966d37b7eb1fb31a85b2eaf9c8b365d4f4ab`.                                                                                                                                             |
| Replace and reset a binary file                              | Passed after fix              | Replacement enabled push. Reset returned the preview to width 32. A later replacement, push, and reload produced a loaded preview with natural width 512. GitHub reported 1,947 bytes and blob SHA `1e15c54059102b141fc8d5fed2ed0382c4f48efb`, equal to the local replacement file.                                    |
| New file and draft pull request                              | Passed for creation           | The UI created `created-in-editor.md`, accepted its text, moved to `draft/created-in-editor-mvoiif1l`, showed pull request 1, and reached **All Synced**. The separate GitHub browser tab lacked access; it is not evidence of a reviewed PR page.                                                                     |
| Mixed LF and lone-CR insertion                               | Passed on a fresh fixture     | From `a\nb\rc`, Enter and `X` before `c` saved `a\nb\r\r\nXc` at version 2. Both the editor and a fresh reload showed four lines: `a`, `b`, empty, `Xc`.                                                                                                                                                               |
| Mixed-line deletion                                          | Passed on a fresh fixture     | The deletion case saved `a\r\r\nc` at version 1. The editor showed three lines: `a`, empty, `c`. The two logical breaks did not merge into one CRLF.                                                                                                                                                                   |
| Branch isolation                                             | Passed                        | GitHub reads showed `// DRAFT_ONLY` only on `draft/created-in-editor-mvoiif1l`. Main contained `UPSTREAM_ALPHA` and the original beta value, with no draft marker. The main-branch editor also stayed unchanged during the draft edit.                                                                                 |
| Upstream conflict handling                                   | Passed after fix              | Push rejected the conflict and preserved local and GitHub content. **Rebase onto latest GitHub** then saved both versions with conflict markers and the latest GitHub content as the new base. A manual resolution combined `UPSTREAM_ALPHA` with `LOCAL_BETA`; the first GitHub read matched that resolution.         |
| Signed-out editor route                                      | Passed                        | A fresh browser context redirected to sign-in and showed zero Monaco or CodeMirror editors. This does not test access between signed-in accounts or organizations.                                                                                                                                                     |
| Temporary repository cleanup                                 | Passed                        | All three provider deletion options were selected in the dashboard. The workflow completed the Cloudflare, Convex, and GitHub steps and finished with state `succeeded` and a scrubbed snapshot. The repository row was absent, GitHub returned 404, and component counts were zero for staged files and file updates. |

## Expanded component checks

The second run used `samebase-live-tests/tmp-git-workspace-package-expanded-check`. It checked the
five-table component after branch trees, blob caches, refresh state, Git operations, and file/media
reads moved into the package. The same two editor clients used the actual app and GitHub.

| Scenario                                               | Result                        | Observed result                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Empty component caches on an existing local repository | Passed                        | Branch trees, blobs, and sync state started at zero. Opening an existing file loaded the right text and populated the new caches.                                                                                                                                                 |
| Shared CRLF editing                                    | Passed                        | Monaco and CodeMirror markers appeared in both clients. The saved component text and GitHub content retained CRLF bytes.                                                                                                                                                          |
| Edit during push                                       | Passed for the observed order | After **Pushing...** appeared, the other client inserted `EXPANDED_DURING_PUSH`. The first commit excluded it. Staging retained it against the first commit, and the second push and reload retained it.                                                                          |
| Rename, edit, delete, and restore                      | Passed after fix              | Compare mode showed the deletion at the original path. Restore initially failed with `File already exists in staging`. The caller now locates the existing renamed row. The renamed path and `RENAMED_CONTENT` survived push and reload, and the GitHub read matched.             |
| Restore navigation with another changed file           | Passed after fix              | Compare auto-selection could move to the image while restore finished. The restore handler now keeps that selection update paused until navigation completes. A fresh replay opened `restored.md`, removed compare/diff, and kept `RENAMED_CONTENT` with the image still staged.  |
| Binary upload and draft commit                         | Passed                        | The original image had 158 bytes and SHA `80b7966d37b7eb1fb31a85b2eaf9c8b365d4f4ab`. The draft received the 1,947-byte replacement with SHA `1e15c54059102b141fc8d5fed2ed0382c4f48efb`, and its preview loaded at width 512.                                                      |
| Image replacement and reset in two open tabs           | Passed after fix              | The mounted preview initially kept the old image after replacement. Its query now includes the staged content identity or Git blob SHA. Both tabs changed from width 32 to 512 on replacement, then from 512 to 32 on reset, with no reload.                                      |
| Failed draft with staged text and binary               | Passed                        | An upstream text conflict rejected the draft commit. GitHub had only `main` and no PR. No temporary draft staging remained. Source text and the staged binary reference remained available.                                                                                       |
| Rebase, resolution, and draft retry                    | Passed                        | The editor showed conflict markers. A manual resolution saved `UPSTREAM_ALPHA` and `LOCAL_BETA`. Draft creation then reached **All Synced**. GitHub confirmed those bytes on the draft branch, while main retained its upstream-only text and original image.                     |
| Deleted remote branch                                  | Passed                        | Pull removed the unchanged staged file and kept the changed file with its original base. The open editor still showed `DELETED_BRANCH_KEEP`. GitHub did not recreate the branch. The branch PR lookup showed an error because the branch no longer existed.                       |
| Signed-out access after extraction                     | Passed                        | A fresh browser context showed sign-in and zero CodeMirror or Monaco editors.                                                                                                                                                                                                     |
| Expanded component and provider cleanup                | Passed                        | The dashboard removal flow deleted GitHub, Convex, and Cloudflare resources. The workflow succeeded with a scrubbed snapshot. The root repository row was absent, GitHub returned 404, all five component table counts were zero, and all three recorded storage IDs were absent. |

Two additional checks used real local Convex backends, with no provider calls:

- A binary initialization replay kept an existing replacement, deletion, and rename unchanged. A
  stale tree did not replace the fetched blob SHA as the new file's base. The stale-tree case had no
  changed files. Probe records and binary bytes were removed afterward.
- Blob-cache publication returned the existing winning blob on a duplicate save and removed the
  unused incoming bytes. Publication after repository deletion began returned no row and removed the
  late bytes. The winning bytes remained available. Probe records were removed afterward.

These mutation replays check server behavior. They are separate from the browser acceptance run and
are not described as simultaneous browser races.

Claude Opus 5.5 reviewed the expanded boundary and supplied a source review. That review found the
late binary-open overwrite, stale binary base, and caller-selected deletion SHA. The first two now
use a non-replacing initializer with the exact fetched SHA. New deletion snapshots now verify the
SHA against the component's repository and branch tree before reading the shared blob cache.
Existing staged files retain their base and can be deleted without a cached branch tree.

The review also identified the existing staff-only pending-upload ownership limit. The package
README records that limit. No upload registry, sweeper, or generic provider framework was added.

The three delegated lanes covered component state, Git operations, and reads/frontend integration in
separate worktrees. The main worktree integrated their commits and performed the browser run.

The expanded run is supported by `expanded-cold-cache-check.log`, `expanded-two-editors-saved.json`,
`expanded-first-push-github.json`, `expanded-first-push-staged.json`,
`expanded-second-push-reload.log`, `expanded-restored-push-reload.log`,
`expanded-binary-refresh-fixed.log`, `expanded-restore-navigation-fixed.log`,
`expanded-signed-out.log`, `expanded-draft-rollback.log`, `expanded-rollback-staging.json`,
`expanded-rebase.log`, `expanded-resolved-saved.json`, `expanded-draft-github-text.json`,
`expanded-main-github-text.json`, `expanded-draft-github-binary.json`,
`expanded-deleted-branch-after-pull.json`, `expanded-draft-media-deleted-final.log`,
`binary-initializer-live.json`, and `state-storage-live-result.json` in the ignored scratchpad.
Cleanup evidence is in `expanded-cleanup-before.json`, `expanded-cleanup-submitted.log`,
`expanded-cleanup-run.json`, `expanded-cleanup-component.json`, `expanded-cleanup-storage.json`, and
`expanded-cleanup-github.log`. The test browser and local development processes were stopped after
cleanup.

## Storage and GitHub boundary checks

The next change moved binary bytes into the component, added shared GitHub request backoff in the
app, and moved PR and check requests into package server functions. Fable reviewed the ownership
split. After a follow-up challenge, it agreed that provider backoff must use the GitHub principal
rather than the repository. GitHub documents separate
[installation and user limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api#primary-rate-limit-for-github-app-installations)
and a separate
[GraphQL limit](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api#primary-rate-limit).
Repository refresh claims and failures remain in the component. The app keeps provider credentials
and dashboard composition. No extra package, component, request scheduler, or upload registry was
added.

Three new isolated agent worktrees implemented storage, provider backoff, and PR/CI reads. The main
worktree integrated their commits. Opus 5.5 reviewed the source. Its actionable finding was a clock
check inside a cached Convex query. The query now returns the stored deadline, and the action checks
whether it has expired. A separate local replay proved recovery after expiry without a database
write. The constructors return new clients, so no hook-deduplication marker was needed. Inspection
of the full binary initializer rejected a speculative missing-cleanup finding: its other success
path stores the reference, and its collision path throws as before.

The combined app used `samebase-live-tests/tmp-git-workspace-package-boundary-check` for another
real-browser run. These checks are additional acceptance evidence:

| Check                               | Result                                                                                                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Shared text editing                 | Monaco and CodeMirror each added a marker. Both saw both edits. Push and reload retained them, and GitHub held CRLF line endings.                                                                |
| Component upload and push           | The browser uploaded a 32-pixel image and pushed it. Both open tabs displayed it. The component had the 158-byte storage record; root storage remained empty.                                    |
| Replacement and reset               | Both open tabs changed to the 512-pixel replacement, then returned to the 32-pixel original on reset, without reload.                                                                            |
| Draft rollback                      | An upstream text conflict blocked a draft containing text and an image. GitHub had only `main` afterward. Component staging retained both source files, and the image still loaded at width 512. |
| Conflict resolution and draft retry | The editor showed conflict markers. After manual resolution, it created a draft PR. GitHub held the 1,947-byte replacement image on the draft and the 158-byte original on `main`.               |
| Provider cooldown in the editor     | A short local cooldown showed `Checks paused`. Checks resumed automatically after expiry. This used a local state fixture, not real GitHub quota exhaustion.                                     |

The browser then found a remaining UI dependency: `RepositorySyncStatus` removed the CI view while
tree refresh was paused. The fix keeps the CI view mounted beside the tree status. A fresh browser
load showed three checks and the existing PR link while a two-minute tree-refresh pause was still
active. Provider backoff remained empty. This check used the final combined app after rebase onto
the current main branch.

The dashboard removal flow then deleted the temporary GitHub, Convex, and Cloudflare resources. The
deletion workflow succeeded, the root repository row was absent, and GitHub returned 404. All five
component tables and component file storage were empty. Root storage remained empty, and the local
backoff fixture was removed. The test browser was closed.

Two local backend probes checked the new boundaries directly:

- Actual upload URLs and HTTP downloads preserved bytes in component storage. Duplicate uploads
  selected the existing cache row and deleted the unused bytes. A second repository's staging kept
  shared bytes alive until its final reference was removed. Component reads and deletion rejected
  root-storage IDs and left the root bytes intact. All probe data was removed.
- Separate actions with fresh GitHub clients shared one persisted cooldown. A second repository
  under the same installation made no HTTP request. GraphQL and other installation/user principals
  still proceeded. A third action proceeded after expiry with the same unchanged deadline row. The
  transport was an injected fixture; it made no external provider calls. The probe record and
  temporary source were removed.

App and package type checks, affected lint and formatting, and focused existing tests passed. These
checks supplement the browser run. CI/status reads still use their existing first page. Raw GitHub
clients outside the shared access resolvers keep their current behavior. Upload attachment and
cleanup still require an ownership model before wider user access, as documented in the package
README.

Evidence is in the ignored `scratchpad/git-workspace` directory:
`component-storage-live-result.json`, `github-backoff-live.json`, `boundary-two-editors.log`,
`boundary-pushed-text.json`, `boundary-binary-push.log`, `boundary-binary-replace-reset.log`,
`boundary-rollback-staging.json`, `boundary-rollback-branches.json`,
`boundary-rollback-retained.log`, `boundary-rebase.log`, `boundary-draft-success.log`,
`boundary-created-pr.json`, `boundary-draft-binary.json`, `boundary-main-binary.json`,
`boundary-checks-paused.log`, `boundary-checks-recovered.log`, and
`boundary-tree-failure-independent-checks.log`. Cleanup evidence is in
`boundary-cleanup-submitted.log`, `boundary-cleanup-run.json`, `boundary-cleanup-component.json`,
and `boundary-cleanup-github.json`.

## Bugs found in the first run

1. **CRLF positions:** a line-end insertion could split a CRLF pair. The saved row contained
   `Alpha\r!\n`. The fix maps CodeMirror's logical positions to raw string positions and preserves
   unchanged line endings. Fresh CRLF typing, shared editing, reload, and GitHub reads passed.
2. **Mixed-line splice fusion:** joining a slice ending in lone CR to one starting with LF could
   reduce two logical line breaks to one. The fix preserves separate breaks at that boundary. Fresh
   insertion and deletion fixtures passed with the saved bytes listed above.
3. **Deletion final flush:** rejecting collaboration updates after deletion lost an edit that was
   still pending in another client. The fix lets that final update reach the deleted row while
   retaining its deleted state. The restore check recovered the marker.
4. **Existing upload event bug:** the upload trigger passed its click event as a folder argument.
   The callback now passes no event argument. The browser file chooser, upload dialog, and push then
   completed.
5. **Existing binary change predicate:** text-only change detection could omit a changed binary from
   the file view's actions. The view now uses the shared staged-file change predicate. Replace,
   reset, push, preview, and provider-hash checks then completed.
6. **Existing conflict error parser:** the parser required the conflict prefix at the start of the
   error, so the Convex error envelope hid the resolution controls. It now finds the prefix inside
   the envelope and reads paths from that error line only. The live rebase, manual resolution, and
   push flow then completed.

## Package name check

The package is now `@samebase/git-editor`, and the component mount is `gitEditor`. The rename
updated imports, generated references, test registration, package commands, and repository cleanup.
The integration worktree and this report keep their existing paths.

A fresh browser check used `samebase-live-tests/tmp-git-workspace-package-rename-check`:

- Monaco and CodeMirror exchanged edits in `vite.config.ts`. Push and reload retained both edits,
  and the GitHub file contained both markers.
- A 32-pixel PNG uploaded through the browser, reached GitHub as 158 bytes, and loaded after reload.
  The bytes appeared in `gitEditor` storage. Root storage remained empty.
- Dashboard removal deleted the temporary GitHub repository, Convex project, and Cloudflare Worker.
  The deletion run succeeded. All five component tables and component storage were empty afterward.
- Package and app type checks and lint passed. Existing package tests passed 50 checks, the host
  staging suite passed 20, and the branch-cache suite passed four.

The initial CodeMirror selector searched for text outside its rendered area. Scrolling to the end
resolved that check. Cleanup first waited for the wrong destination URL; the app correctly returned
to `/repo`. The backend deletion result and empty component tables confirmed cleanup. The browser
also logged Monaco TypeScript worker `DataCloneError` messages and failed external type-package
lookups while opening the starter's Vite configuration. These checks establish editing and storage
behavior, not language-service diagnostics. Raw evidence uses the `rename-` prefix in the existing
ignored evidence directory.

## Evidence and exclusions

Raw run files remain in the ignored `scratchpad/git-workspace` directory. The durable observations
above come from the browser logs and these saved results: `live-saved-files.json`,
`crlf-end-saved.json`, `crlf-after-fix-saved.json`, `delete-pending-before-saved.json`,
`delete-pending-after-saved.json`, `live-github-text-evidence.jsonl`, `binary-github-final.json`,
`mixed-insert-verified-saved.json`, `mixed-fixed-delete-saved.json`,
`branch-isolation-github.jsonl`, `browser-signed-out-check.log`, `upstream-rebased-saved.json`,
`during-push-first-github.json`, and `during-push-staged.json`. The final reload was recorded in
`browser-edit-during-push-final.log`. Cleanup was checked with `browser-cleanup-options.log`,
`cleanup-final-run.json`, `cleanup-provider-events.json`, `cleanup-github-status.log`, and
`cleanup-component-rows.json`. User IDs and credentials are not included in this report.

Some attempts used stale selectors, reached a loading page, or read Monaco's DOM order instead of
its visible line order. These attempts are not product failures or passed acceptance checks. A
temporary missing-module reload also caused an image wait to time out; the later width-512 result is
the completed check.

The backend watcher initially did not load a helper-only edit for mixed-line handling. The helper
was moved into the component, function readiness was checked, and fresh fixtures were used for the
two passed cases. An earlier route attempt redirected to README because the tree cache was stale;
its accidental temporary edits were reset. That attempt is excluded from mixed-line acceptance.

The first cleanup observation returned `removed: false` while the workflow was queued. The final
succeeded run and zero-row checks establish completion. Stale browser tab titles are not used as
repository-existence evidence.

## Summary

The completed checks cover shared LF and CRLF editing, edit preservation, rename, delete and
restore, binary upload and replacement, and draft creation. Fresh mixed-line checks also pass.
Branch isolation, the signed-out route, and upstream conflict resolution pass. An edit made while
**Pushing...** was visible remained staged against the first commit and survived the second push and
reload. The temporary repository, its requested provider resources, and its component rows were
removed through the dashboard workflow. All listed acceptance checks have completed; the scope
limits above still apply. No local preview is running. Production has not been changed. The owner
confirmed that they are the only editor user; the simplified deployment procedure is in the
[package README](../packages/git-editor/README.md#deployment).

The expanded five-table component also passed fresh cache initialization, shared CRLF editing,
edit-during-push, draft rollback and retry, branch isolation, deleted-branch edit retention, and
cleanup of all component rows and binary references. The final UI checks confirmed restored-file
navigation and live image replacement/reset in both clients. The package and app checks passed.
