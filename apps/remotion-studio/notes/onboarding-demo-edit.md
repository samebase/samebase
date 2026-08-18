# Onboarding demo edit

## Source

- Face: `public/media/onboarding-demo-face.mp4`
- Screen and audio: `public/media/onboarding-demo-screen.mp4`
- Accelerated screen proxy: `public/media/onboarding-demo-screen-24x.mp4`
- Captions: `public/media/onboarding-demo.srt`
- Duration: `11:17.966`
- Video: `3840x2480`, 30 fps, 20,337 frames
- Audio: AAC stereo at 44.1 kHz

The face and screen files have matching video packet timing and identical audio streams. The edit
uses the same source frame for both files without an offset.

## Acceleration markers

These are operator-selected source-time boundaries. Keep all other sections at 1x.

| Source time         | Maximum speed |
| ------------------- | ------------: |
| `00:48.69-00:54.69` |           16x |
| `00:56.14-01:11.76` |           16x |
| `01:14.66-01:22.71` |           16x |
| `01:32.67-01:37.48` |           16x |
| `01:55.94-02:06.34` |           16x |
| `02:10.00-02:23.69` |           16x |
| `03:00.80-03:07.11` |           16x |
| `03:55.43-04:02.11` |           16x |
| `05:24.69-05:55.63` |           16x |
| `08:08.17-08:39.97` |           16x |
| `08:49.97-09:09.62` |           16x |
| `09:43.03-09:57.79` |           16x |
| `10:26.63-10:45.52` |           16x |

The 16x maximum is provisional. Review the longer waits in Remotion Studio and increase their
configured maximum only if the current curve does not compress them enough.

Play `11:15.54` to the end at `0.5x` with the screen, face, audio, and captions kept together.

Each wait uses the shared four-second smooth curve from 1x to its configured maximum and back to 1x.
A wait that is too short to reach its configured maximum uses the same curve with a lower peak. The
24x proxy is only a rendering source for playback above 16x.

## Captions

The SRT keeps source timestamps. Captions appear only during 1x sections, so they do not need
retiming. The first cleanup corrects Samebase, Convex, Cloudflare, Codex, Claude Code, Worker, and
obvious spacing or transcription fragments.

## Review

Inspect the start and end of every accelerated section for:

- complete spoken phrases
- face fade timing
- caption boundaries
- smooth source switching above 16x
- one-second audio fade to silence and back

After the first complete pass, decide which longer waits need a higher maximum speed.
