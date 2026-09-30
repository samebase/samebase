# Simultaneous screen and camera recording

## Setup

- Use a Mac with a camera, microphone, and at least 10 GB free disk space.
- Run `pnpm record-it`. Grant the requested capture permissions. Relaunch if macOS requires it.
- Keep test recordings local. Do not put camera or desktop content in Git or a PR.

## Flow

1. Confirm the app title is **Samebase Recorder** and **Both** is selected on a fresh installation.
2. Confirm the main display and default macOS microphone are selected. A second microphone must not
   be required to enable Record.
3. Select **Preview**. Confirm the camera framing is visible, then close the preview.
4. Enter a unique take name. Record at least 10 seconds while speaking and moving a window on the
   selected display. Make one visible clap to compare audio and camera timing.
5. Confirm both dashboard panels report written video samples and increasing file sizes. Confirm the
   microphone waveform changes while speaking.
6. Stop. Confirm Finder selects two MOV files under `~/Movies/Samebase/Recordings/`.
7. Open both files. Confirm screen movement, camera movement, audible speech in the camera file, and
   matching start times. Check that the final seconds play.
8. Repeat using the same take name. Confirm the app adds a suffix and preserves the first files.
9. Select **None** for camera audio and make a short camera-only take. Confirm it saves silent
   video.
10. Quit and reopen the app. Confirm the last recording mode and encoder settings remain selected.

## Evidence

Record the app build result, device types, permissions granted, duration, track counts, frame sizes,
and whether playback succeeded. Capture the setup window without a live camera preview if an image
is needed. Report any permission or hardware step that could not be completed.
