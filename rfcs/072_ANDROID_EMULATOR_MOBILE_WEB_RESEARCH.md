# 072 Android Emulator Mobile Web Research

## Document Control

- Status: Research note
- Owner: Noter frontend/mobile web
- Last updated: 2026-03-27
- Depends on:
  - `Makefile`
  - `apps/noter/package.json`
  - `apps/noter/vite.config.ts`
  - `apps/noter/src/main.tsx`
  - `apps/noter/sync-site-url.mjs`
  - `apps/noter/convex/auth.ts`

## Purpose

Capture the smallest useful Android setup for reproducing mobile keyboard and
focus bugs in Noter, especially:

1. the dashboard chat input pushing the page after focus, and
2. `FileView` cases where the keyboard covers the active editor region on large
   files.

The goal is to answer what the monorepo actually needs for Android work today,
without prematurely adding a native Android app or a second frontend runtime.

## Research Questions

1. Do we need Android-native code in this monorepo just to test these bugs?
2. What local operator tooling is required to open Noter inside an Android
   emulator phone?
3. What is the correct networking path from the emulator to the current local
   Noter dev stack?
4. What, if anything, should the repo add now versus defer?

## Current Noter State

### Repo/runtime facts

- Noter is currently a web app. This repo has no `android/` project, Gradle
  setup, Capacitor wrapper, React Native app, or Expo app.
- In git worktrees, `make anon` is the required local startup path.
- `make anon` runs the frontend with `VITE_PORT=$(ANON_VITE_PORT)` and defaults
  that port to `5174`.
- `apps/noter/package.json` already starts Vite with `--host 0.0.0.0`, so the
  frontend can already listen beyond host-only loopback.
- `apps/noter/src/main.tsx` points browser code at
  `import.meta.env.VITE_CONVEX_URL` unless the Daytona-only proxy path is
  enabled.
- `apps/noter/sync-site-url.mjs` defaults local Convex `SITE_URL` to
  `http://localhost:5173` unless `DEV_ENV_ORIGIN` is set.
- `apps/noter/convex/auth.ts` also contains localhost-shaped local/dev checks.
- `apps/noter/playwright.config.ts` currently covers desktop Chromium only, not
  Android Chrome or an emulator-driven browser flow.

### Practical consequence

The frontend is already close to emulator-friendly, but the browser-side backend
URL is not abstracted for emulator use in local anon mode today. That matters
more than the lack of Android-native build files.

## Key Finding

We do **not** need to add Android-native code to this monorepo to debug these
bugs.

For the current goal, we need Android browser QA support, not an Android app.
The minimal successful setup is:

1. Android Studio + an Android phone emulator,
2. Chrome inside that emulator,
3. local Noter started with `make anon`,
4. localhost port forwarding so the emulator can browse the existing web app as
   `http://localhost:<port>`.

## Why `localhost` Is Better Than `10.0.2.2`

The Android emulator provides the special address `10.0.2.2` to reach the host
machine, so a quick frontend-only smoke test can open `http://10.0.2.2:5174`.

That is not the best primary path for Noter, though:

1. `apps/noter/src/main.tsx` still boots the browser-side Convex client from
   `VITE_CONVEX_URL`, which is typically a loopback URL in local anon mode.
2. If the page is loaded at `10.0.2.2` but `VITE_CONVEX_URL` still points at
   `127.0.0.1:<port>`, the emulator browser resolves that loopback address
   inside the emulator, not on the host machine.
3. Local auth/origin behavior in this repo is still localhost-centric, so
   keeping the browser origin on `localhost` reduces incidental drift.
4. Android's own local-server guidance recommends `adb reverse` or DevTools port
   forwarding over `10.0.2.2`, and calls out `10.0.2.2` as the weaker path for
   browser-style local development because it does not preserve trusted
   `localhost` semantics. This secure-context implication is broader than
   WebView; it comes from the underlying browser origin rules.

## Options Considered

### Option A. Add a native Android wrapper to the monorepo

Examples:

- Capacitor
- a dedicated `android/` project
- React Native / Expo

Pros:

- creates a native shell for future app-store work
- opens the door to device-specific packaging later

Cons:

- does not solve the current mobile web keyboard bug by itself
- adds a second runtime and build surface immediately
- introduces Gradle, Android SDK, signing, and wrapper maintenance before the
  product has even decided to ship a native app
- would still require mobile browser or WebView debugging work for the actual
  viewport/focus behavior

Assessment:

Too heavy for the current need.

### Option B. Open the web app directly at `10.0.2.2`

Pros:

- very little setup
- good for quick static or public-route smoke checks

Cons:

- diverges from Noter's localhost-oriented local-dev assumptions
- does not solve browser requests to `127.0.0.1:<port>` inside app code
- likely turns emulator testing into a partial or fragile setup once auth,
  websocket, or local backend flows matter

Assessment:

Useful as a quick sanity check, but not the recommended steady-state workflow.

### Option C. Use emulator Chrome with `adb reverse` or Chrome DevTools port forwarding

Pros:

- keeps the emulator browsing `http://localhost:<port>`
- works with both the Android Emulator and physical devices
- aligns with Noter's current local auth/origin assumptions
- avoids adding any native mobile project to the repo
- makes it possible to keep both the frontend and local Convex backend on their
  existing local ports

