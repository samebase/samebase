# Convex Published File Links

## Status

- Date: April 16, 2026
- Scope: `apps/noter`
- Type: follow-up product and architecture research

## Prompt We Are Answering

If we do not use GitHub Pages or build-time static publishing, what is the
cleanest Noter-native direction for making one selected repo file viewable by
link?

## Updated Decision

The public URL should be transparent and mirror the existing private file route
shape.

Use the same owner, repo, ref, and path contract that the editor already uses
under `/vault`, but expose the published view under `/p`.

Canonical examples:

- private editor: `/vault/noter-md/noter/main/slogans.md`
- public latest-on-branch: `/p/noter-md/noter/main/slogans.md`
- public exact commit: `/p/noter-md/noter/abc1234/slogans.md`

For branch names that contain `/`, reuse the same percent-encoding rules the app
already applies in
[apps/noter/src/lib/vaultRoutes.ts](/Users/nicu/.codex/worktrees/664a/noter/apps/noter/src/lib/vaultRoutes.ts:20).

This means the public publishing contract should be "same route as the private
editor, just with a `/p` prefix."

## Direction Summary

The best next step is to treat publishing as a product record in Convex:

1. the owner clicks `Publish` from the existing file view
2. Noter creates or updates a publish record for that owner, repo, ref, and file
   path
3. Noter returns a public link that mirrors the private file URL with `/p`
   instead of `/vault`
4. the public route resolves the record from Convex and renders a read-only
   document

This keeps publishing inside the main product model instead of turning it into a
separate deployment system.

## Why This Fits The Current App Better

### 1. The product already has a clear owner surface

The authenticated file surface already exists at
[apps/noter/src/routes/vault-file.tsx](/Users/nicu/.codex/worktrees/664a/noter/apps/noter/src/routes/vault-file.tsx:23).
That is the natural place for a `Publish` action and a `Copy link` follow-up.

We do not need a separate GitHub Pages workflow just to expose one file.

### 2. The app already has the route grammar we want

The current private file route is intentionally path-string based and already
supports:

- owner and repo in the URL
- refs such as `main`
- encoded branch names such as `feature%2Flogin-flow`
- file paths with encoded segments

Those rules are already centralized in
[apps/noter/src/lib/vaultRoutes.ts](/Users/nicu/.codex/worktrees/664a/noter/apps/noter/src/lib/vaultRoutes.ts:27)
and covered by tests in
[apps/noter/src/lib/vaultRoutes.test.ts](/Users/nicu/.codex/worktrees/664a/noter/apps/noter/src/lib/vaultRoutes.test.ts:21).

Publishing should reuse that exact route grammar instead of inventing an opaque
public id or a second URL vocabulary.

### 3. Convex already owns product records for externally reachable resources

The schema already stores branch-to-domain mappings in
[apps/noter/convex/schema.ts](/Users/nicu/.codex/worktrees/664a/noter/apps/noter/convex/schema.ts:529)
through `vaultDomains`. A published file link fits the same overall idea: Noter
stores a durable product record that points from an internal source to an
externally reachable page.

### 4. The public side can stay simple and anonymous

This codebase already uses public Convex queries that return `null` when no user
is signed in, for example `viewer` in
[apps/noter/convex/users.ts](/Users/nicu/.codex/worktrees/664a/noter/apps/noter/convex/users.ts:374).

That means we can intentionally make the public publish resolver an anonymous
read, while keeping create and revoke mutations strictly owner-only.

### 5. The renderer can stay intentionally small

The app already has a constrained markdown parser in
[apps/noter/src/lib/staticMarkdown.ts](/Users/nicu/.codex/worktrees/664a/noter/apps/noter/src/lib/staticMarkdown.ts:1)
and a semantic read surface in
[apps/noter/src/components/StaticMarkdownDocument.tsx](/Users/nicu/.codex/worktrees/664a/noter/apps/noter/src/components/StaticMarkdownDocument.tsx:1).

For a first publish flow, that is a better foundation than mounting the full
editor or adding a heavier markdown runtime.

## Recommended User Flow

1. The owner opens `slogans.md` in the normal file view.
2. The owner clicks `Publish`.
3. Noter creates or updates a publish record in Convex and returns a public
   link.
4. The file view shows:
   - `Publish`
   - `Copy public link`
   - `Copy versioned link`
   - `Unpublish`
5. Visitors open the public link and see a fast read-only document page.

Once the file is public on a branch, the branch URL already follows the latest
committed branch content. There should not be a second manual `Republish` step.

Transparent examples:

