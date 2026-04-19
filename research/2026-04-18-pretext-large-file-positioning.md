# Pretext Large File Positioning Research

## Status

- Date: April 18, 2026
- Scope: `apps/noter` large-file viewing, Pretext feasibility, Convex-first
  backend shape
- Question: can Noter show only a local window of a very large text file, up to
  roughly 1 GB, while still knowing the exact global file position and exact
  scroll geometry?

## Short Answer

- Not from the visible window alone.
- Pretext can give exact wrapped-line geometry for text that has already been
  prepared for layout.
- Exact global seek still needs a separate index that maps local windows back to
  absolute file offsets and, for wrapped text, to prefix height.
- For GitHub-backed repository files, true 1 GB blobs are outside the normal
  repository path anyway. GitHub enforces a 100 MB single-object limit in
  repositories, and the Git blob API only supports blobs up to 100 MB.
- Convex can remain the source of truth for metadata, permissions, and index
  rows, but its documented file-serving primitives are not a complete random
  access backend for a 1 GB text viewer.
- If we need authenticated byte-range reads on app-owned large objects, the most
  practical fallback is a thin Cloudflare Worker over R2, while keeping Convex
  as the control plane.

## What Pretext Actually Gives Us

Pretext is strong at deterministic local layout work:

- `prepare()` and `prepareWithSegments()` do the expensive segmentation and
  measurement pass once.
- `layout()`, `measureLineStats()`, `walkLineRanges()`, and
  `layoutNextLineRange()` can then compute exact wrapped-line geometry for the
  prepared text at a given width without DOM layout reads.
- `layoutNextLineRange()` is especially useful for windowed rendering because it
  can stream line ranges one row at a time from a known cursor.

But Pretext is explicit about an important limit:

- `LayoutCursor` is a segment/grapheme cursor, not a raw string offset.
- The rich prepared handle exposes segments and cursors for the prepared text,
  not a global file offset outside that prepared text.

Sources:

