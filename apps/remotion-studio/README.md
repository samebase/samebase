# Samebase Remotion Studio

The motion design and video composition workbench for Samebase. It keeps compositions, source-time
edit manifests, editorial notes, and Git LFS source recordings beside the product and brand sources
they represent. Rendered output stays local.

Remotion Studio is an internal authoring surface, not a publishing service. Browser capture,
composition, final encoding, delivery upload, and product publication remain explicit stages.

## Open the studio

From the monorepo root:

```console
pnpm --filter @samebase/remotion-studio dev
```

Select a composition, play it, and scrub the timeline. Changes under `apps/remotion-studio/src/`
appear in Studio immediately.

## Compositions

- `LogoHype` explains the flat-to-isometric identity sequence, production shuffle, recursive depth,
  and Menger exploration using the shared Samebase logo model.
- `FounderDemo` contains the 1920×1240 founder introduction and product walkthrough preview.
- `FounderDemoYouTube` renders the same edit at 3344×2160 while preserving the source aspect ratio.
- `OnboardingDemo` contains the complete onboarding walkthrough at 3344×2160 while preserving the
  source aspect ratio.
- `ScoutDemo` contains the Trail Scout submission edit at the source size, 3840×2480. It combines
  the screen, camera, and captions with a 48x wait and two-second speed ramps.
- `TicTacToeRecording` contains the production edit used by the landing page.
- `MengerDiveSpike` is a 5-second WebGPU ray-marched dive into an unbounded Menger sponge. It zooms
  3x in each clip length, so it loops without a seam. It needs a WebGPU adapter. On an Apple silicon
  Mac, the Remotion headless shell uses the Metal GPU.
- `MarkIllusionTest` is a 10-second look test for the brand film. The flat mark turns into a lit 3D
  cube, becomes flat at the isometric view, and then opens a fourth and fifth side with a 2D warp
  that is the identity at three sides. `forceWarp` renders the warp in every frame for the swap
  check.
- `MengerScaleStill-1` to `MengerScaleStill-3` are look tests of a huge depth-7 sponge in haze: a
  low angle up one edge, one corner out of the haze, and a near face to the horizon with the flat
  mark for scale. Frame 0 is the still.
- `ContactSheetLabel` draws the time labels for the contact sheet command.

Each production composition owns its component, timing model, and supporting edit data under
`src/compositions/<name>/`. Editorial reasoning lives under `notes/`.

## Capture, compose, and publish

1. Capture real browser footage with `packages/onboarding-video-tools/` when the video needs native
   Chrome, cursor, or macOS presentation.
2. Put source recordings in `apps/remotion-studio/public/media/`. MP4 files in this directory use
   Git LFS.
3. Record timestamps, pacing decisions, and review notes in `apps/remotion-studio/notes/`.
4. Build and inspect the composition in Remotion Studio.
5. Run `pnpm check:remotion-studio` and render a local master into `apps/remotion-studio/out/`.
6. Generate retimed SRT files from the same edit manifests as the rendered videos.
7. Create the delivery encode and poster for the target surface.
8. Publish the accepted delivery file to its target platform.
9. When the Samebase app serves the video directly, record its immutable URL and observed metadata
   in `apps/samebase/shared/publicMediaManifest.ts`.

Do not put provider tokens or other secrets in this app.

## Founder demo

The founder demo uses these tracked inputs:

```text
apps/remotion-studio/public/media/founder-demo-screen.mp4
apps/remotion-studio/public/media/founder-demo-face.mp4
apps/remotion-studio/public/media/founder-demo-screen-24x.mp4
apps/remotion-studio/public/media/founder-demo.srt
```

Git keeps all LFS objects as pointers during normal clone and pull operations, so CI does not
download large source files. Fetch the Remotion recordings when the studio needs them:

```console
git lfs pull --include="apps/remotion-studio/public/media" --exclude=""
```

Render the YouTube master with:

```console
pnpm --filter @samebase/remotion-studio render:founder-demo
```

Render the 2160p YouTube master with:

```console
pnpm --filter @samebase/remotion-studio render:founder-demo-youtube
```

## Onboarding demo

The onboarding demo uses these tracked inputs:

```text
apps/remotion-studio/public/media/onboarding-demo-screen.mp4
apps/remotion-studio/public/media/onboarding-demo-face.mp4
apps/remotion-studio/public/media/onboarding-demo-screen-24x.mp4
apps/remotion-studio/public/media/onboarding-demo.srt
```

The screen and face recordings use the same 30 fps timeline. The screen recording owns the audio.
The edit manifest assigns a maximum speed to each wait. The shared recorded-demo component uses one
smooth acceleration curve for both 24x and 32x waits.

