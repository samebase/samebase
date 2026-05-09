# Workspace Mobile Merge State Persistence Spec

## Document Control

- Status: Accepted hard-break implementation plan
- Owner: Noter frontend/workspace shell
- Created: 2026-05-08
- Related specs:
  - `specs/092_WORKSPACE_PANE_MIN_RESIZE_MERGE_SPEC.md`
  - `specs/094_WORKSPACE_LAYOUT_SIDEBAR_STATE_CONVERGENCE_SPEC.md`
- Related files:
  - `apps/noter/convex/workspaceSidebarState.ts`
  - `apps/noter/convex/workspaceSidebarStateModel.ts`
  - `apps/noter/src/components/workspace-layout-v2/WorkspaceLayoutV2.tsx`
  - `apps/noter/src/components/workspace-layout-v2/WorkspaceLayoutV2Geometry.ts`
  - `apps/noter/src/components/workspace-layout-v2/WorkspacePaneRuntime.tsx`
  - `apps/noter/src/components/workspace-layout-v2/useWorkspaceLayoutV2MobileResize.ts`
  - `apps/noter/src/hooks/useLocalStorageWorkspaceSidebarState.ts`
  - `apps/noter/src/hooks/usePersistedWorkspaceSidebarState.ts`
  - `apps/noter/src/lib/workspaceSidebarStateController.ts`
  - `apps/noter/e2e/workspace-sidebar-drag.spec.ts`

## Summary

Mobile side/main pane merges are user-visible layout state. They must persist
across refresh in the same way selected mobile pane and pane widths persist.

The current implementation persists `mobilePane` plus side-pane widths, but the
actual merged surface is local runtime state. After refresh, the side pane can
come back at its minimum width while the main pane renders unmerged, so the
layout loses the intended `left+main` or `main+right` surface.

This spec updates the state-shape decision from
`specs/092_WORKSPACE_PANE_MIN_RESIZE_MERGE_SPEC.md`: merged mobile surface state
must now be a first-class durable field. It remains separate from pane width.
The current gesture can create a merge when a side pane reaches its smallest
size, but future UI can create or clear the same state through another control,
such as a merge button.

## Reproduced Failure

On 2026-05-08, the dashboard route reproduced the bug on a mobile viewport:

1. Drag the right sidebar to its minimum until the layout settles into
   `main+right`.
2. Wait for persisted state to flush.
3. Refresh the page.

Before refresh, the rendered state had `layoutMobilePane: "right"`,
`hasRightMergedPane: true`, a narrow right pane, and a narrowed main pane. After
refresh, the persisted state still selected `"right"` and still had
`rightMobileWidthPx: 96`, but `hasRightMergedPane` returned `false` and the main
pane expanded back to full width.

That means width persistence is working and merge ownership persistence is
missing.

## Accepted Contract

### Merge State Is Durable

`WorkspaceSidebarState` must include a required `mobileSurface` field:

```ts
type WorkspaceMobileSurface =
  | { kind: "unmerged" }
  | { kind: "merged"; mainWidthPx: number; side: "left" | "right" };
```

The name may live beside the existing historical sidebar schema for now. Do not
rename the whole persisted model in this slice.

The field means:

- `{ kind: "unmerged" }`: mobile carousel surfaces are ordinary pane surfaces.
- `{ kind: "merged", side: "left", mainWidthPx }`: the active durable surface is
  `left+main`.
- `{ kind: "merged", side: "right", mainWidthPx }`: the active durable surface
  is `main+right`.

`mobilePane` remains the selected logical pane. When `mobileSurface.kind` is
`"merged"`, selecting the matching side means the selected carousel surface is
the merged side/main surface. Selecting `"main"` must clear the merge.

### Merge State Is Not Width Inference

The app must not infer `mobileSurface` by checking whether a side pane width is
at its minimum.

Minimum width can be one gesture path into a merge. It is not the definition of
merged state. This preserves room for a future explicit merge button and avoids
making future pane sizing changes silently change layout semantics.

The renderer may use widths to validate whether a persisted merge can fit the
current viewport and route. It must not convert a minimum-width side pane into a
merge unless the stored surface says it is merged.

### Hard Break Is Allowed

This app has one active user for this state. The implementation should break old
persisted state hard instead of carrying compatibility code.

Convex state:

- Add `mobileSurface` as a required field in the `workspaceSidebarStateFields`
  validator.
- Update all server-side defaults and returned objects to include
  `{ kind: "unmerged" }`.
- Do not keep optional old-row normalization in query handlers.
- Do not preserve unknown missing fields for old clients in mutations.
- Before deploying a required schema against existing data, clear or patch the
  existing `workspaceSidebarState` rows once. That operational cleanup replaces
  a widen-migrate-narrow rollout for this one-user state.

Operational cleanup:

- Owner: the release operator for this PR owns the one-time cleanup.
- Timing: run it immediately before deploying the required Convex schema.
- Approach: manually clear or patch every existing `workspaceSidebarState` row
  so each row has `mobileSurface: { kind: "unmerged" }`; do not add app-level
  fallback code.
