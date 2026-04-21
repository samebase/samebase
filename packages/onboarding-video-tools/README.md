# Onboarding Video Tools

Internal macOS tooling for recording simple, real-browser onboarding videos with
visible tabs, real cursor motion, and post-processed click indicators.

## What It Does

- launches a real Google Chrome window with a fresh temporary profile
- opens four public landing pages in visible tabs
- records the Chrome window with ScreenCaptureKit
- drives only real left-click cursor motion inside the exact Chrome window
- renders black-and-white expanding click rings into the final MP4

## Current Command

```bash
pnpm onboarding-video:landing-demo
```

Default output:

```text
.tmp/onboarding-video-tools/chrome-landing-tabs-demo.mp4
```

## Constraints

- macOS only
- requires Node 24+
- requires Google Chrome
- requires `ffmpeg`, `ffprobe`, and `swiftc` on `PATH`
- requires Screen Recording and Accessibility permissions
- intended for internal onboarding-video experiments, not app runtime code
- current runner fails closed if another Chrome window stays frontmost; until we
  add stronger exact-window focusing, close other Chrome windows before running
  the demo

## Why It Lives Here

The capture flow is repo-agnostic in purpose, but this package now lives in the
Noter monorepo so it can share the repo's validation, package wiring, and
operator docs. The macOS automation, Chrome-window geometry, and video
post-processing quirks still stay isolated from shipped app runtime code.

## Why Two Native Helpers Remain

The orchestration, CLI entrypoints, and post-processing live in TypeScript. The
two files under `native/` stay in Swift because ScreenCaptureKit, AppKit, and
CoreGraphics do not have a stable TypeScript-native equivalent for exact window
capture and fail-closed cursor automation on macOS.
