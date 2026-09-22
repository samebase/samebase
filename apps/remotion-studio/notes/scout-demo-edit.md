# Scout demo edit

The Scout submission video uses the existing recorded-demo composition: screen recording, face
camera at the bottom left, spoken captions, and smooth acceleration through waits. Use 32x for waits
by default. Use 64x only for an individual long wait if the edit needs it.

## Recording inputs

Put the downloaded originals in `apps/remotion-studio/public/media/`:

- `scout-demo-screen.mp4`: the screen recording with the narration audio.
- `scout-demo-face.mp4`: the separate camera recording on the same timeline.
- `scout-demo.srt`: captions timed to the original recording.
- `scout-demo-screen-24x.mp4`: a generated silent 24x screen copy for fast playback.

Keep subtitles out of the source video's pixels. If the recorder cannot export SRT, transcribe the
original narration separately. The edit retimes those captions and omits them during waits.

The 24x copy is a playback source, not the maximum edit speed. It works with both 32x and 64x waits.
Once the source arrives, generate it from the app directory:

```console
ffmpeg -i public/media/scout-demo-screen.mp4 -map 0:v:0 -vf "setpts=PTS/24,fps=30" -an -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p -movflags +faststart public/media/scout-demo-screen-24x.mp4
```

## Set the edit points

Edit `src/compositions/scout-demo/scoutDemoEdit.ts`:

1. Inspect the downloaded files for duration, frame size, frame rate, audio, and camera sync.
2. Set the frame size to match the recording. The waiting screen uses 1920x1080 provisionally.
3. Set `sourceDurationInFrames` at the composition's 30 fps timebase.
4. Fill `sourceSections` with the same `face` and `wait` sections used by the earlier demos. Use
   times from the original recording, cover it in order without gaps, and set each wait's
   `maximumPlaybackRate` to 32 unless that specific wait needs 64.
5. Review the real footage before choosing cuts or making claims in the narration.

The shared ramp starts and ends at 1x. A short wait can peak below the requested maximum. The face
camera fades out during waits and returns for spoken sections.

No source duration or edit points are assigned until the footage is available. Studio shows an
awaiting-footage screen; render and subtitle commands reject an unconfigured edit.

## Preview and export

From the repository root:

```console
pnpm --filter @samebase/remotion-studio dev
pnpm check:remotion-studio
pnpm --filter @samebase/remotion-studio render:scout-demo
pnpm --filter @samebase/remotion-studio generate:scout-subtitles
```

Select `ScoutDemo` in Studio. The output files are `out/scout-demo-master.mp4` and
`out/scout-demo.srt` inside the Remotion app. The existing founder and onboarding exports keep their
own edit points and commands.
