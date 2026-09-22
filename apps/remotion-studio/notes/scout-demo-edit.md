# Scout demo edit

The Trail Scout submission edit uses the shared recorded-demo composition: screen recording, face
camera at the bottom left, spoken captions, and smooth acceleration through the long wait.

## Recording inputs

The September 22 Tella exports are imported in `apps/remotion-studio/public/media/`:

- `scout-demo-screen.mp4`: `Introducing Trail Scout_screen_only.mp4`, with narration audio.
- `scout-demo-face.mp4`: `Introducing Trail Scout_face_only.mp4`, on the same timeline.
- `scout-demo.srt`: `introducing-trail-scout-5vgx_subtitles.srt`, on the original timeline.
- `scout-demo-screen-24x.mp4`: a generated silent 24x screen copy for fast playback.

Both original videos are 3840×2480, 30 fps, and 15:11.9 long. The composition preserves that frame
size and uses 27,357 source frames. The camera audio is muted to avoid playing narration twice.
Captions are rendered from the SRT and retimed with the edit. Captions inside the wait are omitted.

The 24x copy is a playback source, not the maximum edit speed. It works with both 32x and 64x waits.
Generate it from the app directory:

```console
ffmpeg -i public/media/scout-demo-screen.mp4 -map 0:v:0 -vf "setpts=PTS/24,fps=30" -an -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p -movflags +faststart public/media/scout-demo-screen-24x.mp4
```

## Adjust the edit

Change `scoutDemoFastForward` near the top of `src/compositions/scout-demo/scoutDemoEdit.ts`:

| Setting                 | Current value  | Meaning                                      |
| ----------------------- | -------------- | -------------------------------------------- |
| `startInSeconds`        | `1 * 60 + 58`  | Start of the wait in the original recording  |
| `endInSeconds`          | `14 * 60 + 35` | End of the wait in the original recording    |
| `maximumPlaybackRate`   | `32`           | Peak speed; use 64 only if needed            |
| `rampDurationInSeconds` | `2`            | Time in the edited video for each speed ramp |

Playback rises smoothly from 1x to 32x over two seconds, stays at 32x, then returns to 1x over two
seconds. The face camera fades out during the wait and returns for the conclusion. The existing
founder and onboarding edits retain their four-second ramps.

The wait becomes 25.6 seconds. With the introduction and conclusion unchanged, the edit lasts
3:00.5. It still needs a small trim if the final submission must be strictly under three minutes.
Changing the settings updates the composition duration, source clock, and rendered captions. Run the
subtitle export command again to update the separate SRT file.

## Preview and export

From the repository root:

```console
pnpm --filter @samebase/remotion-studio dev
pnpm check:remotion-studio
pnpm --filter @samebase/remotion-studio exec remotion render ScoutDemo out/scout-demo-preview.mp4 --scale=0.5
pnpm --filter @samebase/remotion-studio render:scout-demo
pnpm --filter @samebase/remotion-studio generate:scout-subtitles
```

Select `ScoutDemo` in Studio. The preview is 1920×1240. The full-size master is
`out/scout-demo-master.mp4`, and the retimed captions are `out/scout-demo.srt` inside the Remotion
app. Source media uses Git LFS; rendered output stays local.