- branch-following link: `/p/noter-md/noter/main/slogans.md`
- exact version link: `/p/noter-md/noter/abc1234/slogans.md`

This keeps authoring in the real repo surface and keeps the public page
read-only. That is easier to understand than turning the public link into a
second editor entry point immediately.

## Ref Semantics Recommendation

Support both branch refs and commit refs, using the same transparent route
shape.

### Branch ref

If the ref segment is a branch name such as `main`, the public page should show
the latest committed version for that branch and file path while the publish
record stays enabled.

Example:

- `/p/noter-md/noter/main/slogans.md`

This is the natural "share the latest version from `main`" contract.

### Commit ref

If the ref segment is a commit SHA, the public page should show that exact
published version.

Example:

- `/p/noter-md/noter/abc1234/slogans.md`

This is the natural immutable link contract.

### Product meaning

That makes the public story easy to explain:

- branch URL means "latest version from this branch while the publish record is
  enabled"
- commit URL means "this exact published version"

## Data Model Recommendation

Add a dedicated table for published file links, for example
`publishedFileLinks`.

Recommended row shape:

- `ownerId`
- `vaultId`
- `owner`
- `repoName`
- `refType`
- `ref`
- `filePath`
- `active`
- `title`
- `content`
- `contentFormat`
- `sourceCommitSha`
- `publishedAt`
- `updatedAt`
- `revokedAt`

Recommended notes:

- `refType` should distinguish `branch` from `commit`.
- `ref` stores the transparent route segment exactly as we serve it.
- `sourceCommitSha` stores the last resolved commit even for branch-based
  publishes so the owner UI can explain what is currently public.
- A branch publish should create the branch permission record once, and branch
  resolution should keep the branch row and matching commit rows in sync with
  the latest committed branch content.
- The important optimization target is code clarity, not minimizing every
  duplicate row on day one.

Recommended indexes:

- `by_owner_repo_ref_file_path`
- `by_vault_ref_file_path`
- `by_owner`
- `by_source_commit_sha`

## Route Recommendation

Use a public route that mirrors the private file route grammar:

- private: `/vault/<owner>/<repo>/<ref>/<path>`
- public: `/p/<owner>/<repo>/<ref>/<path>`

That means the final public route contract should be based on the same encoding
and parsing rules that already power `buildVaultFileRoute` and
`parseVaultPathContext` in
[apps/noter/src/lib/vaultRoutes.ts](/Users/nicu/.codex/worktrees/664a/noter/apps/noter/src/lib/vaultRoutes.ts:27).

Why this is the best shape:

- it is transparent
- it matches the user's existing mental model from the private editor
- it keeps owner and repo scoping explicit
- it naturally supports both branch refs and commit refs
- it does not require opaque link ids

### On `blob`

Do not add a `blob` segment in v1.

GitHub uses `blob` because it also exposes sibling route families such as `tree`
and `raw`. Noter does not need that extra namespace yet if the only public
action is "render this published file page."

If raw or tree views ever ship later, we can revisit whether a `blob` segment
becomes useful.

## Rendering Recommendation

Render the public page from a narrow content model and keep the route surface
simple:

- markdown subset first
- semantic article structure
- no editor boot
- no bidirectional sync
- no authenticated workspace shell

If richer markdown support is needed later, that can be added behind the same
publish record without changing the route contract.

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
- opaque public ids unrelated to the file route
- editable public links
- generic multi-file folder publishing
- access-control layers such as invites or signed viewers

Those paths all add conceptual weight before the single-file publish model is
proven.

## Minimal Implementation Plan

1. Add `publishedFileLinks` to the Convex schema.
2. Add owner-only mutations:
   - `publishFile`
   - `unpublishFile`
3. Add one anonymous resolver that resolves by owner, repo, ref, and file path.
4. Add a public route that mirrors the `/vault/...` parser with a `/p/...`
   prefix.
5. Reuse the existing route helpers in
   [apps/noter/src/lib/vaultRoutes.ts](/Users/nicu/.codex/worktrees/664a/noter/apps/noter/src/lib/vaultRoutes.ts:27)
   instead of inventing a second encoding system.
6. Render the route with `StaticMarkdownDocument` for markdown content.
7. Add route-level Playwright coverage for:
   - branch public file loads
   - commit public file loads
   - revoked link fails closed

## Bottom Line

The canonical direction should be:

- publishing is a Convex record
- the public URL mirrors the private file URL with `/p` instead of `/vault`
- branch refs and commit refs are both first-class and transparent
- branch URLs resolve the latest committed branch content
- commit URLs render exact stored snapshots
- editing stays in the normal file view

That gives Noter one readable product story and keeps the route surface honest.
