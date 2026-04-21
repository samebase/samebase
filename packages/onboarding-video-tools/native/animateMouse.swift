import AppKit
import CoreGraphics
import Foundation

enum MouseAnimationError: Error, CustomStringConvertible {
    case invalidArguments(String)
    case noActions
    case safetyCheckFailed(String)

    var description: String {
        switch self {
        case .invalidArguments(let message):
            return message
        case .noActions:
            return "Provide at least one action with --actions."
        case .safetyCheckFailed(let message):
            return message
        }
    }
}

enum MouseAction {
    case click(CGPoint)
    case wait(TimeInterval)
}

struct MouseAnimationOptions {
    let actions: [MouseAction]
    let moveDuration: TimeInterval
    let pauseBeforeClick: TimeInterval
    let clickHoldDuration: TimeInterval
    let pauseAfterClick: TimeInterval
    let requireFrontmostBundle: String?
    let requireWindowOwner: String?
    let requireWindowFrame: CGRect?

    init(arguments: [String]) throws {
        var values: [String: String] = [:]
        var index = 0

        while index < arguments.count {
            let key = arguments[index]

            if key == "--" {
                index += 1
                continue
            }

            guard key.hasPrefix("--") else {
                throw MouseAnimationError.invalidArguments("Unexpected argument: \(key)")
            }

            guard index + 1 < arguments.count else {
                throw MouseAnimationError.invalidArguments("Missing value for \(key)")
            }

            values[String(key.dropFirst(2))] = arguments[index + 1]
            index += 2
        }

        guard let rawActions = values["actions"] else {
            throw MouseAnimationError.invalidArguments("Missing required --actions")
        }

        let parsedActions = try Self.parseActions(rawActions)
        guard !parsedActions.isEmpty else {
            throw MouseAnimationError.noActions
        }

        self.actions = parsedActions
        self.moveDuration = try Self.parseNonNegativeDuration(
            values["move-duration"],
            flagName: "--move-duration",
            defaultValue: 0.7
        )
        self.pauseBeforeClick = try Self.parseNonNegativeDuration(
            values["pause-before-click"],
            flagName: "--pause-before-click",
            defaultValue: 0.12
        )
        self.clickHoldDuration = try Self.parseNonNegativeDuration(
            values["click-hold-duration"],
            flagName: "--click-hold-duration",
            defaultValue: 0.08
        )
        self.pauseAfterClick = try Self.parseNonNegativeDuration(
            values["pause-after-click"],
            flagName: "--pause-after-click",
            defaultValue: 0.24
        )
        self.requireFrontmostBundle = values["require-frontmost-bundle"]
        self.requireWindowOwner = values["require-window-owner"]
        self.requireWindowFrame = try Self.parseRect(values["require-window-frame"])
    }

    private static func parseActions(_ rawActions: String) throws -> [MouseAction] {
        try rawActions.split(separator: ";").map { rawAction in
            let pieces = rawAction.split(separator: ":", maxSplits: 1)
            guard pieces.count == 2 else {
                throw MouseAnimationError.invalidArguments("Invalid action: \(rawAction)")
            }

            let verb = pieces[0].trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let value = pieces[1].trimmingCharacters(in: .whitespacesAndNewlines)

            switch verb {
            case "click", "left":
                return .click(try parsePoint(value))
            case "wait", "pause":
                return .wait(
                    try parseNonNegativeDuration(
                        value,
                        context: "Invalid wait duration: \(rawAction)"
                    )
                )
            default:
                throw MouseAnimationError.invalidArguments(
                    "Unsupported action verb: \(verb). This tool only supports left clicks and waits."
                )
            }
        }
    }

    private static func parseNonNegativeDuration(
        _ rawValue: String?,
        flagName: String,
        defaultValue: TimeInterval
    ) throws -> TimeInterval {
        guard let rawValue else {
            return defaultValue
        }

        return try parseNonNegativeDuration(
            rawValue,
            context: "Invalid \(flagName) value: \(rawValue)"
        )
    }

    private static func parseNonNegativeDuration(
        _ rawValue: String,
        context: String
    ) throws -> TimeInterval {
        guard let duration = TimeInterval(rawValue), duration.isFinite, duration >= 0 else {
            throw MouseAnimationError.invalidArguments(context)
        }

        return duration
    }

    private static func parsePoint(_ rawPoint: String) throws -> CGPoint {
        let components = rawPoint.split(separator: ",")
        guard
            components.count == 2,
            let x = Double(components[0]),
            let y = Double(components[1]),
            x.isFinite,
            y.isFinite
        else {
            throw MouseAnimationError.invalidArguments("Invalid point: \(rawPoint)")
        }

        return CGPoint(x: x, y: y)
    }

