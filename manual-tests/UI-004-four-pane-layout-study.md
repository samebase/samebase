# UI-004: Four-pane layout study

This path checks an experiment built on the actual sidebar package. It does not define the shipped
workspace contract.

1. Run `pnpm run dev` in the current worktree, then
   `pnpm --filter samebase exec vp dev --config vite.pane-study.config.ts`. Open
   `http://localhost:5197/pane-study.html?prod-ui`. For phone access, point a Cloudflare tunnel at
   port 5197. The page must contain one package carousel and four native pane elements.
2. Start a fresh iPhone 13 context with touch enabled. State starts selected. Edit State, then swipe
   its header left to Geometry. Geometry must fill the viewport. There must be no file tabs. Edit
   Geometry, then swipe back to State. Both edits and editor DOM instances must remain.
3. Open Left sidebar and drag its native grip wider. Return to main, then reopen Left sidebar. Its
   width must remain. Drag it to the minimum and continue inward. README must merge with State.
   Geometry must retain its full mobile width and remain reachable by swiping left.
4. Enter Geometry from the merged pair. The merge must clear and Geometry must align with the
   viewport. Repeat with Right sidebar: Notes merges with Geometry, while State remains a separate
   full-width swipe position. Enter State and check alignment after the merge clears.
5. Check a merge exit through the opposite sidebar. Merge README with State, use Right sidebar, then
   swipe from Notes back to Geometry. Geometry must align after State expands. Repeat in the other
   direction after merging Notes with Geometry. Editing inside a merged pair must preserve the
   merge.
6. Open a sidebar from Geometry, then close it with the same toggle. Geometry must return. Undo both
   earlier edits in their original editors. Confirm that all editor elements stay mounted.
7. Open a fresh desktop page. Also check the user's 1145px width. The header has a Layout menu and
   persistent sidebar toggles. There is no helper footer, pane navigation row, reset-width button, X
   button, or full-screen action.
8. Drag the center divider and use its arrow keys. Resize the left sidebar with its native handle.
   Collapse both sidebars. The work panes must fill the available space and keep their ratio. Expand
   the sidebars and check their saved widths and editor text.
9. Select Tool rail, then Editor row. Rail icons toggle the existing sidebars. In Editor row, each
   main editor keeps at least 420px and the main group scrolls. Return to Two work panes. At 768px,
   both editors fit the desktop main group. At 767px, they have separate mobile swipe positions.
10. Start native WebKit with mobile emulation. Check four pane elements, main scroll alignment,
    return to the last main pane, and both native grip targets. Capture the desktop choices,
    collapsed sidebars, both mobile main positions, the mobile grip, and a merged pair. Check the
    console for runtime failures.

These screenshots are research evidence, not product baselines. Chromium touch input checks and
WebKit scroll checks do not replace real-device testing.
