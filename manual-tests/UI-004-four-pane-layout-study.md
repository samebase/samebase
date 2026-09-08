# UI-004: Four-pane layout study

This path checks an experiment built on the actual sidebar package. It does not define the shipped
workspace contract.

1. Run `pnpm run dev` in the current worktree, then
   `pnpm --filter samebase exec vp dev --config vite.pane-study.config.ts`. Open
   `http://localhost:5197/pane-study.html?prod-ui`. For phone access, point a Cloudflare tunnel at
   port 5197. The page must contain exactly one `[data-sidebar-layout-part="root"]`.
2. Start a fresh iPhone 13 context with touch enabled. The page starts at the main slot with State
   selected. Edit State, select Geometry, then return to State. The edit must remain. Arrow keys
   must move focus and selection between the file tabs.
3. Select Left sidebar. Wait for the native three-dot grip. Drag it wider, return to main, and
   select Left sidebar again. Its width must remain. Drag it to the minimum and continue inward. The
   package must merge the left sidebar with the main pane. The selected editor must fit the complete
   remaining main width. Switch editor tabs in this narrow main area.
4. Drag the left grip wider to separate the panes. Repeat resize, merge, and unmerge with Right
   sidebar. Swipe from the Notes header back to main. Return to State and undo its edit. The same
   editor DOM element must remain connected. Check for page-level horizontal overflow.
5. Open a fresh desktop page. Also check the user's 1145px width. Confirm one header with a Layout
   menu and persistent sidebar toggles. There must be no explanatory footer, pane navigation row,
   reset-width button, or X buttons in pane headers.
6. Edit State and Notes. Drag the middle divider and use its arrow keys. The work editors must
   exchange width. Resize the left sidebar with its native handle. Record its width and the work
   editor ratio. Collapse both sidebars. The work editors must fill the available space and retain
   their ratio. Focus must stay on the toggle. Expand the sidebars and check their saved widths.
7. Select Tool rail. README and Notes icons must toggle their existing left and right sidebars.
   Select Editor row and scroll the main area to Geometry. Each editor must keep at least 420px.
   Return to Two work panes. At 768px, the two editors must fit the narrow main area. At 767px, the
   package switches to its mobile carousel and the editors use tabs.
8. Confirm that the same Monaco and CodeMirror elements remain connected across these changes. Undo
   both desktop edits. Collapse Notes on desktop, change to mobile, and select Notes there. Return
   to desktop. Notes must still be collapsed in desktop mode.
9. Open a fresh native WebKit mobile context. Check both file tabs, both native grip targets, and
   keyboard resize on a focused grip. Capture the three desktop layouts, both sidebars collapsed,
   the mobile grip, and the merged mobile view. Check the console for runtime failures.

These screenshots are research evidence, not product baselines. Native WebKit checks do not replace
real-device touch checks. The package still has three mobile positions; two editor tabs share main.
