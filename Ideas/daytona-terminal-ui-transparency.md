# Daytona Terminal UI Transparency

## Summary

Noter should not hide all terminal/session structure just to make Daytona feel
"clean." The better direction is a transparent web terminal UI that stays simple
for normal use:

- expose enough session structure that operators can tell what is running
- prefer VS Code-like terminal tabs, splits, and top-bar actions
- avoid forcing the operator to learn tmux commands or tmux mental models
- keep the underlying session model debuggable instead of magic

This is explicitly about being transparent without making the operator learn
tmux. The target feel is "use it like VS Code's terminal," not "learn terminal
multiplexer concepts first."

## Product Intent

The operator may want to:

- see multiple shell contexts at once
- reopen or switch between long-running sessions without losing state
- understand whether a shell is a plain shell, app server, Codex session, or
  another program
- manually manage windows/splits when needed

That means fully hiding tmux-like structure is not obviously a UX win. If the
underlying runtime already has sessions/windows/panes, we should consider
surfacing a friendly version of that structure instead of pretending it does not
exist.

## What VS Code Uses

Official sources suggest the VS Code pattern is:

- `xterm.js` for the browser terminal surface
- a PTY-backed terminal process model behind it
- application-owned panel/view toolbar chrome for tabs, splitting, titles, and
  actions
- VS Code product icons (`codicons`) for the top-bar action buttons and related
  terminal chrome

The important design takeaway is that VS Code does not rely on terminal
emulation alone for tab/split UX. The terminal widget and the terminal manager
UI are separate layers.

Concretely, the official docs describe:

- terminal tabs that can be shown or hidden and positioned in the terminal view
- panel toolbar actions for creating a terminal, splitting the layout, and more
- product-icon usage for toolbar buttons rather than ad hoc iconography

## What Other Web Editors Tend To Do

Official product docs and posts point to a common split:

- VS Code Web and GitHub Codespaces inherit the VS Code terminal pattern:
  terminal tabs, split terminals, and panel toolbar actions in a desktop-style
  editor shell
- CodeSandbox's web editor is explicitly built on VS Code Web and groups
  terminals, tasks, and previews under a DevTools area
- CodeSandbox's iPad UI uses a bottom-dock style DevTools surface where the user
  switches between previews, tasks, and terminals instead of relying on dense
  multi-pane terminal layouts
- Gitpod's browser terminal goes in the opposite direction: it stays minimal,
  opens one shell per browser tab, and explicitly does not support split-view in
  the browser terminal

The useful takeaway is that web IDEs generally do one of two things:

- desktop-like editor shell: tabs + optional splits
- mobile/minimal shell: one visible terminal at a time, with easy switching

No strong evidence from official sources suggests that complex nested terminal
grids are the right default for mobile web.

## Recommended Noter UX

This should be one web app with one terminal stack. The difference is only
responsive layout behavior at different viewport sizes, not different
technologies or separate products.

If the goal is "very easy to use" and still transparent, the cleanest approach
is:

- wide layouts: copy the VS Code terminal mental model closely
- narrow layouts: simplify to one active terminal with a fast switcher

### Wide Layouts

Start with only these controls:

- terminal tabs
- `new terminal`
- `split`
- `close`
- `more`

Keep the first version intentionally constrained:

- allow at most one split level at first
- no nested pane trees
- no raw tmux commands in the primary UI
- titles should be human-readable, such as `Shell`, `App`, `Convex`, `Codex`

This gives most of the value of VS Code without importing all of its complexity.

### Narrow Layouts

Do not treat splits as a primary interaction on narrow screens. Instead:

- show one terminal at a time
- use a bottom sheet, segmented control, or horizontal session chips to switch
  terminals
- expose `new terminal` and `close` in a compact top or bottom bar
- surface common background sessions as tappable items rather than simultaneous
  panes

On narrow screens, "multiple terminals" should mean "easy switching between
persistent sessions," not "multiple panes visible at once."

## Suggested First Cut

The simplest shippable version would be:

- `xterm.js` terminal surface
- a small Noter terminal header using VS Code-like icon/button patterns
- persistent session list stored in Convex
- fixed starter sessions such as `Shell` and `App`
- wide-layout support for tabs plus one split
- narrow-layout support for tabs/sessions only, with no splits

That would cover the real need of running multiple long-lived commands in one
sandbox without making tmux itself the product surface.

## Possible Noter Direction

Start with a simple web-terminal frame that exposes:

- terminal tabs with short, user-meaningful titles
- split controls in the terminal header
- a visible active-session indicator
- optional lightweight badges for session kind, such as `shell`, `vite`,
  `convex`, or `codex`
- a way to reveal more advanced session details only when needed

Possible implementation approach:

- keep the current browser terminal surface on `xterm.js`
- keep the actual runtime/session orchestration behind the scenes
- map tmux windows/panes or equivalent runtime sessions into simple UI tabs and
  splits
- use codicon-like top-bar actions for `new terminal`, `split`, `kill`, and
  related controls
- avoid shipping raw tmux vocabulary as the primary UX unless the operator asks
  for it

## Open Questions

- Should tabs represent tmux windows directly, or a higher-level Noter session
  abstraction that can map onto tmux internally?
- Should split state persist per sandbox in Convex so it survives reconnects?
- When advanced mode is enabled, should we expose raw tmux window/pane names and
  borders directly?
- Do we want a "simple mode" and "transparent mode," or can one UI serve both
  well?
- Should mobile expose background session state as chips, a bottom sheet, or a
  lightweight task list?

## Sources

- [VS Code Terminal Docs](https://code.visualstudio.com/docs/terminal/advanced)
- [VS Code Terminal Appearance](https://code.visualstudio.com/docs/terminal/appearance)
- [VS Code Panel UX Guidelines](https://code.visualstudio.com/api/ux-guidelines/panel)
- [GitHub Codespaces: Open In Browser](https://docs.github.com/en/codespaces/developing-in-codespaces/opening-an-existing-codespace)
- [CodeSandbox: VS Code Web Editor](https://codesandbox.io/blog/a-new-and-improved-editor-powered-by-vs-code-web)
- [CodeSandbox for iPad](https://codesandbox.io/blog/how-to-code-your-app-using-the-codesandbox-ipad-ide)
- [Gitpod Browser Terminal](https://www.gitpod.io/docs/classic/user/references/ides-and-editors/browser-terminal)
- [Gitpod Tasks and Terminal Open Modes](https://www.gitpod.io/docs/configure/workspaces/tasks)
- [xterm.js](https://xtermjs.org/)
- [VS Code Codicons](https://github.com/microsoft/vscode-codicons)
- [microsoft/node-pty](https://github.com/microsoft/node-pty)
