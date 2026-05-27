# Draft: `100dvh` Can Be Bigger Than the Visible Viewport in Android Installed PWAs

Date: 2026-05-28

This is a draft for a public article and a shorter tweet/thread. It is intentionally concrete: the
point is to preserve the actual reproduction path, the measured values, and the testing caveats
instead of turning this into a vague "mobile viewport units are hard" note.

## Short Version

I ran into a case where `100dvh` was not just unstable on mobile. In an installed Android Chrome
PWA, after a standalone refresh, an element sized with `height: 100dvh` became about `56px` taller
than `window.innerHeight` and `window.visualViewport.height`.

The visible bug was simple: a footer pinned to the bottom of the app shell fell below the screen and
the document became vertically scrollable.

The surprising part was the matrix:

- Android Chrome tab: fine.
- iOS "Add to Home Screen" from Chrome: fine.
- Android installed PWA, first launch: fine.
- Android installed PWA, after pull-to-refresh or standalone reload: broken with raw `100dvh`.

The fix in our app was not a `visualViewport` JavaScript height hook. The simpler fix was to stop
using viewport units for the shell and use the existing root height contract:

```css
html,
body,
#root {
  height: 100%;
}

.app-shell {
  height: 100%;
  min-height: 0;
}
```

That kept the app shell at the visible standalone viewport height after reload and removed document
overflow.

## Why This Is Worth Raising

The promise of `dvh` is that it represents the dynamic viewport: the current viewport size as
browser UI appears and disappears. The docs do warn that dynamic viewport units are unstable and can
be throttled or debounced during scroll. That is understandable.

What surprised me is stronger than "updates are not perfectly smooth." In the failing Android PWA
case, `100dvh` resolved to a height that was larger than both:

- `window.innerHeight`
- `window.visualViewport.height`

For app shells, this is a sharp failure mode. A shell is often:

```css
.shell {
  height: 100dvh;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  overflow: hidden;
}
```

If `100dvh` over-reports by even 50px, a bottom nav, toolbar, or footer can be rendered below the
actual screen. Users then get a page that unexpectedly scrolls just to reach the supposedly fixed
bottom UI.

## What We Saw

The original app had a full-height workspace shell with a main pane and side panes. On mobile, the
right sidebar has a version row at the bottom. That row is a good canary: if it is visible, the pane
height matches the screen; if it falls below the screen, the pane or shell is too tall.

Measured failing case with raw `100dvh` after Android installed-PWA pull-to-refresh:

```text
display-mode: standalone: true
navigation.type: reload
window.innerHeight: 866px
window.visualViewport.height: 866.2857px
shell/layout/right-pane height from 100dvh: 922.2857px
document overflow: 56px
version row bottom: 890.2857px
```

The version row bottom was below the visible viewport, so the footer was visually cut off until the
document was scrolled.

The important detail: the sidebar itself was not broken. Its footer was pinned to the bottom of the
pane. The pane was wrong because the shell was wrong.

## False Leads

These looked plausible but were not the root cause:

- The public landing logo size.
- `w-full` on the logo container.
- Extra vertical gap around the landing content.
- The sign-in card or centered layout.
- The right sidebar footer layout.

All of those can affect perceived density, but they do not explain why the whole shell became `56px`
taller than the visible viewport only after Android standalone refresh.

## The Bad Fix We Rejected

The first working fix was a JavaScript hook:

```ts
window.visualViewport?.height ?? window.innerHeight;
```

It set a CSS variable on the shell and listened to resize/orientation/pageshow/visibility/visual
viewport events.

That measured the right height in the failing case. But it was too much machinery for root layout:

- event listeners
- requestAnimationFrame scheduling
- hydration-only shell sizing
- another layout source of truth

It also sidestepped the real question: why trust `100dvh` for a root app shell if the existing
document/root height already gives the right containing block?

## The Fix We Kept

The final app fix was to remove raw `100dvh` from the shell:

```tsx
<div className="flex h-full min-h-0 flex-col bg-background text-foreground">...</div>
```

This works because the app already had:

```css
html,
body,
#root {
  height: 100%;
}
```

After that change, the same standalone reload state measured:

```text
display-mode: standalone: true
navigation.type: reload
window.innerHeight: 866px
window.visualViewport.height: 866.2857px
shell/layout height: 866.2857px
document overflow: 0px
version row bottom: 834.2857px
shell inline style: null
```

The bottom version row was visible again.

## Why Not `100vh`, `100lvh`, or `100svh`?

`100vh` and `100lvh` are not good shell defaults for this class of UI. MDN documents `vh` as
equivalent to `lvh`, the large viewport size. Large viewport units can be taller than the visible
viewport when mobile browser UI is present.

`100svh` is the safer viewport-unit fallback when the only requirement is "never exceed the visible
screen," but it can underfill when browser UI retracts.

`100dvh` is supposed to represent the dynamic visible viewport, which is why it was tempting. In
this Android standalone refresh case, that assumption was the bug.