    private static func parseRect(_ rawRect: String?) throws -> CGRect? {
        guard let rawRect else {
            return nil
        }

        let components = rawRect.split(separator: ",")
        guard
            components.count == 4,
            let x = Double(components[0]),
            let y = Double(components[1]),
            let width = Double(components[2]),
            let height = Double(components[3]),
            x.isFinite,
            y.isFinite,
            width.isFinite,
            height.isFinite,
            width > 0,
            height > 0
        else {
            throw MouseAnimationError.invalidArguments("Invalid rect: \(rawRect)")
        }

        return CGRect(x: x, y: y, width: width, height: height)
    }
}

func currentMouseLocation() -> CGPoint {
    if let event = CGEvent(source: nil) {
        return event.location
    }

    // NSEvent falls back to a bottom-left origin, so normalize it into the
    // same top-left desktop coordinate space used by CGEvent and CGWindow APIs.
    let fallbackLocation = NSEvent.mouseLocation
    guard let desktopFrame = visibleDesktopFrame() else {
        return fallbackLocation
    }

    return CGPoint(
        x: fallbackLocation.x,
        y: desktopFrame.maxY - fallbackLocation.y
    )
}

func visibleDesktopFrame() -> CGRect? {
    let screenFrames = NSScreen.screens.map(\.frame)
    guard let firstFrame = screenFrames.first else {
        return nil
    }

    return screenFrames.dropFirst().reduce(firstFrame) { partialFrame, screenFrame in
        partialFrame.union(screenFrame)
    }
}

func sleepSeconds(_ duration: TimeInterval) {
    guard duration.isFinite, duration > 0 else {
        return
    }

    Thread.sleep(forTimeInterval: duration)
}

func frontmostBundleIdentifier() -> String? {
    NSWorkspace.shared.frontmostApplication?.bundleIdentifier
}

func frontmostWindowFrame(ownerName: String) -> CGRect? {
    guard
        let infoList = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID)
            as? [[String: Any]]
    else {
        return nil
    }

    for info in infoList {
        guard
            let owner = info[kCGWindowOwnerName as String] as? String,
            owner == ownerName,
            let layer = info[kCGWindowLayer as String] as? Int,
            layer == 0,
            let bounds = info[kCGWindowBounds as String] as? [String: Any],
            let rect = CGRect(dictionaryRepresentation: bounds as CFDictionary),
            rect.width > 160,
            rect.height > 160
        else {
            continue
        }

        return rect
    }

    return nil
}

func verifyFrontmostBundle(_ expectedBundle: String?) throws {
    guard let expectedBundle else {
        return
    }

    guard frontmostBundleIdentifier() == expectedBundle else {
        let actual = frontmostBundleIdentifier() ?? "<none>"
        throw MouseAnimationError.safetyCheckFailed(
            "Aborted mouse automation because the frontmost app was \(actual), not \(expectedBundle)."
        )
    }
}

func verifyWindowFrame(ownerName: String?, expectedFrame: CGRect?) throws -> CGRect? {
    guard let ownerName else {
        return nil
    }

    guard let frame = frontmostWindowFrame(ownerName: ownerName) else {
        throw MouseAnimationError.safetyCheckFailed(
            "Aborted mouse automation because no visible \(ownerName) window could be found."
        )
    }

    if let expectedFrame {
        let tolerance: CGFloat = 8
        let deltas = (
            abs(frame.origin.x - expectedFrame.origin.x),
            abs(frame.origin.y - expectedFrame.origin.y),
            abs(frame.width - expectedFrame.width),
            abs(frame.height - expectedFrame.height)
        )

        guard
            deltas.0 <= tolerance,
            deltas.1 <= tolerance,
            deltas.2 <= tolerance,
            deltas.3 <= tolerance
        else {
            throw MouseAnimationError.safetyCheckFailed(
                "Aborted mouse automation because the visible \(ownerName) window frame \(NSStringFromRect(frame)) no longer matched the expected frame \(NSStringFromRect(expectedFrame))."
            )
        }
    }

    return frame
}

func verifyPoint(
    _ point: CGPoint,
    insideWindowOwner ownerName: String?,
    expectedFrame: CGRect?
) throws {
    guard let ownerName else {
        return
    }

    guard let frame = try verifyWindowFrame(ownerName: ownerName, expectedFrame: expectedFrame) else {
        return
    }

    let insetFrame = frame.insetBy(dx: 2, dy: 2)
    guard insetFrame.contains(point) else {
        throw MouseAnimationError.safetyCheckFailed(
            "Aborted mouse automation because target point \(Int(point.x)),\(Int(point.y)) was outside the visible \(ownerName) window frame \(NSStringFromRect(insetFrame))."
        )
    }
}

