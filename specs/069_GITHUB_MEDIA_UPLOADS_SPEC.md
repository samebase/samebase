# 069 GitHub Media Uploads Spec

## Document Control

- Status: Accepted
- Owner: Samebase frontend/editor + GitHub integration
- Last updated: 2026-03-25
- Depends on:
  - `apps/samebase/src/components/FileView.tsx`
  - `apps/samebase/src/components/RepositoryMediaViewer.tsx`
  - `apps/samebase/src/components/vault-dashboard/VaultDashboard.tsx`
  - `apps/samebase/src/components/AddRepository.tsx`
  - `apps/samebase/shared/repositoryMedia.ts`
  - `apps/samebase/convex/fileStaging.ts`
  - `apps/samebase/convex/fileStagingActions.ts`
  - `apps/samebase/convex/github.ts`
  - `apps/samebase/convex/gitOperations.ts`
  - `apps/samebase/convex/schema.ts`

## Why

Samebase should be a better place than Telegram Saved Messages for dropping images and project
assets that belong with the repo.

Today, if a user wants to quickly save screenshots, logos, reference images, or other media while
working on a project, Telegram Saved Messages is often the faster capture surface than Samebase.
That is a product failure. Those files end up outside the repository, outside the editor, outside
the staging flow, and outside the durable project context that Samebase is supposed to own.

Media uploads fix a real product gap:

- project assets should land next to the code and docs they belong to
- uploads should be visible in the same file tree and commit flow as the rest of the repository
- the user should not need a sidecar personal inbox just to get files into the project
- Samebase should be the canonical working surface for collecting and committing repo assets

This is not decorative polish. It is part of making Samebase credible as the place where the project
actually lives.

## Summary

Samebase should support media uploads by adding a bottom-of-sidebar upload surface on vault routes
first. The shipped CTA should read `Drop file or click` and use rectangular app chrome with a
segmented or dashed border.

That surface must be mobile-friendly, not desktop-only. On touch devices, the primary path is
tap-to-pick rather than drag-and-drop. Phase 1 should also let the user confirm or change the
destination folder before the upload is staged so images can land in a specific repository folder
instead of relying only on the current-file heuristic.

For the ASAP slice, the final source of truth should remain the GitHub repository. Convex storage
should only be used as temporary staging and preview cache so the browser can upload bytes safely
and the app can render uncommitted media before commit. No Cloudflare storage or asset delivery is
required for this phase.

Phase 1 should be image-only: `png`, `jpg`, `jpeg`, `gif`, `webp`, `svg`, and `avif`. That matches
the current renderable media surface. Generic binary upload without viewer support would still land
users in the existing unresolved storage-backed file path.

## Current State

- `FileView` already uses the shared sidebar shell and has a natural footer slot after the file
  tree.
- `VaultDashboard` now uses the same shell, but its sidebar has no vault or branch target.
- `/add` does not use the shared sidebar shell and has no upload destination context.
- `RepositoryMediaViewer` already renders repository images.
- `blobs` already supports two storage modes: inline text or Convex storage.
- `fileStaging` is text-first. It requires `content` and `initialContent` as strings.
- The commit pipeline assumes text:
  - staged files are modeled as `content: string`
  - upstream reconciliation computes UTF-8 blob SHAs from text
  - commit preview computes line diffs
  - `createTree` currently writes staged file contents inline as text
- Selecting a non-renderable storage-backed file still hits the explicit
  `File is in storage, not implemented yet` path.
- Repository media preview currently falls back to the repository contents API and reports files
  larger than 1 MB as unavailable.

## External Constraints

### Browser

- Browser file access must come from explicit user selection or drag and drop.
- `DataTransfer.files` is only available inside `drop` and `paste` events.
- `FileReader` can read user-provided `File` objects, but it cannot read an arbitrary filesystem
  path.

### GitHub

- `Get repository content` supports full responses for files up to 1 MB.
- For files between 1 MB and 100 MB, the contents API only supports `raw` or `object` media types.
  For the `object` media type, `content` is empty and `encoding` is `none`.
- `Get repository content` does not support files larger than 100 MB.
- Download URLs from the contents API expire and should be treated as one-shot.
- `Create or update file contents` accepts Base64 content, but it is a single-file commit endpoint
  and GitHub explicitly warns that parallel use with delete or other contents writes will conflict.
- `Create a blob` supports both `utf-8` and `base64` encoding.
- `Get a blob` returns Base64 content and supports blobs up to 100 MB.
- `Create a tree` requires either `content` or `sha` for a tree entry, not both.
- GitHub warns when a file exceeds 50 MiB, blocks files larger than 100 MiB, and recommends keeping
  repositories small.