For this app shell, `height: 100%` against `html/body/#root { height: 100%; }` was both simpler and
more reliable.

## Minimal Reproduction

This is a small reproduction that should make the failure obvious if your Android Chrome/PWA
environment has the same bug.

Create this directory:

```text
dvh-pwa-repro/
  index.html
  manifest.webmanifest
  icon.svg
  sw.js
```

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#ffffff" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <title>100dvh Android PWA repro</title>
    <script>
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("/sw.js");
      }
    </script>
    <style>
      html,
      body {
        margin: 0;
        height: 100%;
      }

      body {
        font:
          16px/1.4 system-ui,
          sans-serif;
      }

      .shell {
        height: 100dvh;
        display: grid;
        grid-template-rows: auto minmax(0, 1fr) auto;
        overflow: hidden;
        background: white;
      }

      .fixed-shell {
        height: 100%;
        min-height: 0;
      }

      header,
      footer {
        padding: 16px;
        border-block: 1px solid #ddd;
      }

      main {
        min-height: 0;
        overflow: auto;
        padding: 16px;
      }

      .metrics {
        white-space: pre-wrap;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 13px;
      }

      .footer-marker {
        font-weight: 700;
      }
    </style>
  </head>
  <body>
    <div id="shell" class="shell">
      <header>
        <button id="toggle" type="button">Toggle fixed shell</button>
      </header>
      <main>
        <p>
          Install this page as an Android Chrome PWA. Launch it from the home screen, then pull down
          to refresh. If the bug reproduces, the footer can fall below the visible screen and the
          document can become vertically scrollable.
        </p>
        <p>
          The button switches between <code>height: 100dvh</code> and <code>height: 100%</code>
          using the same root document height.
        </p>
        <pre id="metrics" class="metrics"></pre>
      </main>
      <footer>
        <span class="footer-marker">Footer should be visible without page scroll</span>
      </footer>
    </div>
    <script>
      const shell = document.querySelector("#shell");
      const metrics = document.querySelector("#metrics");
      const toggle = document.querySelector("#toggle");

      function rectFor(element) {
        const rect = element.getBoundingClientRect();
        return {
          top: rect.top,
          bottom: rect.bottom,
          height: rect.height,
        };
      }

      function collectMetrics() {
        const footer = document.querySelector("footer");
        const visibleHeight = window.visualViewport?.height ?? window.innerHeight;
        const overflow =
          Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) -
          document.documentElement.clientHeight;

        return {
          displayModeStandalone: matchMedia("(display-mode: standalone)").matches,
          navigationType: performance.getEntriesByType("navigation")[0]?.type,
          shellClass: shell.className,
          innerHeight: window.innerHeight,
          clientHeight: document.documentElement.clientHeight,
          visualViewportHeight: window.visualViewport?.height,
          bodyScrollHeight: document.body.scrollHeight,
          documentScrollHeight: document.documentElement.scrollHeight,
          overflow,
          shell: rectFor(shell),
          footer: rectFor(footer),
          footerVisible: footer.getBoundingClientRect().bottom <= visibleHeight,
        };
      }

      function renderMetrics() {
        metrics.textContent = JSON.stringify(collectMetrics(), null, 2);
      }

      toggle.addEventListener("click", () => {
        shell.classList.toggle("fixed-shell");
        renderMetrics();
      });

      window.addEventListener("resize", renderMetrics);
      window.visualViewport?.addEventListener("resize", renderMetrics);
      window.addEventListener("pageshow", renderMetrics);
      renderMetrics();
    </script>
  </body>
</html>
```

`manifest.webmanifest`:

```json
{
  "name": "100dvh Android PWA repro",
  "short_name": "dvh repro",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#ffffff",
  "icons": [
    {
      "src": "/icon.svg",
      "sizes": "192x192",
      "type": "image/svg+xml"
    }
  ]
}
```

`icon.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">
  <rect width="192" height="192" rx="32" fill="white" />
  <circle cx="96" cy="96" r="72" fill="#111827" />
  <text x="96" y="110" fill="white" font-family="system-ui, sans-serif" font-size="42" text-anchor="middle">dvh</text>
</svg>
```

`sw.js`:

```js
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
```

Serve it locally:

```sh
cd dvh-pwa-repro
python3 -m http.server 4173
```

If using an Android emulator, map the host port into the device:

```sh
adb reverse tcp:4173 tcp:4173
```

Then:

1. Open `http://127.0.0.1:4173/` in Android Chrome.
2. Install it from Chrome's menu with "Add to Home screen" or "Install app".
3. Launch it from the Android home screen, not from a normal Chrome tab.
4. Confirm `displayModeStandalone: true`.
5. Pull down to refresh the standalone PWA.
6. Check whether `shell.height` is larger than `innerHeight` and `visualViewportHeight`.
7. Check whether `footerVisible` becomes `false` or `overflow` becomes positive.
8. Tap "Toggle fixed shell" to switch from `height: 100dvh` to `height: 100%`.

