---
name: mac-app-control
description:
  Inspect and control macOS apps with native tools. Use when asked to open,
  verify, screenshot, close, or automate a Mac app or native dialog; when you
  need to target one exact app instance or profile; or when browser/DOM tools
  cannot see the relevant UI.
---

# Mac App Control

## Goal

Use macOS-native primitives to identify the exact app, process, and window you
need, then automate the narrowest possible surface without disturbing unrelated
apps or shared state.

## When To Use

Use this skill when the task involves any of these:

- A native macOS window, popup, sheet, or menu that web automation cannot see.
- Multiple instances of the same app and you must target only one of them.
- Process-scoped screenshots or verification of a visible app window.
- Safe cleanup of one exact browser profile, worktree session, or app process.
- Adapting the repo's branch-owned Playwright browser patterns to another Mac
  app.

Example requests:

- "Open the worktree browser and confirm a native prompt is gone."
- "Take a screenshot of the Slack window with this workspace."
- "Close only the Chrome profile tied to this repo."
- "Figure out which app window owns this native dialog."

## Workflow

1. Identify the exact target process.

- Prefer a stable differentiator: bundle name, PID, profile path, session name,
  or unique command-line flag.
- Use targeted process inspection first. Match on `--user-data-dir=` because
  this repo pins a bundled Playwright browser and the visible app name can vary:

```bash
ps -axo pid=,args= | grep -F -- "--user-data-dir="
```

- For this repo's branch-owned browser session:

```bash
node ./scripts/playwright-branch-browser.js session
node ./scripts/playwright-branch-browser.js profile
```

2. Enumerate visible windows without Accessibility prompts.

- Use CoreGraphics window listing through `swift`. This reads the native window
  list directly and does not require UI scripting permissions.
- Filter by PID instead of guessing by title alone.

```bash
swift -e '
import Foundation
import CoreGraphics
let targetPid = Int(CommandLine.arguments[1]) ?? -1
let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]] ?? []
let matches = windows.compactMap { window -> [String: Any]? in
  guard let ownerPid = window[kCGWindowOwnerPID as String] as? Int, ownerPid == targetPid else {
    return nil
  }
  return [
    "title": window[kCGWindowName as String] as? String ?? "",
    "owner": window[kCGWindowOwnerName as String] as? String ?? "",
    "windowId": window[kCGWindowNumber as String] as? Int ?? -1
  ]
}
let data = try JSONSerialization.data(withJSONObject: matches)
FileHandle.standardOutput.write(data)
' 41763
```

3. Capture evidence before changing state.

- For a native screenshot of one exact window:

```bash
screencapture -l 8237 /tmp/mac-window.png
```

- Prefer a window-scoped capture over full-screen screenshots when verifying a
  prompt or theme color.
- In this repo, use the branch-owned browser launcher first, then verify with
  native window inspection:

```bash
node ./scripts/playwright-branch-browser.js verify
```

4. Choose the narrowest control surface.

- Prefer an app-owned CLI or repo-owned wrapper over raw AppleScript when one
  exists.
- Prefer background or profile-scoped control over activating a visible app.
- Use AppleScript only for simple app-level actions such as activate, open,
  close, or tab creation.

```bash
osascript -e 'tell application "Google Chrome" to activate'
osascript -e 'tell application "Finder" to open POSIX file "/Applications"'
```

- Use `System Events` UI scripting only when there is no better API and the task
  truly requires native control of buttons or menus. Note that this may require
  Automation or Accessibility consent.

5. Clean up precisely.

- Never kill all processes for a shared app like Chrome.
- Kill only the exact PID or the exact profile-owned process group you already
  identified.
- In this repo, prefer the branch-owned wrapper over ad hoc process control:

```bash
node ./scripts/playwright-branch-browser.js open --headed
node ./scripts/playwright-branch-browser.js cli close
```

## Repo-Specific Pattern

When the target is a browser session for this repository:

- Prefer `node ./scripts/playwright-branch-browser.js` over raw
  `@playwright/cli`.
- One branch owns one deterministic profile directory and one deterministic
  session name.
- Native verification belongs at the process/window layer, not the page DOM,
  when the issue is browser chrome, crash prompts, or theme color.
- Distinguish parallel sessions visually with deterministic browser chrome tint,
  not shared extensions or shared profiles.

## Safety Rules

- Do not steal OS focus unless the task explicitly requires a visible app.
- Do not use `killall` for shared apps.
- Do not guess which window is correct when you can filter by PID.
- Capture evidence before destructive cleanup.
- Prefer non-invasive inspection first: process list, window list, screenshot,
  then automation.
