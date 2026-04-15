# Convex Published File Links

## Status

- Date: April 16, 2026
- Scope: `apps/noter`
- Type: follow-up product and architecture research

## Prompt We Are Answering

If we do not use GitHub Pages or build-time static publishing, what is the
cleanest Noter-native direction for making one selected repo file viewable by
link?

## Direction Summary

The best next step is to treat publishing as a product record in Convex:

1. the owner clicks `Publish` from the existing file view
2. Noter creates or updates one publish record for that file
3. Noter returns one stable opaque public URL
4. the public route resolves the record from Convex and renders a read-only
   document

This keeps publishing inside the main product model instead of turning it into a
separate deployment system.

## Why This Fits The Current App Better

### 1. The product already has a clear owner surface

The authenticated file surface already exists at
[apps/noter/src/routes/vault-file.tsx](/Users/nicu/.codex/worktrees/664a/noter/apps/noter/src/routes/vault-file.tsx:1).
That is the natural place for a `Publish` action and a `Copy link` follow-up.

We do not need a separate GitHub Pages workflow just to expose one file.

### 2. Convex already owns product records for externally reachable resources

The schema already stores branch-to-domain mappings in
[apps/noter/convex/schema.ts](/Users/nicu/.codex/worktrees/664a/noter/apps/noter/convex/schema.ts:529)
through `vaultDomains`. A published file link fits the same overall idea: Noter
stores a durable product record that points from an internal source to an
external URL.

### 3. The public side can stay simple and anonymous

This codebase already uses public Convex queries that return `null` when no user
is signed in, for example `viewer` in
[apps/noter/convex/users.ts](/Users/nicu/.codex/worktrees/664a/noter/apps/noter/convex/users.ts:374).

That means we can intentionally make the public publish-link resolver an
anonymous read, while keeping create, revoke, and republish mutations strictly
owner-only.

### 4. The renderer can stay intentionally small

The app already has a constrained markdown parser in
[apps/noter/src/lib/staticMarkdown.ts](/Users/nicu/.codex/worktrees/664a/noter/apps/noter/src/lib/staticMarkdown.ts:1)
and a semantic read surface in
[apps/noter/src/components/StaticMarkdownDocument.tsx](/Users/nicu/.codex/worktrees/664a/noter/apps/noter/src/components/StaticMarkdownDocument.tsx:1).

For a first publish flow, that is a better foundation than mounting the full
editor or adding a heavier markdown runtime.

## Recommended User Flow

1. The owner opens `slogans.md` in the normal file view.
2. The owner clicks `Publish`.
3. Noter creates a publish record in Convex and returns a stable public link.
4. The file view shows:
   - `Copy link`
   - `Republish`
   - `Unpublish`
5. Visitors open the public link and see a fast read-only document page.
6. If the owner edits the source file later, Noter shows that the published copy
   is stale until they republish.

This keeps authoring in the real repo surface and keeps the public page
read-only. That is easier to understand than turning the public link into a
second editor entry point immediately.

## Strong Recommendation: Snapshot First

The publish record should store a snapshot of the file at publish time, not a
live pointer that always follows the branch.

Why this is the right v1:

- it is easier to explain
- it avoids accidental public updates
- it makes rollback and revoke obvious
- it reduces branching and caching edge cases

The user mental model becomes:

- `Publish` means "make this exact version public"
- `Republish` means "replace the public copy with the latest file content"

That is much safer and more readable than "whatever is on this branch is now
public."

## Data Model Recommendation

Add a dedicated table for published file links, for example
`publishedFileLinks`.

Recommended row shape:

- `ownerId`
- `vaultId`
- `branch`
- `filePath`
- `publicId`
- `active`
- `title`
- `content`
- `contentFormat`
- `sourceCommitSha`
- `publishedAt`
- `updatedAt`
- `revokedAt`

Recommended notes:

- Use one opaque `publicId` generated with the existing Convex token helper in
  [apps/noter/convex/oauthUtils.ts](/Users/nicu/.codex/worktrees/664a/noter/apps/noter/convex/oauthUtils.ts:15).
- For this feature, storing the opaque id directly is acceptable because the
  link grants read-only access only and the main optimization target is code
  clarity.
- Keep the public route keyed by `publicId`, not by repo owner, repo name, or
  path. The public URL should reveal as little structure as possible.

Recommended indexes:

- `by_public_id`
- `by_vault_and_branch_and_file_path`
- `by_owner`

## Route Recommendation

Use one explicit public route, for example `/p/$`.

Why this is the best shape:

- it is short and copyable
- it avoids exposing repo structure
- it keeps the route contract stable even if the source file moves later
- it maps cleanly onto one Convex lookup by `publicId`

The public route should render through the lightweight public wrapper in
[apps/noter/src/routes/-publicRouteComponents.tsx](/Users/nicu/.codex/worktrees/664a/noter/apps/noter/src/routes/-publicRouteComponents.tsx:1),
not through the full authenticated workspace shell.

## Rendering Recommendation

Render the public page from the stored snapshot content and keep the content
model narrow:

- markdown subset first
- semantic article structure
- no editor boot
- no bidirectional sync
- no branch awareness on the public page

If richer markdown support is needed later, that can be added behind the same
publish record without changing the user flow.

## Product Semantics To Keep Explicit

This should be described as `Publish this file` or
`Make this file viewable by link`.

It should not be described as `private sharing`, because the record creates a
publicly reachable URL. The repo stays private, but the published file is
deliberately exempted.

## What To Avoid In V1

- GitHub Pages integration
- build-time page generation
- `_redirects`-driven special cases
- live branch-following publishes
- editable public links
- generic multi-file folder publishing
- access-control layers such as invites or signed viewers

Those paths all add conceptual weight before the single-file publish model is
proven.

## Minimal Implementation Plan

1. Add `publishedFileLinks` to the Convex schema.
2. Add owner-only mutations:
   - `publishFile`
   - `republishFile`
   - `unpublishFile`
3. Add one anonymous query:
   - `getPublishedFileByPublicId`
4. Add one public route at `/p/$`.
5. Render the route with `StaticMarkdownDocument` for markdown content.
6. Add route-level Playwright coverage for:
   - published file loads
   - revoked link fails closed
   - republish updates content

## Bottom Line

The canonical direction should be:

- publishing is a Convex record
- the public URL resolves through Convex
- the public page renders a stored snapshot
- editing stays in the normal file view

That gives Noter one readable product story and leaves room to add better
delivery later without changing the core contract.
