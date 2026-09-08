# UI-004: Four-pane layout study

This path checks an experimental fixture. It does not define the shipped workspace contract.

1. Run `pnpm run dev` in the current worktree. Open `/visual-fixture?mode=pane-layout-explorer` on
   the reported origin. For the separate phone demo, run
   `pnpm --filter samebase exec vp dev --config vite.pane-study.config.ts` after worktree setup.
   Point a Cloudflare tunnel at port 5197 and open `/pane-study.html?prod-ui`. This entry does not
   change the app fixture's local-only policy.
2. Use desktop viewports at 1000px, 1280px, and 1440px. Confirm that Outline, Source, Reference, and
   Notes are visible in Two work panes.
3. Edit Source and Notes. Select text in Source with the mouse. Confirm that selection does not move
   the row. Resize the divider between Source and Reference. Confirm that the two widths change by
   equal and opposite amounts.
4. Focus the same divider with the keyboard. Use the arrow keys. Confirm that it resizes the same
   two panes. Resize Outline, then close both sidebars with their header buttons. Confirm that the
   two work panes fill the available width. Keyboard focus must move to the Source selector. Reopen
   each sidebar by its pane button. Confirm that Outline keeps its saved width and Notes keeps its
   edit. Return to each editor and undo its edit.
5. Select Tool rail. Use its icons to switch between Outline and Notes. Confirm that both code panes
   stay visible. Close the selected tool and confirm that the tool slot disappears. Its icon must
   show an unselected state. Reopen Notes and resize it while it occupies the left slot. Confirm
   that Source is its adjacent pane. Tab from the last rail icon into the panes. Confirm that Notes
   receives focus before Source. This check depends on CSS `reading-flow` support.
6. Select Pane row. Use the pane buttons to bring each pane into view. Try horizontal trackpad
   scrolling and mouse text selection. Resize Notes, close it, then select Reference. Confirm that
   Reference aligns at the start and no extra blank screen follows it. Reopen Notes and confirm that
   its width stays the same.
7. Start a fresh mobile context with touch enabled. Swipe horizontally on a pane header. Confirm
   that the row stops at the next pane and the pane selector follows it. Check all four pane
   buttons, including Notes at the end of the row. Close Notes, confirm that Source becomes active,
   then reopen Notes. Confirm that its text remains and its header aligns at the start.
8. Swipe inside CodeMirror, then Monaco. Record which editor lets the row move. The current
   prototype supports CodeMirror swipes. Monaco needs the header swipe or pane buttons.
9. Capture the three desktop choices and the settled mobile view. Reload and confirm that the demo
   starts with its original text.

Use these checks for design comparison. Do not add the experiment screenshots to the product
baseline suite.
