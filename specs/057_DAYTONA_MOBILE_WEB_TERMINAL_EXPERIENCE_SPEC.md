# 057 Daytona Mobile Web Terminal Experience Spec

## Context
Noter exposes a web terminal connected to a Daytona sandbox PTY. The current implementation uses **xterm.js** in the browser.

While this works well on desktop, the experience on **mobile browsers (iOS Safari, Chrome Android)** is extremely poor:
- unreliable Enter key
- modifier keys unavailable (Ctrl, Esc, Tab, arrows)
- broken text selection
- focus loss when keyboard opens
- keyboard covering terminal

The goal of this spec is to design a **mobile‑first terminal interaction layer** without replacing the Daytona PTY architecture.

## Key Insight
The terminal renderer is not the main problem.

Most browser terminals (xterm.js, hterm, etc.) share the same limitations because mobile browsers do not provide reliable raw keyboard events.

Therefore the solution should focus on **input architecture**, not terminal rendering.

## Survey of Existing Implementations

### xterm.js
The most widely used browser terminal.
Used by:
- VS Code
- GitHub Codespaces
- code-server

Strengths:
- performant rendering
- strong PTY compatibility
- widely maintained

Weaknesses on mobile:
- relies on desktop keyboard event model
- mobile IME and composition events cause inconsistent behavior
- selection and clipboard interactions are fragile

Conclusion: **keep xterm.js** but wrap it with a mobile input system.

### CodeMirror mobile input model
CodeMirror handles mobile input using:
- hidden textarea
- composition event handling
- beforeinput events

This architecture works reliably across Android and iOS.

Conclusion: replicate a **hidden textarea input broker** for the terminal.

### Native mobile SSH clients
Examples:
- Termius
- Blink
- iSH

Common UX patterns:
- accessory key bar (Esc, Ctrl, Tab, arrows)
- dedicated selection mode
- hardware keyboard detection

Conclusion: web terminal should adopt similar UX patterns.

## Proposed Architecture

### Layer 1: PTY transport (unchanged)

Daytona PTY
↓
Websocket stream
↓
xterm.js renderer

This layer remains unchanged.

### Layer 2: Mobile input broker

Introduce a hidden textarea responsible for capturing input events.

Responsibilities:
- capture composition events
- normalize Enter behavior
- emit terminal sequences

Flow:

Keyboard → hidden textarea → input translator → xterm.write()

### Layer 3: Mobile accessory bar

Add a persistent toolbar above the keyboard with common terminal keys:

Keys:
- Esc
- Tab
- Ctrl
- Alt
- ↑ ↓ ← →
- / | ~

Pressing Ctrl toggles modifier state for next key.

### Layer 4: Selection mode

Terminal selection conflicts with scroll.

Introduce explicit selection mode:

Trigger:
- long press

Behavior:
- freeze PTY scrolling
- enable drag selection
- copy button

### Layer 5: Viewport handling

Use `window.visualViewport` to detect keyboard height.

Adjust terminal container height dynamically to avoid keyboard overlap.

### Layer 6: Hardware keyboard detection

If hardware keyboard detected:

- disable accessory bar
- enable native key events

Detection signals:
- repeated keydown events
- no viewport resize

## Rendering Considerations

Terminal rendering should remain **xterm.js** for now because:

- mature ecosystem
- strong PTY fidelity
- performance already acceptable

The investment should focus on **input and layout**, not renderer replacement.

## Future Exploration

Potential long‑term research directions:

1. canvas‑based mobile terminals optimized for touch
2. WebGPU rendering for large scrollback
3. shared input architecture with CodeMirror editors

## Recommendation

Implement a **Mobile Terminal Adapter** consisting of:

- input broker (hidden textarea)
- accessory key bar
- explicit selection mode
- viewport‑aware layout

This preserves the existing Daytona + xterm architecture while making the terminal usable on mobile.

## Success Criteria

The mobile terminal should support:

- reliable Enter key
- Ctrl based commands (Ctrl+C, Ctrl+D)
- arrow navigation
- text selection and copy
- stable focus while keyboard is open

If these are satisfied, the mobile terminal experience will be considered production ready.
