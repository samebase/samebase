# Onboarding demo edit

## Source

- Face: `public/media/onboarding-demo-face.mp4`
- Screen and audio: `public/media/onboarding-demo-screen.mp4`
- Accelerated screen proxy: `public/media/onboarding-demo-screen-24x.mp4`
- Captions: `public/media/onboarding-demo.srt`
- Duration: `12:38.566`
- Video: `3840x2480`, 30 fps, 22,755 frames
- Audio: AAC stereo at 44.1 kHz

The face and screen files have matching video packet timing and identical audio streams. The edit
uses the same source frame for both files without an offset.

## First draft

Keep narration and normal interaction at 1x. Accelerate only these provisioning and agent waits:

| Source time           | Maximum speed | Activity                      |
| --------------------- | ------------: | ----------------------------- |
| `06:45.184-07:16.133` |           24x | Create the first app          |
| `09:30.296-10:01.096` |           24x | Install the Samebase plugin   |
| `10:03.233-10:31.067` |           24x | Start plugin authorization    |
| `10:58.120-11:18.900` |           24x | Open Samebase from the agent  |
| `11:46.000-12:06.167` |           24x | Create the app from the agent |

The brief spoken `Can you` fragment at `10:02.946-10:03.233` stays at 1x between the two plugin
waits. Short OAuth, navigation, and retry pauses stay at 1x in the first draft. Review them after
the main waits are compressed.

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

After the first complete draft, decide whether the shorter provider authorization and navigation
waits also need acceleration.
