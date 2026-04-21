# Onboarding Video Package Prototype

Date: 2026-04-21

## Why This Document Exists

We built and tested a real-browser onboarding-video prototype outside the main
Noter app code. The immediate goal was not polished marketing output. It was to
prove a narrow but important workflow:

1. open a small real Chrome window
2. keep four real tabs visible
3. switch between tabs with real left clicks
4. capture the cursor and the browser chrome
5. make the jumps obvious enough for README and mobile playback

This note captures the findings from that prototype work and explains why the
tooling moved into `packages/onboarding-video-tools/`.

Update: the active package path now uses desktop-region capture with a plain
white backdrop window and ScreenCaptureKit's native click highlight. After that
scene-based path proved out, the older window-only capture plus FFmpeg
presentation stack was removed instead of being kept around as a compatibility
path.

## Package Outcome

The current reusable tooling now lives in:

- [`packages/onboarding-video-tools/README.md`](../packages/onboarding-video-tools/README.md)

It packages the proven setup:

- real Google Chrome with a fresh temporary profile
- a public four-tab landing-page demo for GitHub, Convex, Cloudflare, and Codex
- ScreenCaptureKit desktop-region recording around one Chrome window
- full-display white backdrop windows behind the browser so the final MP4 keeps
  native rounded corners and native window shadow without leaking other app
  content into the captured scene
- native cursor automation with exact Chrome-window safety checks
- native ScreenCaptureKit click highlights
- H.264 MP4 output written directly from ScreenCaptureKit

## Why This Moved Out Of The Stack Repo

The original prototype lived in `convex-cloudflare-pages-stack`, but that repo
was the wrong long-term home for it.

Reasons:

- the capture logic is not stack-specific
- the code keeps accumulating macOS, Chrome, cursor, and FFmpeg quirks
- it is exploratory tooling and research, not part of the product contract
- keeping it in `noter` lets us reuse it across onboarding experiments without
  polluting a stack repo with media automation internals

## Design Constraints We Confirmed

### Real Browser Chrome Matters

The useful part of the recording is the browser shell itself. The visible tab
strip makes app-to-app jumps obvious in a way that pure viewport capture does
not.

### A Fresh Chrome Profile Is Required

Using a normal user profile is unsafe and visually noisy. Each run should start
with a temporary, isolated Chrome profile.

### Clicks Must Be Real

For the onboarding demo we wanted actual left-click tab changes, not internal
tab switching APIs. This keeps the motion consistent with what the viewer sees.

### The Scene Around Chrome Matters Too

Capturing only the Chrome window rectangle made it too easy to lose the real
rounded-corner and real shadow treatment. Capturing a controlled scene around
the window turned out to be more important than perfect post-processing.

## What Worked

### Public Landing Pages For A Safe Default Demo

Using public landing pages for GitHub, Convex, Cloudflare, and Codex gave us a
safe, login-free validation path.

### Fixed Window Geometry With Light Padding

A smaller real Chrome window plus a bit of neutral padding around it produced a
better README/mobile-friendly frame than a maximized browser.

### Exact Chrome Window Safety Checks

The cursor driver now refuses to continue unless:

- Chrome is frontmost
- the expected Chrome window owner is present
- the live frontmost Chrome window frame matches the recorded frame

That turned out to be essential.

### Native Scene Capture Looks More Natural

Switching from window-object capture plus synthetic masking to desktop-region
capture plus a plain backdrop window produced a much more natural result. The
native Chrome shadow reads correctly across light and dark pages without
special-case tuning.

## What Failed Or Broke

### Global Mouse Events Were Dangerous

The first version could continue sending system-wide mouse events even when the
recorded Chrome window was no longer the active target. That created a real risk
of clicking other apps.

### Global Chrome Activation Was Too Broad

Triggering broad Chrome activation could bring the wrong Chrome window to the
front. The safer model is to bind everything to one isolated profile window and
verify its exact frame continuously.

### Multiple Open Chrome Windows Still Need Better Window Raising

The migrated package currently fails closed when another Chrome window remains
frontmost. That is the right safety behavior, but it also means we still need a
better exact-window-raising strategy than generic app activation or window-order
nudges.

### Synthetic Presentation Math Kept Creating New Bugs

Rounded masking, shadow reconstruction, and custom click-ring timing all worked
sometimes and then broke in page-specific ways. That was a signal to stop tuning
the fake presentation layer and rely more on native scene capture.

## Fixes We Landed

- fresh temporary Chrome profile per run
- click-only landing-page demo path
- exact-window safety checks for cursor movement and clicks
- controlled white backdrop behind Chrome
- desktop-region recording around the real Chrome window
- native ScreenCaptureKit click highlights
- removal of the old window-only plus FFmpeg path once the scene-based capture
  path was stable

## Current Recommendation

Keep this tooling as an internal package in the Noter monorepo, not as app code
and not in a stack repo. Treat it as reusable onboarding-video infrastructure
plus research, not as a shipped product feature.

Short-term operating guidance:

- keep the fail-closed safety checks
- close unrelated Chrome windows before recording
- prefer the scene-capture path over reviving presentation-math fixes

## Merge-Prep Requirements

Before merging, the landing-demo output should satisfy these operator
requirements:

- dismiss Chrome's "Chrome is being controlled by automated test software"
  banner so it does not consume tutorial real estate or add extra visual
  complexity to the recording
- measure how far the native window shadow extends relative to the current
  padding and ensure the outer edge of the exported MP4 is already white, so
  embeds do not show a visible cutoff from the shadow treatment into the host
  background; if needed, rebalance padding versus usable tutorial space instead
  of accepting a clipped shadow

## Follow-Up Questions

- should the native click highlight stay as-is, or do we still want a custom
  visual treatment on top once the simpler scene pipeline is stable?
- should future demos remain public landing pages by default, or should we add a
  signed-in private demo mode once the capture flow is fully stable?
- should we later add a code-driven overlay layer for labels or step numbers, or
  keep this tool focused only on faithful browser capture?
