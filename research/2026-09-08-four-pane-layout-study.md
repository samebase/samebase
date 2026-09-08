# Four-pane layout study

This is an experiment, not an accepted layout contract. The package already exists as
`@samebase/sidebars`. Its layout API and state still name left, main, and right panes.

## Recommendation

Start with two work panes between two utility panes. Use persistent sidebar toggles, as in Samebase
and sidebars-example. A desktop toggle collapses its sidebar and keeps its saved width. Both work
panes use the released space and keep their chosen split.

The important distinction is between a pane and its current presentation. A pane keeps its editor,
document, undo history, and identity when the layout gives it less space or hides it.

## Three working options

The fixture is `/visual-fixture?mode=pane-layout-explorer`. It uses the package's `PaneFrame` and
Samebase's real Monaco and CodeMirror/ProseMark components. The experimental row layout lives in the
app fixture. It does not change the package's three-pane layout or its public API.

The same component also has a standalone Vite development entry at `/pane-study.html`. After
worktree setup, run `pnpm --filter samebase exec vp dev --config vite.pane-study.config.ts`. It uses
port 5197 and its own dependency cache. Point a Cloudflare tunnel at that port to compare the
layouts on a phone. It mounts the editors and theme directly, without app routes or backend access.
The app fixture remains local-only.

| Option         | Arrangement                                        | Use                                                             | Cost                                                                                    |
| -------------- | -------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Two work panes | Outline / Source / Reference / Notes               | Compare two documents while keeping context and notes visible.  | At 1280px, each code pane has about 410px. Close a utility pane for wider work.         |
| Tool rail      | Icon strip / Outline or Notes / Source / Reference | Give the code panes more space when only one utility is needed. | Outline and Notes cannot appear together. The strip is navigation, not a fourth editor. |
| Pane row       | Four panes, each initially 420px wide              | Keep stable reading widths and use horizontal scrolling.        | Some panes sit outside the window and require horizontal scrolling.                     |

The page has one header with a layout menu and sidebar toggles. It has no extra pane navigation row,
reset-width button, explanatory footer, or close buttons in pane headers. The editors load the
package's README, state types, and geometry source as text. Notes starts empty.

