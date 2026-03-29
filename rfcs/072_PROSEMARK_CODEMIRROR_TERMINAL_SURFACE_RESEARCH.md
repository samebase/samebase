# 072 ProseMark / CodeMirror Terminal Surface Research

## Document Control

- Status: Research note
- Owner: Noter product/frontend
- Last updated: 2026-03-29
- Related specs:
  - `specs/057_DAYTONA_MOBILE_WEB_TERMINAL_EXPERIENCE_SPEC.md`
  - `specs/050_T3_CODE_REFERENCE_ARCHITECTURE_SPEC.md`
  - `specs/010_DAYTONA_SANDBOX_INTEGRATION_SPEC.md`

## Question

Should Noter build something terminal-like on top of CodeMirror / ProseMark so
it feels much better on mobile web, and if so should that replace `xterm.js` or
complement it?

## Short Answer

Not as a full `xterm.js` replacement.

The best direction is a hybrid:

1. keep `xterm.js` for raw PTY fidelity and full-screen terminal apps
2. explore a CodeMirror-first shell surface for mobile-friendly command entry,
   transcript reading, selection, and copy
3. treat ProseMark as a presentation layer on top of CodeMirror, not as the
   terminal emulator itself

## Why This Research Exists

The accepted source of truth today is
`specs/057_DAYTONA_MOBILE_WEB_TERMINAL_EXPERIENCE_SPEC.md`, which says Noter
should keep `xterm.js` and improve the mobile input layer around it.

That is still the current product direction.

This research asks a different follow-up question:

- if the main pain is mobile interaction, could a CodeMirror / ProseMark surface
  become the primary shell UI on phones and small tablets?

This RFC does not replace the current spec. It evaluates whether Noter should
add a second, more mobile-native terminal surface on top of the existing Daytona
PTY architecture.

## Current Noter State

### Existing terminal surface

Noter already ships a real browser terminal:

- `apps/noter/src/components/DaytonaPtyTerminal.tsx`
- dependencies:
  - `@xterm/xterm`
  - `@xterm/addon-fit`

The current component:

1. opens a Daytona PTY websocket
2. mounts `xterm.js`
3. resizes the remote PTY from the browser terminal dimensions
4. sends keystrokes directly to the socket

This is a real PTY terminal, not a command runner or transcript widget.

### Existing CodeMirror / ProseMark surface

Noter also already has a deep CodeMirror stack:

- `@codemirror/state`
- `@codemirror/view`
- `@codemirror/collab`
- `@prosemark/core`
- `apps/noter/src/components/prosemarkSurface.ts`
- `apps/noter/src/components/ProsemarkReadOnly.tsx`

That matters because Noter already knows how to:

- theme CodeMirror deeply
- use widgets and decorations for rendered syntax
- make text surfaces feel app-native
- run collaborative text editing on top of CodeMirror

## Research Findings

### 1. What `xterm.js` is uniquely good at

According to the official `xterm.js` README, `xterm.js` is meant to bring a
fully-featured terminal into the browser, and "terminal apps just work",
including `bash`, `vim`, `tmux`, curses apps, and mouse events.

The same README also highlights:

- a mature addon ecosystem
- browser support across modern Chrome, Edge, Firefox, and Safari
- `@xterm/headless` for server-side terminal state tracking
- a serialize addon for restoring terminal state

Research implication:

- replacing `xterm.js` means replacing far more than a text area
- it means reproducing terminal emulation behavior, screen buffering, cursor
  movement, alternate screen handling, mouse reporting, and a large ANSI / VT
  state machine

Assessment:

`xterm.js` is still the right primitive when Noter needs an actual terminal.

### 2. The mobile pain is real and upstream-documented

Official `xterm.js` issue tracker evidence:

- issue `#1101` describes buggy iPad Smart Keyboard support and explicitly calls
  out arrow keys not working
- that same issue proposes relying on the terminal's hidden textarea and native
  iOS behavior rather than raw desktop-style key handling
- issue `#3727` remains open and reports that copy and paste do not work on
  touch devices, including iPad / iPhone Safari

Research implication:

- Noter's mobile terminal pain is not accidental app code
- some of the rough edges are long-standing browser-terminal interaction
  problems

Assessment:

The strongest critique of the current `xterm.js` path is mobile interaction, not
terminal fidelity.

### 3. CodeMirror is a strong substrate for mobile-first text interaction

Official CodeMirror site and docs currently state:

- CodeMirror has "Mobile Support" and uses the platform's native selection and
  editing behavior on phones