If the bug reproduces, the interesting invariant is:

```text
shell.getBoundingClientRect().height > window.visualViewport.height
```

That should not happen for a root shell that is supposed to match the visible dynamic viewport.

## Emulator / DevTools Notes

For deeper debugging on an Android emulator, enable Chrome remote debugging:

```sh
adb shell "echo 'chrome --remote-debugging-port=9222 --remote-debugging-socket-name=chrome_devtools_remote' > /data/local/tmp/chrome-command-line"
adb shell am force-stop com.android.chrome
```

After launching the installed PWA:

```sh
adb forward tcp:9222 localabstract:chrome_devtools_remote
curl http://127.0.0.1:9222/json/list
```

Open the target's `webSocketDebuggerUrl` or use DevTools to evaluate the metrics in the page.

The important thing is to test the installed standalone target. Chrome device emulation and normal
Android Chrome tabs did not expose the bug in our case.

## Browser / Spec References

These are the relevant public references:

- MDN documents that `vh` is equivalent to `lvh`, and that dynamic viewport units are not stable:
  https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/length
- web.dev explains `svh`/`lvh`/`dvh` and notes that dynamic viewport updates are throttled or
  debounced: https://web.dev/blog/viewport-units
- Chrome's Visual Viewport API docs explain the distinction between the layout viewport and visual
  viewport: https://developer.chrome.com/blog/visual-viewport-api
- A similar public report describes Chrome Android standalone PWA `dvh` producing about 50px of
  overscroll after initial load or refresh:
  https://stackoverflow.com/questions/79831083/chrome-pwa-no-longer-calculating-dvh-properly-on-initial-load

## Suggested Browser Bug Report Shape

Title:

```text
Android Chrome installed PWA: 100dvh can exceed visualViewport.height after standalone reload
```

Expected:

```text
In standalone display mode, an element with height: 100dvh should not become taller than the visible
dynamic viewport after reload. It should be close to window.visualViewport.height / window.innerHeight.
```

Actual:

```text
After standalone reload, 100dvh resolved to 922.2857px while innerHeight was 866px and
visualViewport.height was 866.2857px. The document gained 56px of vertical overflow and bottom UI
fell below the screen.
```

Include:

- Android version.
- Chrome version.
- Device or emulator model.
- Whether the page was launched as a tab, shortcut, WebAPK, or installed PWA.
- Whether the failing state followed first launch, pull-to-refresh, browser reload, rotation, or
  keyboard open/close.
- The metric object from the repro page.
- A screen recording showing first launch vs reload.

## Tweet / Thread Draft

1. I hit a nasty `100dvh` bug in an Android Chrome installed PWA.

   Not just "mobile viewport units are awkward." After standalone refresh, `100dvh` became larger
   than both `window.innerHeight` and `window.visualViewport.height`.

2. The app shell was `height: 100dvh`.

   First PWA launch looked fine. After pull-to-refresh/reload, the shell measured `922px` while the
   visible viewport was `866px`.

   Result: 56px of document overflow, and the bottom footer/sidebar version row fell below the
   screen.

3. Testing matrix:
   - Android Chrome tab: fine
   - iOS Chrome "Add to Home Screen": fine
   - Android PWA first launch: fine
   - Android PWA after standalone refresh: broken

   Desktop mobile emulation would not have caught this.

4. The measurements from the failing state:

   ```text
   display-mode: standalone
   navigation.type: reload
   innerHeight: 866
   visualViewport.height: 866.2857
   100dvh shell height: 922.2857
   overflow: 56
   ```

5. The tempting fix was JS:

   ```js
   shell.style.height = `${visualViewport.height}px`;
   ```

   That works, but it adds event listeners, resize handling, hydration-only layout, and a second
   source of truth for root sizing.

6. The boring fix was better:

   ```css
   html,
   body,
   #root {
     height: 100%;
   }

   .app-shell {
     height: 100%;
     min-height: 0;
   }
   ```

   Same standalone reload: shell = `866px`, overflow = `0`, footer visible.

7. I do not think the docs promise that `dvh` updates at 60fps. MDN/web.dev explicitly warn it is
   dynamic and unstable.

   But this was not a smoothness issue. `100dvh` over-reported the visible viewport after reload in
   standalone PWA mode.

8. If you use `h-dvh` / `100dvh` for root app shells, test the installed Android PWA path:

   launch from home screen, open the bottom UI, pull-to-refresh/reload, and check:

   ```js
   shell.getBoundingClientRect().height <= visualViewport.height;
   ```

9. Minimal repro: build a standalone PWA with a `height: 100dvh` shell, a footer pinned to the
   bottom, and a metrics panel logging `innerHeight`, `visualViewport.height`, shell rect, footer
   rect, and document overflow.

10. This probably needs a Chromium bug with exact Android/Chrome versions and a tiny repro.

    The user-visible failure is bad: a "full-screen" PWA can become taller than the physical
    viewport after refresh, hiding bottom navigation until the page scrolls.
