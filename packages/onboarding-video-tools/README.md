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
node --experimental-strip-types packages/onboarding-video-tools/cli.ts landing-demo
```

Default output:

```text
.tmp/onboarding-video-tools/chrome-landing-tabs-demo.mp4
```

## Constraints

- macOS only
- requires Google Chrome
- requires Screen Recording and Accessibility permissions
- intended for internal onboarding-video experiments, not app runtime code
- current runner fails closed if another Chrome window stays frontmost; until we
  add stronger exact-window focusing, close other Chrome windows before running
  the demo

## Why It Lives Here

This package is repo-agnostic tooling. It depends on macOS automation, Chrome
window geometry, and video post-processing quirks that should not live inside a
single stack repo.