Rebuild the 24x screen proxy after the source recording changes:

```console
ffmpeg -i apps/remotion-studio/public/media/onboarding-demo-screen.mp4 -map 0:v:0 -vf 'setpts=PTS/24,fps=30,scale=1920:1240:flags=lanczos' -an -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p -movflags +faststart apps/remotion-studio/public/media/onboarding-demo-screen-24x.mp4
```

Render the local master with:

```console
pnpm --filter @samebase/remotion-studio render:onboarding-demo
```

## YouTube subtitles

Generate SRT files that use the accelerated output timelines with:

```console
pnpm --filter @samebase/remotion-studio generate:subtitles
```

The command writes `founder-demo-youtube.srt` and `onboarding-demo-youtube.srt` to
`apps/remotion-studio/out/`. It omits captions from accelerated waits and uses the same frame
boundaries as the captions rendered into each composition.

## Scout demo

Use [the Scout edit notes](notes/scout-demo-edit.md) for input filenames, recording checks, and
timestamp setup. The original 1:58–14:35 interval accelerates to 48x, with two seconds at each end
for acceleration and deceleration. Adjust the boundaries, maximum speed, and ramp duration together
in `scoutDemoFastForward` in `src/compositions/scout-demo/scoutDemoEdit.ts`.

```console
pnpm --filter @samebase/remotion-studio render:scout-demo
pnpm --filter @samebase/remotion-studio generate:scout-subtitles
```

Both commands use the imported recordings and write the local master and retimed SRT to
`apps/remotion-studio/out/`. The current edit lasts about 2:52.6.

Final exports use the original recordings at full size, PNG intermediate frames, H.264 CRF 16, and
384 kbps AAC audio. Studio uses the 24x recording only to preview fast-forward playback. The shared
render defaults apply to all compositions; keep Scale at 1 for the final upload.

## Tic-Tac-Toe landing video

The source recording belongs at:

```text
apps/remotion-studio/public/media/tic-tac-toe-4x4x4.mp4
```

The edit manifest is `src/compositions/tic-tac-toe/ticTacToeEdit.ts`, and its editorial reasoning is
in `notes/tic-tac-toe-edit.md`.

Render the local master with:

```console
pnpm --filter @samebase/remotion-studio render:tic-tac-toe
```

The published `landing/tic-tac-toe-codex-v1.mp4` asset retains its original source provenance from
the archived `samebase/remotion-video-workbench` commit that produced it. Future published videos
should identify the exact Samebase monorepo commit and Remotion composition ID that produced them.

## Repository boundaries

Commit:

- Remotion and React source files
- source-time edit manifests
- editorial notes and production decisions
- source recordings and render proxies under `public/media/` through Git LFS
- subtitle files under `public/media/`
- package and tool configuration

Do not commit:

- rendered masters, delivery encodes, posters, or contact sheets in `out/`
- `.env` files or credentials

## Commands

- `pnpm --filter @samebase/remotion-studio dev`: open Remotion Studio.
- `pnpm check:remotion-studio`: typecheck and lint from the repository root.
- `pnpm --filter @samebase/remotion-studio generate:subtitles`: generate retimed SRT files for the
  Founder Demo and Onboarding Demo.
- `pnpm --filter @samebase/remotion-studio render:founder-demo`: render the founder demo.
- `pnpm --filter @samebase/remotion-studio render:founder-demo-youtube`: render the 2160p founder
  demo while preserving the source aspect ratio.
- `pnpm --filter @samebase/remotion-studio render:logo-hype`: render the logo identity exploration.
- `pnpm --filter @samebase/remotion-studio render:menger-dive-spike`: render the Menger dive loop.
- `pnpm --filter @samebase/remotion-studio render:mark-illusion-test`: render the mark illusion.
- `pnpm --filter @samebase/remotion-studio render:menger-scale-stills`: render the three scale
  stills.
- `pnpm --filter @samebase/remotion-studio render:contact-sheet <composition-id> <frames> <columns> <output.jpg>`:
  render frames (`75`) or seconds (`2.5s`) from a comma-separated list into one labeled JPEG. It
  needs `ffmpeg` on the `PATH`. Example:
  `render:contact-sheet MengerDiveSpike 0,0.5s,1s,1.5s,2s,2.5s,3s,4s,149 3 out/menger-dive-spike-sheet.jpg`.
- `pnpm --filter @samebase/remotion-studio render:onboarding-demo`: render the 2160p onboarding demo
  for YouTube while preserving the source aspect ratio.
- `pnpm --filter @samebase/remotion-studio render:tic-tac-toe`: render the production landing edit.

Review the current [Remotion license terms](https://www.remotion.dev/docs/license/pricing) as the
team grows.