- the editor DOM is built around a `contenteditable` `.cm-content` surface
- CodeMirror supports view plugins, decorations, widgets, line decorations, and
  replace decorations
- CodeMirror supports collaborative editing through `@codemirror/collab`

The most relevant architectural consequence is that CodeMirror is not just a
plain code editor widget. It is a programmable text surface with:

- native-feeling mobile selection
- programmable inline and block widgets
- immutable state and transaction mapping
- a flat text model that lines up well with terminal transcripts

An especially relevant data point from the official CodeMirror forum:

- the author of `jQuery Terminal` reported that their Android terminal input
  issue behaved worse in older editor approaches but "works fine on CodeMirror
  6"
- Marijn Haverbeke pointed directly to the `@codemirror/view` input and DOM
  handling modules as the place where mobile editing behavior lives

Assessment:

CodeMirror is a credible base for a mobile-friendly shell surface.

### 4. ProseMark helps presentation more than emulation

Official ProseMark docs describe ProseMark as "a set of extensions for, not a
replacement of, CodeMirror."

Its strength is not terminal emulation. Its strength is rendering markdown in a
"what you see is what you mean" style by combining:

- CodeMirror extensions
- fold / hide extensions
- widgets
- themed rendered syntax

Research implication:

- ProseMark is useful if Noter wants shell transcripts to look readable and
  document-like
- ProseMark is not a substitute for a terminal parser or screen model

Assessment:

If this direction happens, ProseMark should style transcript blocks, prompts,
inline command docs, or notebook-like output. It should not own raw PTY
semantics.

### 5. CodeMirror fits terminal transcripts better than ProseMirror-style trees

This matters because "ProseMark-based" can easily sound like
"ProseMirror-based." They are not the same thing.

In practice:

- CodeMirror uses a flat text model
- terminal output is fundamentally a stream that becomes lines plus cursor state
- ProseMirror is a structured rich-text document model

For raw terminal behavior, a tree-structured rich-text editor is the harder fit.
The official ProseMirror forum also shows ongoing mobile/browser-keyboard edge
cases across Android and WebView combinations.

Assessment:

If Noter wants a terminal-like surface on this stack, CodeMirror should be the
core primitive. ProseMark should stay optional and presentation-oriented.

## Important Clarification Relative To Spec 057

`specs/057_DAYTONA_MOBILE_WEB_TERMINAL_EXPERIENCE_SPEC.md` correctly identifies
that mobile input architecture matters more than terminal rendering.

This research slightly refines the technical framing:

- CodeMirror 6's current public architecture is contenteditable-based
- the value to borrow is not "use the same hidden textarea implementation"
- the value to borrow is "use a mobile-native editing surface and programmable
  editor state instead of relying only on desktop-style terminal key events"

This does not invalidate spec 057's product conclusion. It sharpens how Noter
should think about the alternative.

## Product Decomposition

The phrase "terminal on mobile" actually hides two different products.

### Product A: real terminal emulator

Must support:

- shells like `bash`, `zsh`, `fish`
- full-screen apps like `vim`, `less`, `top`, `htop`, `tmux`
- cursor addressing
- alternate screen
- bracketed paste
- ANSI styling
- resize behavior
- mouse reporting for terminal apps

Best current fit:

- `xterm.js`

### Product B: shell interaction surface

Must support:

- entering commands comfortably on phones
- seeing readable command/output history
- selecting and copying output reliably
- preserving history across reconnects
- accessory keys like `Esc`, `Tab`, arrows, and `Ctrl`
- ideally blending with chat / agent surfaces instead of feeling like an iframe

Best candidate fit:

- CodeMirror, optionally styled with ProseMark-like presentation techniques

The research conclusion is that Noter should not confuse Product A with Product
B.

## Options Considered

### Option A. Keep `xterm.js` and improve input only

Pros:

- matches current accepted spec
- preserves terminal fidelity
- lowest architectural risk
- no new parsing model required

Cons:

- mobile still inherits canvas / terminal selection awkwardness
- transcript readability remains terminal-like rather than document-like
- shell history and copy flows stay constrained by terminal semantics

Assessment:

Still a good baseline and still worth doing regardless.

### Option B. Replace `xterm.js` entirely with CodeMirror / ProseMark

Pros:

- strongest mobile-native interaction potential
- easiest path to beautiful transcript presentation
- easiest path to app-level selection, annotations, and durable history

Cons:

- would require a terminal parser and screen model, not just an editor
- high risk of breaking `vim`, `tmux`, curses apps, and alternate-screen flows
- recreates years of terminal-compatibility work that `xterm.js` already owns

