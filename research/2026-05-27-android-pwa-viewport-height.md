# Android PWA Viewport Height Refresh Notes

Date: 2026-05-27

## Problem

In an installed Android Chrome PWA, the root landing shell could be correct on first launch and
become taller than the visible screen after pull-to-refresh. The visible symptom was the public
right sidebar version row falling below the bottom of the display.

Measured failing case with raw `100dvh` after pull-to-refresh:

- `display-mode: standalone`: `true`
- `navigation.type`: `reload`
- `innerHeight`: `866px`
- `visualViewport.height`: `866.2857px`
- shell/layout/right-pane height from `100dvh`: `922.2857px`
- document overflow: `56px`
- version row bottom: `890.2857px`, below the visible viewport

The right sidebar was not the source of the bug. Its footer was pinned to the bottom of its pane;
the pane was too tall because the shell trusted a bad post-refresh viewport-unit value.

## Repo History

- `827057f75` introduced the global `AppWorkspaceShell` with `min-h-dvh` while unifying routes under
  one workspace shell.
- `c628e916f` changed the shell to `h-full min-h-0`.
- `8b19a6d03` changed it to `h-dvh`.
- `ca5e25f10` used a hydrated CSS variable from `window.visualViewport.height`. That measured
  correctly, but it adds JS layout machinery for a root sizing problem.

Global root CSS already sets:

```css
html,
body,
#root {
  height: 100%;
}
```

That makes `h-full min-h-0` a valid CSS-only shell height: the app shell fills the root document
height and the nested workspace flex tree owns scrolling internally.

## Follow-up: Do Not Restore App-Owned Pull-to-Refresh

On 2026-05-28, `c5ec86d3a` reverted `fc92f103c` (`v1414: Add iOS PWA pull refresh`) directly on
`main`. The iOS-oriented pull-to-refresh addition touched `AppWorkspaceShell`, global CSS, and a
gesture dependency. It did not work cleanly across platforms: it broke standard refresh behavior on
Android, where the browser/PWA refresh gesture needs to remain browser-owned.

Treat that revert as part of the Android PWA finding, not just a temporary rollback. Future fixes
should avoid reintroducing route-shell gesture interception or global overscroll changes as the
default refresh solution unless Android installed-PWA refresh is tested first. The safer current
product direction is an explicit refresh affordance in the top URL editor chrome so refresh is
available on all platforms without overriding native Android refresh behavior.

## External Research

Primary documentation did not turn up an exact public Chromium bug for "Android installed PWA
pull-to-refresh makes `100dvh` larger than `innerHeight`." There is a close StackOverflow report
from November 2025 describing Chrome Android standalone PWA `100dvh` producing about 50px of
vertical overscroll after initial load or refresh:

- https://stackoverflow.com/questions/79831083/chrome-pwa-no-longer-calculating-dvh-properly-on-initial-load

Relevant platform docs:

- web.dev explains that mobile viewport size is affected by browser UI, `100vh` can bleed out of the
  viewport, and `dvh` is dynamic between small and large viewport sizes. It also notes that dynamic
  viewport updates are throttled or debounced and do not update at 60fps in all browsers:
  https://web.dev/blog/viewport-units
- MDN documents that dynamic viewport units are not stable and can resize while the user scrolls. It
  also documents `vh` as equivalent to `lvh`, which can obscure content when browser UI is expanded:
  https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/length
- Chrome's Visual Viewport API docs distinguish the visual viewport from the layout viewport and
  expose `window.visualViewport.height` as the visible viewport height. That API measured the
  failing case correctly, but using it for shell sizing is more complex than necessary if CSS root
  percentage height works: https://developer.chrome.com/blog/visual-viewport-api
- Chromium issue 40891557 is a related Android report where Chrome did not respect
  `100svh`/`100dvh`, but it was tied to virtual keyboard behavior and is not the same
  pull-to-refresh case: https://issues.chromium.org/issues/40891557

## CSS Options

Rejected for the app shell:

- `100vh`: MDN documents `vh` as equivalent to `lvh`; large viewport units can be taller than the
  visible viewport on mobile.
- `100lvh`: same large viewport risk as `vh`.
- raw `100dvh`: directly reproduced as over-reporting by 56px after Android PWA pull-to-refresh.
- JS `visualViewport.height`: measured correctly, but adds event listeners, rAF scheduling, and
  hydration-only layout behavior.

Fallback candidates:

- `100svh`: safest pure viewport unit against overflow, but may underfill when browser UI retracts.
- `h-[min(100%,100dvh)] min-h-0`: CSS-only guard that keeps dynamic viewport behavior while capping
  by the root percentage height.
- `h-full min-h-0`: simplest option if the root height contract is reliable.

## Local Emulator Result

Tested local production preview with `AppWorkspaceShell` set to:

```tsx
className = "flex h-full min-h-0 flex-col bg-background text-foreground";
```

Installed `http://127.0.0.1:4173/` as an Android Chrome PWA in the emulator and opened the right
sidebar. The cleaned build was then reloaded through the Chrome DevTools Protocol so the page had
the same `navigation.type: "reload"` state as the failing case, without depending on `100dvh` or the
removed `visualViewport` CSS variable hook. ADB drag-down gestures did not trigger another native
pull-to-refresh once the root document no longer overflowed.

Post-refresh metrics:

- `display-mode: standalone`: `true`
- `navigation.type`: `reload`
- `innerHeight`: `866px`
- `visualViewport.height`: `866.2857px`
- shell/layout height: `866.2857px`
- document overflow: `0px`
- version row bottom: `834.2857px`, visible
- shell class: `flex h-full min-h-0 flex-col bg-background text-foreground`
- shell inline style: `null`

Conclusion: the simplest CSS-only fix is to remove the JS visual-viewport height hook and use
`h-full min-h-0` on `AppWorkspaceShell`.
