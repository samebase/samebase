# UI-004: Four-pane layout study

This path checks an experimental fixture. It does not define the shipped workspace contract.

1. Run `pnpm run dev` in the current worktree. Open `/visual-fixture?mode=pane-layout-explorer` on
   the reported origin. For the separate phone demo, run
   `pnpm --filter samebase exec vp dev --config vite.pane-study.config.ts` after worktree setup.
   Point a Cloudflare tunnel at port 5197 and open `/pane-study.html?prod-ui`.
2. Start at the normal desktop viewport. Also check the user's 1145px width. Confirm that the page
   has one header, a Layout menu, and persistent sidebar toggles. There must be no explanatory
   footer, pane navigation row, reset-width button, or X buttons in pane headers.
3. Edit Source and Notes. Select text in Source with the mouse. Drag the middle divider, then use
   its arrow keys. Confirm that the work panes exchange width. Resize Outline and record its width
   and the work-pane ratio. Make one continuous drag until both work panes reach their minimum.
4. Use Left sidebar and Right sidebar to collapse both sidebars. Confirm that Source and Reference
   fill the width and keep their ratio. Confirm that keyboard focus stays on the toggle. Expand both
   sidebars. Their widths and editor text must remain. Undo each edit in its original editor.
5. Open Layout and select Tool rail. Select Notes in the rail. Press the selected icon to collapse
   its slot, then use Left sidebar to expand it. Switch tools. Both code panes must stay mounted.
6. Select Pane row. Use native horizontal scrolling to reach each file. Resize Notes, collapse it,
   and scroll to the end. Reference must align at the start without an extra blank screen. Expand
   Notes. Its row width must remain. Return to Two work panes and confirm that the previous sidebar
   widths and work split remain.
7. Collapse Notes on desktop. Change to mobile width and select Notes with Right sidebar. It must
   remain available. Return to desktop and confirm that Notes is still collapsed there.
8. Start a fresh iPhone 13 context with touch enabled. The page starts at Source. Left sidebar must
   select Outline, then return to Source. Swipe on the Source header to reach Reference. Right
   sidebar must select Notes, then return to Reference. Repeat the sidebar selection in Tool rail.
9. Capture all three layouts and the mobile view. Confirm that the same Monaco and CodeMirror
   elements remain connected across layout changes. Check the console for runtime failures.

These screenshots are research evidence, not product baselines. This experiment does not yet use
mobile resize-to-merge from the package. Horizontal swipes inside Monaco stay in the editor; use its
pane header to move the row.