Cons:

- adds a small amount of operator setup
- may require forwarding more than one port in anon mode

Assessment:

Best fit right now.

## Recommendation

Adopt **Option C** for Android debugging in the current repo state.

### Decision

1. Keep the monorepo web-only for now.
2. Treat Android work as emulator/browser QA, not native Android development.
3. Standardize on `make anon` plus emulator Chrome plus localhost port
   forwarding.
4. Add documentation now, then only add repo automation if this workflow becomes
   frequent.

## Required Operator Setup

These requirements are outside the repo:

1. Android Studio installed locally.
2. Android SDK Platform Tools available so `adb` works.
3. One phone AVD with Chrome available.
4. AVD input configured so the soft keyboard actually appears.

### Recommended emulator profile

- A recent Pixel phone profile
- Recent Android system image with Google Play support
- Portrait-first testing
- Do not rely on host hardware keyboard passthrough when reproducing viewport
  shifts caused by the soft keyboard

Android Studio's AVD configuration already exposes keyboard-related settings,
including hardware-keyboard input, so the emulator can be configured either for
desktop-like keyboard input or for genuine soft-keyboard testing.

## Recommended Manual Workflow

### 1. Start Noter the normal worktree-safe way

From the repo root:

```bash
make anon
```

This keeps the local workflow aligned with the existing worktree bootstrap
contract.

### 2. Read the local backend port after anon bootstraps

`make anon` generates `apps/noter/.env.local`. Read `VITE_CONVEX_URL` from that
file and note its port.

Expected shape:

```bash
VITE_CONVEX_URL=http://127.0.0.1:<convex-port>
```

The frontend port in worktrees is normally `5174`.

### 3. Make sure the emulator is visible to `adb`

```bash
adb devices
```

### 4. Reverse-forward the ports you need

At minimum:

```bash
adb reverse tcp:5174 tcp:5174
adb reverse tcp:<convex-port> tcp:<convex-port>
```

This lets the emulator use `localhost` for both the Vite app and the local
Convex backend.

If Chrome DevTools port forwarding is preferred instead, the same localhost
shape still applies.

### 5. Open Noter in emulator Chrome

Open:

```text
http://localhost:5174
```

This is the key difference from the `10.0.2.2` approach. The emulator is still
using the host machine, but the page now runs under a localhost origin that
matches current local-dev assumptions more closely.

### 6. Remote-debug from desktop Chrome

Use desktop Chrome's `chrome://inspect` flow to inspect the emulator tab,
console, layout, and viewport metrics while reproducing the issue.

## Noter-Specific Validation Checklist

### Dashboard chat input

1. Open the dashboard on the emulator.
2. Tap the chat input.
3. Watch for the delayed whole-page upward push after focus.
4. In remote DevTools, inspect:
   - `window.visualViewport.height`
   - `window.scrollY`
   - focused element bounds
   - any delayed scroll or layout effects after focus

### `FileView` large-file focus case

1. Open a larger file in `FileView`.
2. Scroll far enough that the active editor region is near the keyboard edge.
3. Focus the editor and type with the soft keyboard visible.
4. Confirm whether the caret/input line stays visible or falls behind the
   keyboard.
5. In remote DevTools, inspect:
   - viewport resize timing
   - delayed scroll adjustments
   - editor container height versus visual viewport height

## What The Monorepo Should Add Now

For the current ask, the repo only needs **documentation**.

That is enough to unblock Android emulator testing without committing Noter to a
native mobile surface area.

## Follow-Up Repo Improvements Worth Considering Later

Only if this workflow becomes common:

1. Add a small helper command such as `make android-reverse` that reads
   `apps/noter/.env.local` and forwards the frontend and local Convex ports.
2. Generalize the current Daytona-only same-origin Convex proxy pattern so local
   anon mode can optionally proxy Convex through the frontend origin as well.
3. Add a mobile QA checklist document or issue template for keyboard/focus
   regressions.
4. Evaluate Android automation separately after manual reproduction is reliable.

The first repo-owned code improvement should be a small local-debug helper or a
browser-origin proxy, not a native Android shell.

## Final Recommendation

Do **not** add an Android app module, Gradle project, or Capacitor wrapper for
this problem.

For the dashboard chat and `FileView` keyboard bugs, the right next step is:

1. keep Noter as a web app,
2. run it with `make anon`,
3. open it in Android emulator Chrome via localhost port forwarding,
4. use remote DevTools to debug the real soft-keyboard viewport behavior.

## External References

- Android Developers:
  [Create and manage virtual devices](https://developer.android.com/studio/run/managing-avds)
- Android Developers:
  [Android Emulator networking](https://developer.android.com/studio/run/emulator-networking)
- Android Developers:
  [Access a local development server from WebView](https://developer.android.com/develop/ui/views/layout/webapps/access-local-server)
- Chrome for Developers:
  [Remote debug Android devices](https://developer.chrome.com/devtools/docs/remote-debugging)
- Chrome for Developers:
  [Access local servers and Chrome instances with port forwarding](https://developer.chrome.com/docs/devtools/remote-debugging/local-server/)