### Convex

- Convex upload URLs are the right fit for browser-originated file uploads larger than normal
  function payloads.
- Convex file storage exposes metadata through the `_storage` system table.
- Convex actions can read staged files back from storage, which lets commit code turn staged bytes
  into GitHub blobs at commit time.

## Product Decisions

### 1. Ship on vault routes first

Ship the upload surface only on `FileView` in phase 1.

Reasons:

- `FileView` already has an active `vaultId`, branch, file tree, and media viewer.
- The sidebar bottom is already visually stable on this route.
- `/add` has no repository target and no shared sidebar shell today.
- The dashboard has shared chrome but still lacks a precise upload destination.

The dashboard can adopt the same component later once the product decides how a global upload target
should be chosen. In phase 1, the dashboard must not expose a live dropzone, and dragging files over
the dashboard should do nothing instead of implying an upload target. `/add` should not show a live
dropzone in phase 1.

### 2. Support images only in phase 1

The current product can already preview images, and `FileView` deliberately avoids trying to open
renderable media in the text editor path.

That makes image upload the fastest safe slice. Uploading videos, audio, PDFs, or arbitrary binaries
would still require at least one of:

- a new viewer surface
- a safe non-preview binary details surface
- a different selection model that does not fall into text staging

Phase 1 accepted types should therefore match `apps/samebase/shared/repositoryMedia.ts`.

### 3. Add a sidebar footer upload surface

Add a dedicated footer component to the file-view sidebar:

- anchored at the bottom of the sidebar, below the file tree
- rectangular chrome, no rounded app surface
- segmented or dashed border
- primary copy: `Drop file or click`
- secondary copy: file type and size rules, for example `Images up to 25 MiB`
- full-width, touch-friendly sizing that stays usable inside the mobile sidebar sheet

Interaction model:

- clicking or tapping opens a hidden `<input type="file">`
- dragging files over the surface highlights the dropzone on devices that support file drag-and-drop
- dropping files queues upload on those devices
- mobile behavior must not depend on hover, drag state, or precision gestures
- the dropzone should stay visible on both desktop and mobile layouts

Initial destination suggestion:

- use the currently selected file's parent folder when a file is selected
- otherwise upload to repository root

Destination control:

- before finalizing the staged upload, let the user change the destination folder explicitly
- drive that control from the current repository tree so uploads can land in a specific existing
  folder
- keep the mobile version simple: a tap-friendly picker or sheet, not a drag-based interaction
- if no explicit override is chosen, use the initial destination suggestion

Conflict behavior:

- if the destination path already exists, require an explicit replace confirmation before staging
- show an inline warning or confirmation state instead of silently overwriting
- do not auto-rename files in phase 1

### 4. Keep GitHub as the source of truth, use Convex storage only as staging

The uploaded file should end up in GitHub, not in a separate asset store.

However, the browser should not send multi-megabyte Base64 strings through the existing text
mutations. The safer flow is:

1. Browser uploads the file to Convex storage using an upload URL.
2. A finalize mutation records staged binary metadata in `fileStaging`.
3. The UI renders the staged image directly from Convex storage.
4. Commit code reads the staged bytes, creates a GitHub blob, inserts that blob into the Git tree,
   and advances the branch.
5. The staged record is cleared after commit, but the committed blob remains cached in `blobs`.

This still satisfies the product requirement that persisted project assets live directly in GitHub.

### 5. Extend `fileStaging` instead of creating a second staging table

The existing file tree, staged-file visibility, rename flow, delete flow, commit flow, and branch
scoping already revolve around `fileStaging`.

Adding a second binary-only staging table would duplicate too much logic.

Use one staging model with a discriminator:

- `kind: "text" | "binary"`
- keep `parentCommitSha` as the authoritative upstream blob SHA
- add binary-only metadata such as:
  - `storageId`
  - `stagedBlobSha`
  - `mime`
  - `size`

Pragmatic migration choice for the ASAP slice:

- keep `content` and `initialContent` in place for text behavior
- allow binary rows to keep those fields empty while `kind` becomes the true source of behavior

That avoids a broad schema rewrite while still giving the code a clean way to branch on binary rows.

### 6. Split text and binary behavior in the commit pipeline

Current commit code is text-only because it:

- computes line diffs
- computes Git blob SHAs from UTF-8 text
- writes new tree entries with inline `content`

Binary commit behavior should instead be:

- for text rows, keep the current flow
- for binary rows:
  - read staged bytes from Convex storage
  - call GitHub `createBlob` with `encoding: "base64"`
  - use the returned blob SHA when building `createTree` entries
  - skip text diff generation
  - use SHA-based conflict detection instead of text rebase

Binary conflict rule for phase 1:

- if the upstream blob SHA still matches `parentCommitSha`, allow commit
- if a new upload targets a path that now exists upstream, report a conflict
- if an existing binary file changed upstream since staging, fail with an explicit conflict and ask
  the user to retry or re-upload

No binary auto-merge is needed in phase 1.

### 7. Make staged image preview work before commit

Today `RepositoryMediaViewer` reads committed repository state. That is not enough for newly
uploaded but uncommitted images.

Extend the viewer path so renderable staged binary rows can supply:

- a storage-backed preview URL
- MIME type
- file name

That lets an uploaded image appear immediately after drop without waiting for a GitHub commit.

### 8. Raise the preview ceiling for committed images

The current preview fallback says files larger than 1 MB are unavailable because it relies on the
repository contents API path.

After this work, committed image preview should prefer:

- cached `blobs` storage when available
- otherwise GitHub `getBlob`, which supports blobs up to 100 MB

That removes the current 1 MB preview ceiling for supported image types.

### 9. Set an app-level limit stricter than GitHub's hard limit

GitHub blocks files above 100 MiB, but phase 1 should use a lower product cap to keep browser
memory, Base64 overhead, preview latency, and repository health under control.

Recommended phase 1 cap:

- hard cap: 25 MiB per file
- allow multi-file drop, but process files serially and reject a batch once the total exceeds 100
  MiB

This is a product decision, not a GitHub hard limit.

## Why not use the repository contents write API for the MVP?

It looks tempting because it accepts Base64 content directly, but it is the wrong primitive for
Samebase's current product shape.

Reasons:

- it creates one commit per file instead of fitting naturally into Samebase's staged multi-file
  commit model
- GitHub explicitly warns that parallel contents writes and deletes conflict
- it does not solve pre-commit image preview
- it does not solve the current text-only staging model
- the repo already has most of the Git database commit machinery in place

The right MVP path is to keep the existing Git database commit flow and add a binary branch to it.

## Implementation Plan

1. Add binary-aware fields to `fileStaging` and related validators/types.
2. Add upload-URL and finalize-upload mutations for vault-scoped image staging.
3. Add a reusable sidebar footer upload component to `FileView` with tap-first mobile behavior.
4. Add an explicit destination-folder picker seeded from the current selection but overridable
   before finalize.
5. Extend file-tree staged status helpers so binary uploads and replacements show as added or
   modified.
6. Extend `RepositoryMediaViewer` so staged images render before commit.
7. Teach the commit pipeline to partition text and binary rows, create GitHub blobs for binary rows,
   and use SHA-based binary conflict checks.
8. Warm the `blobs` cache with committed binary metadata after commit.
9. Switch committed media preview fallback from contents-only behavior to the Git blob path when
   needed.

## Validation

- Include unit tests for binary staged-file classification.
- Cover binary commit conflict rules with dedicated tests.
- Verify Git blob SHA handling used by staged binary rows.
- Update or add a visual fixture that shows the sidebar footer dropzone.
- Add a mobile visual fixture or screenshot that shows the tap-first upload surface.
- Provide a visual fixture that shows staged image preview.
- Cover the shipped upload surface with at least one Playwright screenshot on a mobile viewport.
- Manually verify:
  - tap the upload surface on mobile and choose an image
  - change the destination folder before staging
  - upload a new image to the selected folder
  - upload a new image to repository root
  - reject an oversized image
  - require explicit confirmation before replacing an existing path
  - replace an existing image after confirmation
  - rename a staged image
  - delete and restore a staged image
  - commit and reload

## Non-Goals

- Cloudflare, R2, or any other external asset store
- video, audio, PDF, or arbitrary binary upload UX
- binary diff or visual compare UI
- Git LFS integration in phase 1
- a global upload entrypoint on `/add`
- dashboard uploads without an explicit vault and branch target

## Primary Sources

- GitHub Docs:
  [REST API endpoints for repository contents](https://docs.github.com/en/rest/repos/contents)
- GitHub Docs: [REST API endpoints for Git blobs](https://docs.github.com/en/rest/git/blobs)
- GitHub Docs: [REST API endpoints for Git trees](https://docs.github.com/en/rest/git/trees)
- GitHub Docs:
  [About large files on GitHub](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)
- MDN: [DataTransfer.files](https://developer.mozilla.org/en-US/docs/Web/API/DataTransfer/files)
- MDN: [FileReader](https://developer.mozilla.org/en-US/docs/Web/API/FileReader)
- Convex Docs: [Accessing File Metadata](https://docs.convex.dev/file-storage/file-metadata)
- Convex Docs: [Upload Files from Clients](https://docs.convex.dev/file-storage/upload-files)
