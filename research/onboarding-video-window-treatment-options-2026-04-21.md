# Onboarding Video Window Treatment Options

Date: 2026-04-21 Branch: `codex/onboarding-video-tools`

## Goal

Make the canonical onboarding-video artifact feel natural when embedded directly in Markdown or
shared elsewhere, while removing the black corner artifacts that come from recording a visually
rounded Chrome window into a rectangular MP4.

## Option 1: Stage A Background Behind Chrome

Summary: Keep a second controlled surface behind the recorded Chrome window so the rounded corners
reveal a "real" background, such as a white page or a custom designed image.

What this actually requires:

- stop capturing the isolated Chrome window
- start capturing a screen or region that includes the window plus surrounding margin
- ensure nothing unexpected can appear in that captured area

Pros:

- visually faithful to a real composed desktop scene
- easy to art-direct by changing the staged background URL
- could support image-based or branded backdrops later

Cons:

- much less deterministic than exact window capture
- more sensitive to desktop state, z-order, notifications, and machine setup
- increases automation complexity because the background must be staged and kept clean throughout
  recording

## Option 2: Postprocess The Window Into A Designed Artifact

Summary: Keep the existing exact-window capture, then composite that captured Chrome window onto a
chosen background with rounded corners and intentional outer padding.

Pros:

- deterministic and portable across machines and recording sessions
- keeps the current exact-window capture pipeline intact
- final MP4 becomes a deliberate shareable artifact instead of a raw screen grab
- easy to tune spacing, background color, and corner treatment in one place

Cons:

- visually designed rather than literally "as captured"
- requires tuning the corner radius and background treatment so it still feels native

## Current Recommendation

Recommend Option 2.

Reason: The current recorder captures a desktop-independent Chrome window, so a staged window behind
it would not show through unless the pipeline switched to region capture. That makes the
staged-background approach sound simpler than it really is. The postprocessed mask keeps the stable
capture path and solves the artifact at the final-asset level.
