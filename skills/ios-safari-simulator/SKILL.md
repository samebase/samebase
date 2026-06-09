---
name: ios-safari-simulator
description:
  Start, inspect, and reason about Apple iOS Simulator for Noter web testing. Use when asked to test
  noter.md or the Noter app in Mobile Safari, install or inspect an iOS Home Screen PWA, debug
  iPhone-only focus or software-keyboard behavior, compare Simulator versus real iPhone coverage, or
  recover missing Xcode/simctl/iOS runtime setup on a Mac.
---

# iOS Safari Simulator

## Overview

Use Apple's Simulator as the first iOS Safari/PWA reproduction surface, then keep real iPhone
confirmation for bugs whose pass/fail condition is touch or software-keyboard behavior.

## Local Setup

Start by checking whether the active developer directory exposes Simulator tools:

```bash
xcode-select -p
xcrun simctl list runtimes available
```

If `simctl` is missing and full Xcode is installed at `/Applications/Xcode.app`, use this prefix
instead of changing the global Xcode selection:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun simctl list runtimes available
```

If no iOS runtime is listed, install the current iOS Simulator runtime:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild -downloadPlatform iOS -architectureVariant arm64
```

On 2026-06-09 this Mac successfully installed `iOS 26.3.1 (23D8133)` with that command. Do not
assume the exact runtime version later; list runtimes after install.

## Boot And Open Noter

List generated devices and pick an iPhone that matches the available runtime:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun simctl list devices available
```

Boot the device and wait for the first-boot migration to finish:

```bash
DEVICE="<simulator-udid>"

DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun simctl boot "$DEVICE"
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun simctl bootstatus "$DEVICE" -b
open -a Simulator
```

Open the public site or a local dev URL in Mobile Safari:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun simctl openurl "$DEVICE" https://noter.md
```

Capture evidence:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun simctl io "$DEVICE" screenshot /tmp/noter-ios-simulator.png
```

Use `simctl io "$DEVICE" recordVideo <file>` when motion or keyboard transition evidence matters.

## Debug Safari And PWA Behavior

Use Simulator for fast triage:

- Open Mobile Safari and install the PWA manually through the Share menu when testing Home Screen
  behavior.
- Use Safari on macOS and its Develop/Web Inspector surface to inspect the booted simulator page,
  service worker, or foregrounded Home Screen web app.
- For software-keyboard checks, turn off the connected hardware keyboard in the Simulator menu:
  `I/O > Keyboard > Connect Hardware Keyboard`.

Keep these limits explicit:

- Simulator is not hardware. It is useful for reproduction, screenshots, and event tracing, but not
  final proof for physical touch or software-keyboard behavior.
- Playwright's Mobile Safari project is WebKit plus device emulation, not real iPhone Safari.
- Cypress WebKit is not a real iOS Safari/PWA surface.
- `safaridriver` is Apple's official WebDriver path for Safari automation; Appium/XCUITest is the
  practical route for native taps, Home Screen steps, and richer real-device automation.
- iPhone Mirroring is a useful convenience fallback, but because clicks and typing are routed
  through the Mac, use direct touch on a real iPhone for final keyboard confirmation.

## iPhone Keyboard Investigation

For bugs like "the URL editor focuses on iPhone but the software keyboard does not open":

1. Reproduce in Simulator Safari first with the hardware keyboard disconnected.
2. Inspect through Safari Web Inspector and check:
   - `document.activeElement`
   - focus and blur event order
   - `navigator.userActivation.isActive`
   - `visualViewport.height` changes
   - `readonly` or `disabled` state
   - overlays, pointer handlers, and `preventDefault`
3. Look for focus that happens after the direct tap, such as React rendering the input and a later
   effect calling `focus()`. iOS can focus the element without opening the software keyboard when
   focus is no longer part of the direct user gesture.
4. Confirm the fix on a real iPhone in both Safari and the installed Home Screen PWA.

For a physical iPhone, enable Web Inspector in iOS Safari settings, trust the Mac over cable, then
inspect Safari pages or foregrounded Home Screen web apps from Safari on macOS. Enable Remote
Automation too when using `safaridriver`.