- Verification: record the command in the deployment checklist, confirm the
  pre-deploy query finds no `workspaceSidebarState` rows missing
  `mobileSurface`, and repeat the query after deploy.

Local storage state:

- Bump the local-storage payload version.
- Require `mobileSurface` in the parser for the new version.
- Reject old payloads and recreate state from the current route default.
- Do not migrate v1 local-storage payloads.

Old clients are allowed to fail validation or reset this UI state. Do not add
compatibility wrappers, fallback field synthesis, or preservation paths.

### Runtime Ownership

The pane runtime owns durable merge state through the same controller that owns
pane widths and selected mobile pane.

The transient layout store may keep drag grip state, settled carousel state, and
viewport measurements. It should not keep committed merged surface ownership.

Current transient fields should move as follows:

- Keep `mobile.grip` transient.
- Keep `mobile.isPaneSettled` transient.
- Move committed `mobile.surface` into `WorkspaceSidebarState.mobileSurface`.
- Keep in-progress drag math local when it has not settled into a durable
  surface.

Runtime actions should expose merge changes as pane-state updates, not layout
store updates. The exact action names can follow the current
`WorkspacePaneRuntime` style, but they need to support:

- set unmerged surface
- set merged surface with side and main width
- persist side width and merged surface together when a resize release settles
  into a merge
- clear merged surface when selecting main or when the current route cannot
  render the merged side

### Route And Viewport Validation

A persisted merge is valid only when the route has the merged side pane and the
current viewport can render the side/main fit.

The default fit must render at a 320px mobile viewport. With the current 96px
side-pane minimum, that means the persisted main pane minimum is 224px.

If durable state says `left+main` but the route has no left pane, render and
persist `"unmerged"`. Same for `main+right` without a right pane.

If a viewport cannot fit both panes according to the current pane constraints,
fail closed by clearing the durable merge. Do not invent placeholder widths.

Clearing invalid durable state is intentional state repair, not old-client
compatibility.

## Implementation Plan

### Step 1. Add The Required Persisted Shape

Define a single mobile surface validator and type with the persisted
`WorkspaceSidebarState` model. Reuse that type in frontend runtime code so the
same union is not manually duplicated in layout geometry files.

Update every `WorkspaceSidebarState` default literal to include:

```ts
mobileSurface: { kind: "unmerged" },
```

### Step 2. Make Storage Strict

Update Convex queries and mutations to read and write the new required field as
part of the complete state object.

Update local storage to a new version that requires `mobileSurface`.

Update state equality and deferred-write checks so changing only `mobileSurface`
schedules persistence. A merge change must not be hidden behind a width-only
comparison.

### Step 3. Move Committed Surface State Out Of The Layout Store

Replace reads of transient `mobile.surface` with `state.mobileSurface` from
`useWorkspacePaneState()`.

Replace committed writes to transient `setMobileMergedSurface` and
`clearMobileMergedSurface` with controller actions that update durable pane
state.

Keep temporary drag calculations local until release. When release settles into
a merge, write the side width and `mobileSurface` in the same state update so
refresh never sees a minimum-width side pane without its surface ownership.

### Step 4. Repair Only Current Invalid State

Add route/viewport repair for impossible current state:

- selected `"main"` with a merged surface clears the merge
- merged `"left"` without a left pane clears the merge
- merged `"right"` without a right pane clears the merge
- merged fit that cannot satisfy pane constraints clears the merge

This repair handles current impossible state only. It must not synthesize a
merge for old data or preserve fields from old clients.

### Step 5. Cover The Refresh Contract

Add route-level Playwright coverage to `workspace-sidebar-drag.spec.ts` for
`/logo?dev`, the deterministic shipped route used by the workspace sidebar drag
suite:

1. Create a right-side merge through the mobile resize gesture.
2. Wait for the persisted write to flush.
3. Refresh.
4. Assert the matching merged surface still renders and the main pane width
   remains the persisted merged width.

Do not add a symmetric left-side case for `/logo?dev` because that route does
not ship useful left-pane content. Add focused unit coverage around parser
rejection of old local-storage payloads and state equality for `mobileSurface`
changes.

## Acceptance Criteria

- Refresh preserves a settled mobile `left+main` or `main+right` surface.
- Convex and local storage both persist `mobileSurface` as its own required
  field.
- A side pane at minimum width does not imply merge unless `mobileSurface` says
  it is merged.
- Selecting the main pane clears any durable merge.
- Routes without the persisted side pane clear the impossible merge.
- Old Convex rows are cleared or patched operationally; app code does not carry
  old-row compatibility.
- Old local-storage payloads reset through the version break; app code does not
  migrate v1 payloads.
- Tests cover refresh persistence on the real route and parser/equality behavior
  for the new field.

## Non-Goals

- Adding a visible merge button in this patch.
- Renaming `WorkspaceSidebarState`.
- Generalizing the pane model beyond the current `left`, `main`, and `right`
  shell.
- Preserving old clients or old rows.
- Migrating v1 local-storage payloads.
- Inferring merge from pane width at read time.
