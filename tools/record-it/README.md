# Samebase Recorder

A local macOS app for recording the screen and camera at the same time. It is adapted from Mike
Cann's `record-it`. See [UPSTREAM.md](UPSTREAM.md) for the source commit and attribution.

## Start

Use Node 24, pnpm, and Xcode 26 or its Command Line Tools. Building requires the macOS 26 SDK for
the encoder APIs. The installed app targets macOS 14 or later. The recorder uses SwiftUI,
ScreenCaptureKit, and AVFoundation, so its capture code remains in Swift. The launcher is TypeScript
and calls the macOS tools directly.

From the repository root:

```sh
pnpm record-it
```

The first run builds, signs, and installs `~/Applications/Samebase Recorder.app`, then opens it.
Later runs open the installed app. You can also open Samebase Recorder from Finder or Spotlight. The
installed app works after the worktree is removed.

```sh
pnpm record-it setup    # Build and install without opening the app.
pnpm record-it restart # Finish any recording, rebuild, and open the app.
pnpm record-it stop    # Finish any recording and quit.
```

The local bundle ID is `com.samebase.record-it`. The app and recovery helper use stable local
signing requirements so macOS can retain permissions after a rebuild. Setup replaces only an
existing app with this bundle ID and refuses to replace a running app.

## Record screen and camera

1. Select **Both**.
2. Select a display or window, then select a camera and microphone.
3. Use **Preview** to check camera framing. Close the preview before recording.
4. Set **Screen Audio** to **System Sound** if the screen file needs application audio.
5. Select **Record**. Allow Screen Recording, Camera, and Microphone access when macOS asks.
6. If macOS requires a restart after Screen Recording access, quit and reopen the app, then retry.
7. Select **Stop**. Finder opens the completed files.

The screen and camera share a start time and produce separate files:

```text
~/Movies/Samebase/Recordings/<take>-screen.mov
~/Movies/Samebase/Recordings/<take>-camera.mov
```

The screen file contains system audio when selected. The camera file contains microphone audio.
Choose **None** for a silent camera file. Audio-only mode requires a microphone and saves AAC in an
M4A file. The app defaults to **Both**, the main display, the default macOS audio input, and the
best available camera format at 30 fps, with a preference for 4K.

For project folders, create directories under `~/Movies/Samebase/Projects/` and reopen the app. The
Project menu lists them with the newest first. Each project saves to its `source` directory. **No
Project** uses `~/Movies/Samebase/Recordings/`. Recordings stay outside the Git checkout. Import the
selected files into Remotion Studio when they are ready for editing.

## Quality and recovery

The app preserves the selected display's native framebuffer size. It does not change display modes
or enlarge the recording. **Encoder > Settings** controls H.264/HEVC and screen quality. **Edit
Master** is the default screen quality. Recording mode and encoder settings persist between
launches.

The live dashboard shows written samples, file size, and capture health. Each movie uses five-second
fragments to limit data loss after a crash. Existing files get a numbered suffix. Recording requires
10 GB free, with a warning below 5 GB.

A second microphone is optional. When a built-in microphone is available and differs from the
selected input, the app records a separate lossless backup through its recovery helper. It detects
the built-in input by hardware type, so it does not depend on a MacBook model or a device name.
Recovery files are kept for 14 days in:

```text
~/Library/Application Support/Samebase Recorder/Recovery Audio/
```

Problems produce a timecoded text file beside the take. Diagnostic logs are local:

```text
~/Library/Logs/Samebase Recorder/record-it.log
```

## Development and validation

In a new worktree, run `pnpm run dev --once` to complete repository setup first. Then run:

```sh
pnpm record-it test
pnpm record-it restart
```

Unit tests require full Xcode 26 or later, because Command Line Tools do not include XCTest. If
Xcode is installed but `xcode-select -p` points to Command Line Tools, select it for the test
command only:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer pnpm record-it test
```

Keep the imported recorder tests as the owner of capture behavior. The
[manual test](../../manual-tests/record-it.md) verifies the app bundle, permissions, and real screen
and camera output.
