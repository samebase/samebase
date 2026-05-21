# Onboarding Video Tools

Internal macOS tooling for recording simple, real-browser onboarding videos with visible tabs, real
cursor motion, and native scene capture.

## What It Does

- launches a real Google Chrome window with a fresh temporary profile
- opens four public landing pages in visible tabs
- places full-display plain white backdrop windows behind Chrome for a clean, controlled capture
  scene
- records a cropped desktop region with ScreenCaptureKit
- drives only real left-click cursor motion inside the exact Chrome window
- keeps the real Chrome corners and real macOS window shadow in the final MP4
- uses ScreenCaptureKit's native mouse click highlight instead of rebuilding custom ripples in post
- can also record the entire display that currently contains the mouse cursor

## Commands

Landing demo:

```bash
pnpm onboarding-video:landing-demo
```

Full-screen example:

```bash
pnpm onboarding-video:screen-demo
```

Landing demo output:

```text
research/onboarding-video-artifacts/chrome-landing-tabs-demo.mp4
```

Full-screen output:

```text
research/onboarding-video-artifacts/screen-capture-demo.mp4
```

## Constraints

- macOS only
- requires Node 24+
- requires Google Chrome
- requires `swiftc` on `PATH`
- requires Screen Recording and Accessibility permissions
- intended for internal onboarding-video experiments, not app runtime code
- current runner fails closed if another Chrome window stays frontmost; until we add stronger
  exact-window focusing, close other Chrome windows before running the landing demo

## Why It Lives Here

The capture flow is repo-agnostic in purpose, but this package now lives in the Noter monorepo so it
can share the repo's validation, package wiring, and operator docs. The macOS automation,
Chrome-window geometry, and video post-processing quirks still stay isolated from shipped app
runtime code.

The final MP4 defaults to a tracked path under `research/` so the repo can keep an intentional
canonical render on file. Temporary Chrome profiles, compiled helpers, and scratch coordination
files still stay under `.tmp/`.

## Why Native Helpers Remain

The orchestration and CLI entrypoints live in TypeScript. The native files under `native/` stay in
Swift because ScreenCaptureKit and AppKit still own the real macOS work:

- desktop-region recording with native cursor click highlights
- full-display recording for capability checks and experiments
- fail-closed cursor automation inside the exact Chrome window
- plain backdrop-window setup for the captured scene
