## Legacy Snapshot

This directory preserves the previous onboarding-video pipeline that:

- recorded the Chrome window object directly with ScreenCaptureKit
- logged click events from the native cursor driver
- rebuilt click rings, rounded corners, and shadows during FFmpeg post-process

It is intentionally not the active path anymore. The current implementation
focuses on capturing a real desktop scene with a controlled white backdrop so
the final MP4 keeps the native Chrome shadow and native click highlight without
extra presentation math.