Assessment:

Too risky as a wholesale replacement.

### Option C. Hybrid shell surface plus raw terminal fallback

Shape:

1. keep the existing Daytona PTY transport
2. add a new CodeMirror shell surface for line-oriented command work
3. preserve `xterm.js` as "raw terminal mode"
4. switch to raw mode whenever fidelity requirements exceed the transcript model

Pros:

- best mobile ergonomics
- preserves escape hatch for real terminal workloads
- aligns with `specs/050_T3_CODE_REFERENCE_ARCHITECTURE_SPEC.md`, which says
  terminal should stay a secondary tool rather than the primary app surface
- gives Noter a path toward a web-first shell UI without discarding real PTY
  support

Cons:

- more product complexity than a single surface
- requires a clean mode boundary
- requires structured transcript modeling instead of blindly forwarding bytes

Assessment:

Best long-term direction.

## Recommended Direction

Build a hybrid, not a replacement.

### Recommendation in one sentence

Treat CodeMirror as the mobile-first shell and transcript UI, while keeping
`xterm.js` as the raw PTY view for compatibility-heavy terminal workloads.

### Why this is the best fit for Noter

1. it preserves the current accepted `xterm.js` path instead of fighting it
2. it uses existing Noter strengths in CodeMirror and rendered text surfaces
3. it matches the repo's broader web-first direction where raw terminal should
   be an escape hatch, not the whole interface
4. it gives mobile users a materially better experience without pretending a
   terminal emulator is "just text"

## Proposed Architecture

### Layer 1. PTY transport stays the same

Keep:

- Daytona PTY session
- websocket transport
- resize API
- raw byte stream

This means the backend contract does not need a flag day.

### Layer 2. Add a terminal state adapter

A CodeMirror shell surface should not parse raw PTY bytes by hand in the
browser.

Two viable adapter shapes:

### Adapter shape A: server-side `xterm` state

Use `@xterm/headless` server-side to consume the PTY stream and maintain
terminal state there.

Potential benefits:

- reuse `xterm`'s parser instead of inventing one
- keep a recoverable state model on reconnect
- derive transcript snapshots or serialized content from a real emulator

### Adapter shape B: shell-integrated transcript protocol

Introduce a shell-side helper that emits structured events for:

- prompt start
- user command
- stdout chunk
- stderr chunk
- command end
- cwd / branch / exit status

Potential benefits:

- simpler UI model
- better semantic transcript blocks
- easier to store and sync in Convex

Tradeoff:

- not a general terminal protocol
- requires custom shell integration

Research judgment:

Adapter shape A is safer if Noter wants to stay close to true terminal behavior.
Adapter shape B is cleaner if Noter explicitly wants a shell-first product, not
a full terminal.

### Layer 3. CodeMirror shell UI

The CodeMirror surface can own:

- editable current command line
- scrollable transcript
- native mobile selection / copy
- accessory key bar
- command history UI
- inline widgets for prompts, exit codes, elapsed time, cwd, or branch
- durable, restorable state

This is the part where ProseMark-style rendering may help:

- prompts can render as semantic blocks instead of raw ANSI-colored lines
- fenced-code-like output blocks can look cleaner than raw terminal rows
- markdown or rich output can be displayed in a more readable way

### Layer 4. Raw mode fallback

Whenever the session enters a high-fidelity terminal state, switch to the real
terminal surface:

- alternate screen
- `vim`
- `tmux`
- TUIs
- interactive pagers
- anything using cursor addressing that no longer maps cleanly to a transcript

This fallback should be explicit and fast.

The product framing should be:

- shell mode for "get work done on mobile"
- raw mode for "I need a real terminal now"

## Phased Delivery Plan

### Phase 0. Ship the current spec 057 work

Do not block existing mobile terminal improvements.

That work remains valuable even if the hybrid path happens later.

### Phase 1. CodeMirror command composer in front of `xterm.js`

Smallest experiment:

- keep `xterm.js` output visible
- add a mobile-first CodeMirror input surface for command entry
- send submitted commands to the PTY
- keep accessory key bar and keyboard-safe layout in app-owned UI

This tests whether the input problem is the dominant mobile pain.

### Phase 2. Read-only transcript mode

Add a CodeMirror transcript fed by structured output or parsed terminal state.

Keep raw mode one tap away.

This tests whether transcript readability and selection materially improve the
experience.

### Phase 3. Full hybrid shell mode

Promote the CodeMirror shell surface to the default mobile UI when the session
is line-oriented.

