# 070 Small VOX Browser Preview Spec

## Document Control

- Status: Proposed
- Owner: File view + repository media preview
- Last updated: 2026-03-26
- Related specs:
  - `specs/007_SIMPLE_VIEW_FRONTMATTER_SPEC.md`
  - `specs/045_VAULT_MULTI_BRANCH_DASHBOARD_AND_EDITOR_SPEC.md`
- Source of truth files:
  - `apps/noter/shared/repositoryMedia.ts`
  - `apps/noter/src/components/FileView.tsx`
  - `apps/noter/src/components/RepositoryMediaViewer.tsx`
  - `apps/noter/convex/github.ts`
  - `apps/noter/convex/gitOperationsActions.ts`
  - `apps/noter/e2e/repository-media-visual.spec.ts`
- External references:
  - [Teardown modding docs](https://www.teardowngame.com/modding/)
  - [Teardown VoxTool overview](https://teardowngame.com/voxtool/)
  - [Three.js VOXLoader docs](https://threejs.org/docs/pages/VOXLoader.html)
  - [Three.js VOXLoader source](https://github.com/mrdoob/three.js/blob/master/examples/jsm/loaders/VOXLoader.js)

## Summary

Add read-only browser preview support for small `.vox` files in Noter file view.

This is primarily for Teardown and MagicaVoxel-style assets that are small
enough to fit through Noter's existing repository media fetch path, such as the
82 KB sample asset that motivated this proposal.

V1 stays intentionally narrow:

1. only standard `.vox` files
2. only files small enough to fit the existing media-preview limit
3. read-only preview only
4. no Git LFS work
5. no Teardown-specific material simulation

## Problem

Today Noter can render repository images, but it cannot render voxel assets.

That is a poor fit for modding workflows where `.vox` is a first-class asset
format. In Teardown specifically, mods commonly ship `.vox` files, and the
official modding docs describe `.vox` as a normal asset type backed by
MagicaVoxel.

The current experience forces the operator into one of two bad outcomes:

1. the file is treated as non-renderable and never gets an in-app preview
2. the operator has to leave Noter to inspect even very small voxel assets

This makes Noter weaker as a repository browser for game/mod repos even though
the browser already has the primitives needed to render this format.

## Current State

### Media classification

`apps/noter/shared/repositoryMedia.ts` currently recognizes only image
extensions and exposes only one renderable media kind: `image`.

That means `.vox` is not treated as renderable media at all.

### Backend asset loading

`apps/noter/convex/github.ts#getRepositoryMediaAsset` already supports fetching
small binary media through GitHub, storing it in Convex storage, and returning a
signed URL for frontend display.

Important current constraint:

1. files larger than 1 MB return
   `Preview unavailable for files larger than 1 MB.`

That limit is already acceptable for the initial request because the motivating
asset size is 82 KB.

### Frontend rendering

`apps/noter/src/components/RepositoryMediaViewer.tsx` assumes the loaded asset
is an image and renders it with `<img>`.

There is no current branch for:

1. binary-but-renderable 3D assets
2. canvas/WebGL-based repository media
3. asset-specific preview error handling for parse failures

### Existing rendering dependency

`apps/noter/package.json` already includes `three`, and the app already owns
Three.js scene code elsewhere.

This means Noter does not need a new rendering stack just to add a `.vox`
preview path.

## External Research

### Teardown format context

The Teardown modding docs explicitly describe `.vox` files as mod assets and
state that almost all Teardown assets were modeled in MagicaVoxel.

The same docs also explain that Teardown uses palette indices as material
semantics, not just RGB display colors. That matters because a browser preview
can be visually useful without being a fully faithful simulation of in-game
material behavior.

### Browser loader availability

Three.js officially ships `VOXLoader`, and its docs state that it can either:

1. load a `.vox` asset from a URL
2. parse raw `ArrayBuffer` data

The loader returns parsed `chunks` plus a scene graph, which is sufficient for
browser-side preview in Noter.

### VoxTool caveat

Teardown's VoxTool documentation calls out compression and decompression
utilities for voxel assets.

That implies Noter should not assume every Teardown-related voxel artifact is a
plain MagicaVoxel `.vox` file that `VOXLoader` can parse directly.

V1 should therefore support standard `.vox` files that parse successfully and
gracefully reject files that do not.

## Goals

1. Let the operator preview small `.vox` files directly in file view.
2. Reuse the existing repository media fetch/storage path.
3. Keep the preview read-only and lightweight.
4. Avoid blocking on Git LFS or large-binary support.
5. Preserve the current image-preview behavior unchanged.
6. Fail gracefully when a `.vox` file is too large or cannot be parsed.

## Non-Goals

1. Git LFS support.
2. Preview support for files larger than the current repository media limit.
3. Editing `.vox` files inside Noter.
4. Accurate Teardown material simulation based on palette index semantics.
5. Preview support for compressed or otherwise non-standard VoxTool artifacts
   that `VOXLoader` cannot parse directly.
6. A generic 3D asset framework for every model format.

## Product Decisions

### 1. Add `.vox` as a new repository media kind

Noter should treat `.vox` as renderable repository media instead of as a text
file or unknown blob.

Recommended type model:

```ts
type RepositoryMediaKind = 'image' | 'vox'
```

This keeps the current media pipeline intact while making the viewer extensible
enough for one non-image format.

### 2. Scope v1 to small `.vox` files only

V1 should explicitly reuse the current media asset loading path and its size
constraints.

Rules:

1. if the file fits through `getRepositoryMediaAsset`, it is previewable
2. if the file hits the current `> 1 MB` limit, show the existing size error
3. this RFC does not introduce a separate large-file path

This keeps implementation small and solves the immediate Teardown/modding use
case without inventing storage policy first.

### 3. Keep backend transport opaque

The backend should not parse voxel geometry.

Instead, it should continue doing what the current media path already does:

1. fetch the file from GitHub
2. cache it in Convex storage
3. return a signed URL plus basic metadata

The browser should own `.vox` parsing and rendering.

Why:

1. Three.js already has the loader
2. frontend parsing keeps the backend format-agnostic
3. this avoids introducing voxel-specific Convex logic

### 4. Parse `.vox` on the client with `VOXLoader`

The preview component should fetch the asset URL as binary data and parse it
with `VOXLoader`.

Implementation guidance:

1. lazy-load the addon only when `asset.kind === "vox"`
2. parse from `ArrayBuffer`
3. build a preview scene with a camera, lights, and fit-to-model framing

The viewer should provide at least:

1. drag-to-orbit rotation
2. wheel or trackpad zoom
3. passive fit-to-model on initial load

The implementation may use `OrbitControls` or an equivalent app-owned camera
control layer.

### 5. Keep the UX read-only and low-chrome

The `.vox` preview should live inside the existing repository media panel rather
than introducing a separate page or modal.

Recommended UI contract:

1. keep the current filename and MIME header row
2. render the preview in the same panel area used for images
3. avoid adding extra toolbars or decorative controls by default
4. keep the interaction discoverable through direct manipulation

This matches the repo's current additive-minimalism preference.

### 6. Represent geometry and palette, not Teardown material semantics

V1 preview should render the voxel model geometry and palette colors only.

It should not attempt to interpret Teardown-specific material meaning from
palette indices.

Why:

1. the preview is still highly useful for inspection and navigation
2. material-semantic emulation would require Teardown-specific palette policy
3. that would widen the feature from "browser preview" into a game-specific
   renderer

### 7. Parse failures should be explicit and non-destructive

If a `.vox` file cannot be parsed, the UI should show a clear unavailable state
inside the preview panel instead of falling back to raw binary text or crashing
the file view.

Recommended message:

- `Preview unavailable for this .vox file.`

This covers:

1. malformed files
2. unsupported variants
3. future Teardown/VoxTool artifacts that are not plain parseable `.vox`

## Runtime Contract

### Media detection

Add `.vox` to the renderable media extension set in
`apps/noter/shared/repositoryMedia.ts`.

Selection rules:

1. `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`, `.avif` stay `image`
2. `.vox` becomes `vox`
3. all other files remain non-renderable media

### Asset contract

Extend `repositoryMediaAssetResult` in `apps/noter/convex/github.ts` to support
a success payload for `kind: "vox"`.

Recommended contract shape:

```ts
type RepositoryMediaAsset =
  | { found: false; reason: 'missing' }
  | { found: false; reason: 'unavailable'; message: string }
  | {
      found: true
      kind: 'image'
      mimeType: string
      url: string
      fileName: string
    }
  | {
      found: true
      kind: 'vox'
      mimeType: string
      url: string
      fileName: string
    }
```

The backend does not need voxel-specific metadata for v1 beyond the same fields
already used for images.

### MIME handling

`apps/noter/convex/gitOperationsActions.ts#guessMime` should recognize `.vox`
explicitly instead of letting it fall through as an unknown extension.

Because this RFC does not depend on a special browser MIME contract, the safe v1
behavior is to return `application/octet-stream`.

The actual renderer should ignore MIME for parsing and rely on file kind plus
binary fetch.

### Viewer behavior

`apps/noter/src/components/RepositoryMediaViewer.tsx` should switch on
`asset.kind`:

1. `image` keeps the current `<img>` path
2. `vox` renders a dedicated canvas/WebGL preview component

The `.vox` preview component should:

1. fetch `asset.url`
2. parse the binary payload into a scene
3. center and frame the model
4. render it against the existing panel background
5. dispose renderer, geometry, materials, and controls on unmount

### Error states

The following states should remain user-visible and distinct:

1. file missing
2. file too large under the existing media limit policy
3. fetch/load error
4. parse error for invalid or unsupported `.vox`

Image behavior must remain unchanged.

## Implementation Outline

1. Extend media-kind detection in `apps/noter/shared/repositoryMedia.ts`.
2. Extend the Convex media asset validator and TypeScript union in
   `apps/noter/convex/github.ts`.
3. Add explicit `.vox` MIME handling in
   `apps/noter/convex/gitOperationsActions.ts`.
4. Refactor `RepositoryMediaViewer` so the preview panel dispatches by media
   kind instead of assuming `<img>`.
5. Add a `RepositoryVoxPreview` component that owns:
   - binary fetch
   - aborting/canceling in-flight fetch on unmount or asset change
   - `VOXLoader` parse
   - scene/camera/light setup
   - pointer interaction
   - cleanup
6. Add or update a visual fixture and screenshot test to cover the new preview.

## Acceptance

- [ ] Selecting a small `.vox` file in file view renders an in-app 3D preview.
- [ ] Existing image previews continue to render unchanged.
- [ ] A missing `.vox` file preserves the existing missing-state behavior
      without rendering stale preview content.
- [ ] A `.vox` file larger than the existing media limit shows the current size
      error instead of attempting a partial load.
- [ ] A `.vox` fetch/load failure shows a user-visible unavailable state that is
      distinct from parse failure.
- [ ] An invalid or unsupported `.vox` file shows an unavailable-state message
      instead of crashing the page.
- [ ] The viewer remains read-only and embedded in the existing media panel.
- [ ] At least one visual regression fixture/screenshot covers the shipped
      `.vox` preview state.

## Follow-ups

1. Decide whether Git LFS or another large-binary path should later support
   `.vox` files above the current limit.
2. Validate a representative set of real Teardown `.vox` assets against
   `VOXLoader`, including assets that have passed through VoxTool.
3. Consider whether a future Teardown-specific preview should map palette
   indices to material labels without changing the rendered geometry path.