- [Pretext README](https://github.com/chenglou/pretext/blob/main/README.md)
- [Pretext `src/layout.ts`](https://github.com/chenglou/pretext/blob/main/src/layout.ts)
- [Pretext `src/measurement.ts`](https://github.com/chenglou/pretext/blob/main/src/measurement.ts)

## Why The Visible Window Alone Is Not Enough

Two different files can produce the exact same visible window while having
different absolute positions:

- File A can have a 300 MB prefix before the current window.
- File B can have a 700 MB prefix before the same current window text.

Pretext will produce the same local layout result for the visible text in both
cases, because it only knows about the prepared text it was given.

That means exact global position cannot come from Pretext alone. At minimum, the
viewer needs an external anchor table that tells it:

- where the current window starts in bytes
- where the current window starts in decoded text units
- where the current window starts in logical lines or paragraphs
- what prefix height or prefix visual-line count exists before that window

Without that metadata, the viewer only has local geometry, not exact global
geometry.

## Exactness Depends On File Shape

### 1. Line-oriented text

Examples:

- source files
- logs
- CSV / TSV
- JSONL
- most newline-preserving plain text

This case is feasible.

If the viewer preserves hard breaks, each logical line can be laid out
independently at the current width. Exact global position then becomes:

- exact line-start byte offset from an index
- plus exact wrapped visual-line count for each logical line before the viewport

Pretext is useful here because it can compute the exact wrapped height of each
line or block without DOM measurement.

### 2. Paragraph-oriented text with real hard breaks

This is also feasible if the viewer treats paragraphs or blocks as the indexed
unit. Exact prefix height is then the prefix sum of per-block wrapped heights.

### 3. One huge wrapped run

Examples:

- minified JSON
- a single-line CSV export
- one huge paragraph with no hard breaks

This is the hard boundary.

If the whole file is one wrapped run, exact vertical position at width `W`
depends on laying out the entire prefix at width `W`. A small local window is
not enough, because line breaking state depends on everything before it.

In that case we should not promise cheap exact global seek. The honest fallback
is one of:

- wrap off
- chunk browser mode
- approximate seek first, then refine in the background

## Current Noter Constraints

Today Noter's file path is still a full-document path.

Frontend:

- [Monaco surface](../../apps/noter/src/components/MonacoEditorSurface.tsx)
  expects a full `defaultValue` string.
- [CodeMirror file surface](../../apps/noter/src/components/CodeMirrorFileSurface.tsx)
  also mounts a full document string.
- [FileView](../../apps/noter/src/components/FileView/FileView.tsx) calls
  `api.fileStagingActions.getFileForEditing` and treats `"in storage"` errors as
  a signal that the selected file is not editable text.

Backend:

- [getFileForEditing](../../apps/noter/convex/fileStagingActions.ts) fetches
  repo content through GitHub's Contents and Git blob APIs.
- Text is only kept inline when it is below
  [`INLINE_TEXT_MAX = 900_000`](../../apps/noter/convex/gitOperationsActions.ts).
- Larger files are stored as storage-backed blobs and flow through the binary
  staging path.

So the current product path is not "large text with windowing." It is "small
text loaded whole" or "storage-backed binary/media."

## GitHub Repository Reality Check

If the target remains ordinary GitHub repository files, 1 GB native repo files
are not a realistic input:

- GitHub Enterprise Cloud documents a 100 MB enforced single-object limit for
  repository contents.
- The Git blob REST API explicitly says blob reads are supported only up to 100
  MB.
- The Contents API is unsupported above 100 MB.
- Larger assets have to move to Git LFS or another object store.

Sources:

- [GitHub repository limits](https://docs.github.com/en/enterprise-cloud@latest/repositories/creating-and-managing-repositories/repository-limits)
- [GitHub REST contents API](https://docs.github.com/en/rest/repos/contents)
- [GitHub REST blob API](https://docs.github.com/en/rest/git/blobs)
- [Git LFS overview](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-git-large-file-storage)

This means a "1 GB file viewer" is not an incremental extension of the current
GitHub blob flow. It is a separate large-object architecture problem.

## Convex Constraints

Convex is still a good fit for metadata and coordination, but the documented
file primitives have important limits here:

- upload URLs support arbitrarily large uploads
- `ctx.storage.get()` returns a `Blob`
- HTTP actions are limited to 20 MB request and response bodies
- actions time out after 10 minutes
- Node actions have a 512 MB memory limit, while the Convex runtime has a 64 MB
  memory limit

Sources:

- [Convex upload docs](https://docs.convex.dev/file-storage/upload-files)
- [Convex serve-files docs](https://docs.convex.dev/file-storage/serve-files)
- [Convex HTTP action docs](https://docs.convex.dev/functions/http-actions)
- [Convex actions docs](https://docs.convex.dev/functions/actions)
- [Convex limits](https://docs.convex.dev/production/state/limits)
- [Convex storage API](https://docs.convex.dev/api/interfaces/server.StorageActionWriter)

Practical implications:

- Convex is good at storing file metadata, revision rows, coarse indexes, and
  user-visible viewer state.
- Convex is not well documented as a random byte-range serving layer for very
  large files.
- `storage.getUrl()` returns an opaque file URL, but the docs do not promise
  range support or an authenticated partial-content contract we should build a
  core editor feature around.
- A 1 GB file also cannot fit into normal Convex document values, which are
  capped at 1 MB.

## Recommended Architecture

### Option A: Convex-first with range-capable storage

This is the preferred shape if we want to keep Convex central.

Use Convex for:

- file identity and revisions
- permissions
- file metadata such as size, encoding, and newline mode
- coarse block index rows
- optional cached layout summaries
- persisted viewer state such as last anchor, selection, and open panels

Use the client for:

- fetching only the needed byte windows
- decoding UTF-8 with overlap around chunk boundaries
- running Pretext inside a browser worker on only the visible and nearby blocks
- keeping an LRU cache of prepared blocks near the viewport

Suggested block index fields:

- `fileId`
- `revision`
- `byteStart`
- `byteEnd`
- `firstLogicalLine`
- `logicalLineCount`
- `newlineCount`
- optional per-block byte offsets for logical line starts

Suggested runtime behavior:

1. Binary-search the block index to find the nearest anchor.
2. Fetch a byte window around that anchor.
3. Decode text with boundary overlap.
4. Run Pretext on the local logical lines or paragraphs.
5. Render only the visible rows plus overscan.
6. Update exact top-of-viewport byte and line position from the block-local
   offsets.

This keeps Pretext where it shines: local exact geometry.

For app-owned large objects in R2, the most realistic prototype path is:

1. Convex generates a short-lived presigned `GET` URL for the object on the R2
   S3 API domain.
2. The browser fetches only the needed byte window from that URL.
3. The bucket is configured with CORS for the app origin.

Cloudflare documents that presigned URLs:

- are generated with standard S3 signing
- can be used like any HTTP endpoint
- work directly in web browsers
- only work on the S3 API domain, not on R2 custom domains

This is the lowest-friction way to validate browser-direct partial reads before
introducing another serving layer.

Sources:

- [Cloudflare R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [Cloudflare R2 download objects](https://developers.cloudflare.com/r2/objects/download-objects/)
- [Cloudflare R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/)

### Option B: thin Cloudflare range gateway

Use this only if Option A stalls on the serving layer.

Cloudflare gives us two useful documented primitives:

- R2 ranged reads via `bucket.get(key, { range: ... })`
- Worker-side request handling close to the object store

Sources:

- [Cloudflare R2 Workers API reference](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare Cache API and range behavior](https://developers.cloudflare.com/workers/runtime-apis/cache/)

In this shape:

- R2 stores the bytes
- the Worker handles auth and byte-range reads
- Convex still owns file records, permissions, index rows, and viewer state
- Pretext still runs client-side, not in the Worker

This should stay thin. The Worker is only the range gateway, not the product's
state layer.

This path becomes the realistic production answer when we need one or more of:

- authenticated private files without exposing R2 signing details to clients
- custom-domain delivery with Cloudflare cache in front of the bucket
- explicit control over `206 Partial Content`, `Content-Range`, and cache
  headers
- revocation semantics tighter than a reusable presigned URL lifetime

Cloudflare's docs make the tradeoff fairly clear:

- presigned URLs are for the S3 API domain only
- custom-domain access is where Cloudflare cache, WAF, and Access controls live

So the honest rollout is:

1. prototype browser-direct reads with presigned URLs
2. move to a tiny Worker if the app needs private custom-domain serving or more
   control over the byte-serving contract

## Why I Do Not Recommend Server-side Pretext As The Main Plan

There are two separate reasons not to make server-side Pretext the center of the
design.

First, Pretext's measurement path requires `OffscreenCanvas` or a DOM canvas.
Its public source does not present a documented Convex-specific server path.

Second, even if we made that work somewhere, server-side Pretext does not solve
the main problem by itself:

- exact global seek still needs an offset index
- width-specific exact heights would still need caching
- font parity with the actual client becomes harder
- it would duplicate compute that can stay close to the real rendering surface

The better split is:

- server stores offsets and permissions
- client measures the local window it is actually showing

## Recommendation For Noter

1. Do not try to extend the current `getFileForEditing` + Monaco full-string
   path to 1 GB text.
2. Split the product into:
   - small editable file surface
   - large read-only file surface
3. Make the large file surface line-oriented in v1.
4. Promise exact global positioning only for files with hard-break boundaries.
5. Treat pathological single-line blobs as a separate fallback mode.
6. Keep Convex as the control plane for metadata, indexing, and viewer state.
7. Add a Cloudflare Worker only if we need a documented range-serving layer.
8. If the target is still GitHub repository content, solve LFS or external
   object handling before building a 1 GB viewer.

## Follow-up Work

- Decide whether the target input is:
  - GitHub repo content
  - Git LFS objects
  - app-owned uploaded files
- Define the exact v1 contract for "large file":
  - read-only or editable
  - wrap on or wrap off
  - line-oriented only or arbitrary prose
- Prototype a browser-worker layout cache that runs Pretext on a small window of
  hard-break text.
- Design a Convex block-index table for file revisions.
- Validate whether the chosen storage path gives us documented HTTP byte-range
  behavior; if not, use a Worker gateway.
