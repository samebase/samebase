---
name: route-ui-validation
description:
  Validate real shipped UI routes and interaction states. Use when implementing, reviewing, or
  debugging frontend work involving route shells, page layout, scroll, touch, drag, focus,
  selection, editors, visual baselines, screenshots, responsive behavior, pending states, or
  user-visible route/query behavior.
---

# Route UI Validation

Use this when user-visible UI behavior matters. Validate the route and state the user will actually
experience.

## Route Evidence

- Open the exact route, path, query params, account state, and mode under discussion. Preserve
  unrelated query params when changing a URL.
- Prefer a real app route. Use a production-component harness only when it mounts the same component
  tree without invented wrapper chrome, spacing, labels, or fake product state.
- For production interaction regressions, create a failing real-route or honest production-component
  repro before relying on a narrower fixture.
- After choosing the validation path, load the repo or app overlay for startup commands, auth setup,
  browser/session tooling, route modes, and visual baseline rules.
- Report the exact URL reached, the important state changes observed, and any blocker that prevented
  validation.

## Interaction Checks

- Check desktop and mobile states when behavior differs.
- For desktop/mobile differences, validate both the route state and the transition mechanism, such
  as scroll, touch, focus, editor selection, pane selection, or responsive shell state.
- Probe the live interaction point: hover, focus, keyboard, touch, drag, selection, editability,
  disabled or pending states, and scroll-end alignment when those are relevant.
- For editability checks, prefer non-mutating probes when possible: intercept the input event,
  prevent the write, confirm the content remains unchanged, and verify no write request fired.
- Preserve browser-owned page scroll unless the route intentionally needs contained panes.
- Verify text does not overlap or overflow its parent at relevant viewport sizes.
- Re-snapshot after navigation, responsive changes, or major DOM changes before drawing conclusions.

## Screenshot And Visual Evidence

- Add or update screenshot coverage when shipped UI changes.
- Use before/after or diff images when screenshot or visual-regression work changes images.
- Do not approve fake visual fixtures as product behavior.
- Treat local screenshots as diagnostic unless the repo overlay says they are the authoritative
  baseline path. Keep runner, platform, and app startup instructions in overlays.

## Research Notes

Derived from `research/2026-05-23-agent-context-experiment-results-3.md`.
