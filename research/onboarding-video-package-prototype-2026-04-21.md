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

## Package Outcome

The current reusable tooling now lives in:

- [`packages/onboarding-video-tools/README.md`](../packages/onboarding-video-tools/README.md)

It packages the proven setup:

- real Google Chrome with a fresh temporary profile
- a public four-tab landing-page demo for GitHub, Convex, Cloudflare, and Codex
- ScreenCaptureKit window recording
- native cursor automation with exact Chrome-window safety checks
- post-processed click-ring overlays
- QuickTime-friendly H.264 MP4 output

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

### Click Indicators Need To Be Post-Processed

The built-in click highlight from ScreenCaptureKit was not enough. A scripted
overlay is better because it is precise, controllable, and easy to tune after
the capture logic is stable.

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

### QuickTime-Safe Final Encoding

The final export now uses:

- H.264
- `yuv420p`
- 30 fps

That solved the case where IINA could open the file but QuickTime could not.

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

### Overlay Coordinates Were Initially Wrong

Click logs are recorded in screen points, while the captured video is often
retina-scaled pixels. The overlay only lined up correctly after applying scale
factors derived from the raw video size and captured window frame.

### The First Ring Animation Hung Too Long

The first pass at the expanding ring looked good on some clicks and lingered too
long on others. Tightening the animation duration fixed that.

## Fixes We Landed

- fresh temporary Chrome profile per run
- click-only landing-page demo path
- exact-window safety checks for cursor movement and clicks
- click event logging from the native cursor driver
- dual-ring click overlay:
  - black outer ring
  - white inner ring
- shorter ring animation timing
- final MP4 normalization for QuickTime compatibility

## Current Recommendation

Keep this tooling as an internal package in the Noter monorepo, not as app code
and not in a stack repo. Treat it as reusable onboarding-video infrastructure
plus research, not as a shipped product feature.

Short-term operating guidance:

- keep the fail-closed safety checks
- close unrelated Chrome windows before recording
- treat exact-window focusing as the next improvement area

## Follow-Up Questions

- should the click-ring style stay dual-ring or simplify to a single white ring
  for quieter videos?
- should future demos remain public landing pages by default, or should we add a
  signed-in private demo mode once the capture flow is fully stable?
- should we later add a code-driven overlay layer for labels or step numbers, or
  keep this tool focused only on faithful browser capture?