func verifyCurrentPointerInsideWindow(ownerName: String?, expectedFrame: CGRect?) throws {
    guard let ownerName else {
        return
    }

    try verifyPoint(currentMouseLocation(), insideWindowOwner: ownerName, expectedFrame: expectedFrame)
}

func moveCursor(
    from start: CGPoint,
    to end: CGPoint,
    duration: TimeInterval,
    validator: (() throws -> Void)? = nil
) throws {
    guard duration > 0 else {
        CGWarpMouseCursorPosition(end)
        return
    }

    let animationStart = ProcessInfo.processInfo.systemUptime
    let frameDuration: TimeInterval = 1.0 / 120.0

    while true {
        try validator?()
        let elapsed = ProcessInfo.processInfo.systemUptime - animationStart
        let progress = min(elapsed / duration, 1.0)
        let eased = 1 - pow(1 - progress, 3)
        let point = CGPoint(
            x: start.x + (end.x - start.x) * eased,
            y: start.y + (end.y - start.y) * eased
        )
        CGWarpMouseCursorPosition(point)

        if progress >= 1 {
            return
        }

        sleepSeconds(min(frameDuration, duration - elapsed))
    }
}

func moveCursorToVerifiedPoint(
    currentPoint: inout CGPoint,
    target point: CGPoint,
    options: MouseAnimationOptions,
    validateSafety: @escaping () throws -> Void
) throws {
    try validateSafety()
    try verifyPoint(
        point,
        insideWindowOwner: options.requireWindowOwner,
        expectedFrame: options.requireWindowFrame
    )
    try moveCursor(
        from: currentPoint,
        to: point,
        duration: options.moveDuration,
        validator: validateSafety
    )
    currentPoint = point
}

func makeLeftMouseEvent(type: CGEventType, point: CGPoint) -> CGEvent? {
    let event = CGEvent(
        mouseEventSource: nil,
        mouseType: type,
        mouseCursorPosition: point,
        mouseButton: .left
    )
    event?.setIntegerValueField(.mouseEventClickState, value: 1)
    return event
}

func leftClick(at point: CGPoint, holdDuration: TimeInterval) {
    guard
        let mouseDown = makeLeftMouseEvent(type: .leftMouseDown, point: point),
        let mouseUp = makeLeftMouseEvent(type: .leftMouseUp, point: point)
    else {
        return
    }

    mouseDown.post(tap: .cghidEventTap)
    sleepSeconds(holdDuration)
    mouseUp.post(tap: .cghidEventTap)
}

func performLeftClick(
    currentPoint: inout CGPoint,
    target point: CGPoint,
    options: MouseAnimationOptions,
    validateSafety: @escaping () throws -> Void
) throws {
    try moveCursorToVerifiedPoint(
        currentPoint: &currentPoint,
        target: point,
        options: options,
        validateSafety: validateSafety
    )
    sleepSeconds(options.pauseBeforeClick)
    try validateSafety()
    try verifyPoint(
        point,
        insideWindowOwner: options.requireWindowOwner,
        expectedFrame: options.requireWindowFrame
    )
    leftClick(at: point, holdDuration: options.clickHoldDuration)
    sleepSeconds(options.pauseAfterClick)
}

@main
enum MouseAnimationCLI {
    static func main() {
        do {
            let options = try MouseAnimationOptions(arguments: Array(CommandLine.arguments.dropFirst()))
            var currentPoint = currentMouseLocation()
            let validateSafety = {
                try verifyFrontmostBundle(options.requireFrontmostBundle)
                _ = try verifyWindowFrame(
                    ownerName: options.requireWindowOwner,
                    expectedFrame: options.requireWindowFrame
                )
            }

            for action in options.actions {
                switch action {
                case .click(let point):
                    try performLeftClick(
                        currentPoint: &currentPoint,
                        target: point,
                        options: options,
                        validateSafety: validateSafety
                    )
                case .wait(let duration):
                    try validateSafety()
                    try verifyCurrentPointerInsideWindow(
                        ownerName: options.requireWindowOwner,
                        expectedFrame: options.requireWindowFrame
                    )
                    sleepSeconds(duration)
                }
            }
        } catch {
            fputs("animateMouse.swift failed: \(error)\n", stderr)
            exit(1)
        }
    }
}