The controls follow
[ExampleSidebarLayout](../apps/sidebars-example/src/sidebars/ExampleSidebarLayout.tsx#L22), which
keeps its panel buttons visible and exposes their state with `aria-pressed`.
[AppSidebarLayout](../apps/samebase/src/components/AppSidebarLayout.tsx#L35) uses the same panel
icons in its main header. Desktop open state is separate from mobile selection. On mobile, a sidebar
toggle selects that pane. Pressing it again returns to the last work pane. All four panes remain in
the swipe order, including sidebars collapsed on desktop.

In Tool rail, the left toggle collapses the selected tool slot. Selecting a different rail icon
opens that tool. Pressing the selected icon toggles the slot. The mobile row contains all four
panes.

The middle divider exchanges width between the work panes. An outer divider changes its sidebar
width and lets the work area fill the remaining space. In the row model, each divider changes one
pane's width. Arrow keys resize a focused divider by 16px. Shift plus an arrow key uses 64px. Row
widths are separate from the widths and split used in the other layouts.

The rail model is an application of the distinction in
[VS Code's layout documentation](https://code.visualstudio.com/docs/configure/custom-layout#_primary-side-bar):
the Activity Bar selects a view in the Primary Side Bar. Editor groups are a separate layout
decision. An icon strip alone does not provide another simultaneous editing area.

## What the earlier attempts tell us

- The
  [peer-pane experiment](https://github.com/samebase/samebase/blob/110124735/apps/samebase/src/components/WorkspacePeerPaneRoutePage.tsx#L22)
  already supported four and five panes with adjacent resizing. Its separate desktop and mobile
  trees mounted each editor twice. This study keeps one tree.
- The
  [trail experiment](https://github.com/samebase/samebase/blob/31f7a82d7/apps/samebase/src/components/workspace-layout-v3/WorkspaceLayoutV3Geometry.ts#L13)
  used collapsed rails and automatic restoration. Those rules add choices about which pane loses
  space. This study uses the app's explicit sidebar toggles so that we can judge the basic layout.
- Nesting two complete `SidebarLayout` instances would leave two active-pane states and two gesture
  handlers. A future four-pane package should use one ordered pane list and one gesture handler for
  the whole workspace.

## Browser findings

Manual Playwright checks ran against the local fixture in Chromium. Desktop checks used the normal
1280px viewport and the user's 1145px viewport. Mobile checks used a fresh iPhone 13 touch-emulated
context. These images are experiment evidence, not Linux screenshot baselines.

- The same Monaco and CodeMirror DOM instances remain connected across layout switches.
- Monaco edits and undo history survive all three layout choices. CodeMirror edits and undo history
  survive collapsing and expanding Notes.
- Collapsing both sidebars fills the available width with the work panes. Expanding a sidebar
  restores its saved width. The work-pane ratio stays the same. Keyboard focus remains on the
  toggle.
- Pointer and keyboard resize change the middle split and outer sidebar widths.
- Collapsing Notes in the row model makes Reference the last pane. It can align at the start without
  adding an extra blank screen. Native horizontal scrolling provides row navigation.
- Sidebar controls select mobile panes and return to the last work pane. Header swipes reach
  Reference. A desktop collapse remains saved after moving to mobile, selecting that sidebar, and
  returning to desktop.
- A horizontal swipe from Monaco stays in the editor in this prototype. Use its pane header to move
  the row. Generalizing the package's gesture handling remains necessary before production adoption.

The iPhone user agent in Chromium also reports `Canceled` promises from Monaco 0.55.1's
[WebKit clipboard workaround](https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/esm/vs/platform/clipboard/browser/clipboardService.js).
The exact stack cancels an unsettled clipboard-write promise on the next click or key press. It does
not cancel an editor model or pane resize. The focused check records that identified stack
separately from other page errors. Native WebKit behavior is not verified by this Chromium run.

Moving keyed editor subtrees exposed a second constraint. React 19.2.6 development Strict Mode
[replays effects for moved subtrees](https://github.com/facebook/react/blob/v19.2.6/packages/react-reconciler/src/ReactFiberWorkLoop.js#L5007).
The installed `@monaco-editor/react` 4.7.0
[cleanup disposes its editor](https://github.com/suren-atoyan/monaco-react/blob/v4.7.0/src/Editor/Editor.tsx#L246)
but retains its ref and ready state. In the failing experiment, the replay called `setModel` on that
disposed editor. Stable React keys alone did not protect the editor.

The fixture keeps a stable DOM order and uses CSS to place Notes in the left tool slot. It uses
[`reading-flow: flex-visual`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/reading-flow)
to match keyboard order to the visual order. The Chromium keyboard check passes. This CSS feature
has limited browser availability, so this experiment does not prove keyboard order in every browser.
A production package change must resolve both the editor lifecycle and browser support.

At less than 900px, all three options use the same ordered carousel. That threshold and the demo
widths are experiment settings. They are not proposed package limits. This study reuses `PaneFrame`
and the app's button and menu components. It still uses the four-pane experiment's geometry because
`SidebarLayout` accepts only left, main, and right slots. It does not implement the package's mobile
resize-to-merge behavior. Edits and widths are local to the page, and reload resets them.

## Next package decision

If the two-work-pane model is selected, model panes by stable IDs in an ordered collection. Keep the
active pane, open sidebars, and pane widths separate. Use one renderer for desktop and mobile. Keep
application navigation outside that model. Prove mobile editor gestures, selection, focus, and
resize before replacing the current layout.

The manual path is recorded in [UI-004](../manual-tests/UI-004-four-pane-layout-study.md).

## Captures

Two work panes at the user's 1145px width:

![Two work panes](./assets/four-pane-study/split.png)

Both sidebars collapsed:

![Both sidebars collapsed](./assets/four-pane-study/sidebars-closed.png)

Tool rail:

![Tool rail](./assets/four-pane-study/rail.png)

Pane row:

![Pane row](./assets/four-pane-study/row.png)

Mobile carousel with Reference selected:

![Mobile carousel](./assets/four-pane-study/mobile.png)