Auto-switch or suggest switching to raw mode for compatibility-heavy cases.

## Decision Matrix

| Option                              | PTY fidelity     | Mobile input              | Mobile selection/copy | Implementation risk | Fit with current repo direction |
| ----------------------------------- | ---------------- | ------------------------- | --------------------- | ------------------- | ------------------------------- |
| Keep `xterm.js` only                | High             | Medium after adapter work | Low to medium         | Low                 | Strong                          |
| Replace with CodeMirror / ProseMark | Low to uncertain | High                      | High                  | Very high           | Weak                            |
| Hybrid                              | High             | High                      | High                  | Medium              | Strong                          |

## Open Questions

1. Should the first hybrid milestone target only phones, or phones plus tablet
   portrait?
2. Is shell mode acceptable only for line-oriented usage, or does the product
   expect `vim`/`tmux` on mobile too?
3. Should the structured transcript be derived from `@xterm/headless` state or
   from shell-level semantic events?
4. Does Convex become the durable transcript store, or is transcript state
   strictly session-local at first?
5. Should ProseMark be used only for read-only transcript rendering, or also for
   editable prompt-adjacent rich content such as notes and runbooks?

## Recommendation For The Next Concrete Step

Do not begin by rewriting the terminal renderer.

Instead:

1. keep executing `specs/057_DAYTONA_MOBILE_WEB_TERMINAL_EXPERIENCE_SPEC.md`
2. prototype a CodeMirror-based command composer and transcript pane beside the
   existing `xterm.js` session
3. measure whether mobile command entry, selection, and copy improve enough to
   justify a deeper hybrid shell mode

That is the smallest experiment that can validate the idea without discarding
the repo's current terminal architecture.

## Sources

### Local repo sources

- `apps/noter/src/components/DaytonaPtyTerminal.tsx`
- `apps/noter/src/components/prosemarkSurface.ts`
- `apps/noter/src/components/ProsemarkReadOnly.tsx`
- `apps/noter/package.json`
- `specs/057_DAYTONA_MOBILE_WEB_TERMINAL_EXPERIENCE_SPEC.md`
- `specs/050_T3_CODE_REFERENCE_ARCHITECTURE_SPEC.md`
- `specs/010_DAYTONA_SANDBOX_INTEGRATION_SPEC.md`

### External sources

- `xterm.js` README:
  [https://github.com/xtermjs/xterm.js](https://github.com/xtermjs/xterm.js)
- `xterm.js` issue `#1101` mobile keyboard discussion:
  [https://github.com/xtermjs/xterm.js/issues/1101](https://github.com/xtermjs/xterm.js/issues/1101)
- `xterm.js` issue `#3727` touch copy/paste bug:
  [https://github.com/xtermjs/xterm.js/issues/3727](https://github.com/xtermjs/xterm.js/issues/3727)
- CodeMirror homepage: [https://codemirror.net/](https://codemirror.net/)
- CodeMirror system guide:
  [https://codemirror.net/docs/guide/](https://codemirror.net/docs/guide/)
- CodeMirror decoration example:
  [https://codemirror.net/examples/decoration/](https://codemirror.net/examples/decoration/)
- CodeMirror collaborative editing example:
  [https://codemirror.net/examples/collab/](https://codemirror.net/examples/collab/)
- CodeMirror forum thread about mobile editing internals:
  [https://discuss.codemirror.net/t/where-can-i-find-code-responsible-for-editing-on-mobile/3666](https://discuss.codemirror.net/t/where-can-i-find-code-responsible-for-editing-on-mobile/3666)
- ProseMark docs: [https://prosemark.com/](https://prosemark.com/)
- ProseMark getting started guide:
  [https://prosemark.com/guides/getting-started/](https://prosemark.com/guides/getting-started/)
- ProseMark fold/hide/theme extensions:
  [https://prosemark.com/reference/fold-hide-theme-extensions/](https://prosemark.com/reference/fold-hide-theme-extensions/)
- ProseMirror homepage: [https://prosemirror.net/](https://prosemirror.net/)
- ProseMirror mobile/browser-keyboard discussion examples:
  [https://discuss.prosemirror.net/t/samsung-keyboard-within-android-webview-causes-a-spam-of-new-lines/5246](https://discuss.prosemirror.net/t/samsung-keyboard-within-android-webview-causes-a-spam-of-new-lines/5246)
  [https://discuss.prosemirror.net/t/input-error-when-ime-prediction-is-turned-on/6515](https://discuss.prosemirror.net/t/input-error-when-ime-prediction-is-turned-on/6515)
