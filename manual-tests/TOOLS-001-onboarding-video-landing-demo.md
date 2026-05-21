# TOOLS-001: Onboarding video landing demo smoke

## Purpose

Verify the internal onboarding-video package can produce a finished MP4 from a fresh Chrome profile
without leaking clicks outside the expected window.

## Preconditions

- Run from a macOS checkout with Node 24+ available.
- `ffmpeg`, `ffprobe`, and `swiftc` are installed and on `PATH`.
- Google Chrome is installed.
- Screen Recording and Accessibility permissions are granted for the terminal app that launches the
  command.
- Close unrelated Google Chrome windows before starting the demo.

## Steps

1. From the repo root, run:

```bash
pnpm onboarding-video:landing-demo
```

2. Wait for Chrome to open four public landing pages and for the recording flow to finish.
3. Note the output path printed by the command.
4. Open the generated MP4 in QuickTime Player.

## Expected Results

1. The command exits successfully and prints a final MP4 path under
   `research/onboarding-video-artifacts/`.
2. The recorded video shows a single Chrome window with visible GitHub, Convex, Cloudflare, and
   Codex tabs.
3. Cursor motion stays inside the intended Chrome window for the full run.
4. Expanding click rings are aligned with the visible clicks in the final MP4.
5. QuickTime Player opens the MP4 successfully.

## Optional Evidence

- Screenshot of the final video frame in QuickTime Player.
- Short note with the exact output path and whether any permission prompts appeared.

## Cleanup

- Delete the final MP4 if it was created only for validation.
