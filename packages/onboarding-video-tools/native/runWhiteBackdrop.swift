import AppKit
import Foundation

enum BackdropError: Error, CustomStringConvertible {
    case invalidArguments(String)

    var description: String {
        switch self {
        case .invalidArguments(let message):
            return message
        }
    }
}

func frontmostChromeWindowNumber() -> Int? {
    guard
        let infoList = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID)
            as? [[String: Any]]
    else {
        return nil
    }

    for info in infoList {
        guard
            let owner = info[kCGWindowOwnerName as String] as? String,
            owner == "Google Chrome",
            let layer = info[kCGWindowLayer as String] as? Int,
            layer == 0,
            let bounds = info[kCGWindowBounds as String] as? [String: Any],
            let rect = CGRect(dictionaryRepresentation: bounds as CFDictionary),
            rect.width > 160,
            rect.height > 160,
            let windowNumber = info[kCGWindowNumber as String] as? Int
        else {
            continue
        }

        return windowNumber
    }

    return nil
}

struct BackdropOptions {
    let readyFile: String?

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
                throw BackdropError.invalidArguments("Unexpected argument: \(key)")
            }

            guard index + 1 < arguments.count else {
                throw BackdropError.invalidArguments("Missing value for \(key)")
            }

            values[String(key.dropFirst(2))] = arguments[index + 1]
            index += 2
        }
        self.readyFile = values["ready-file"]
    }
}

@MainActor
final class BackdropDelegate: NSObject, NSApplicationDelegate {
    private let options: BackdropOptions
    private var windows: [NSWindow] = []

    init(options: BackdropOptions) {
        self.options = options
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        do {
            guard !NSScreen.screens.isEmpty else {
                throw BackdropError.invalidArguments("No screens were available for backdrop setup.")
            }

            self.windows = NSScreen.screens.map { screen in
                let window = NSWindow(
                    contentRect: screen.frame,
                    styleMask: .borderless,
                    backing: .buffered,
                    defer: false,
                    screen: screen
                )
                // Fill the full display so the recorded crop always sees a
                // controlled white scene instead of whatever other apps happen
                // to be on the active desktop.
                window.setFrame(screen.frame, display: true)
                window.title = "OnboardingVideoBackdrop"
                window.backgroundColor = .white
                window.isOpaque = true
                window.hasShadow = false
                window.ignoresMouseEvents = true
                // Keep the backdrop in the normal stacking context so it can sit
                // immediately underneath Chrome, not behind every other app on
                // the desktop.
                window.level = .normal
                window.collectionBehavior = [.stationary, .moveToActiveSpace]
                if let chromeWindowNumber = frontmostChromeWindowNumber() {
                    window.order(.below, relativeTo: chromeWindowNumber)
                } else {
                    window.orderBack(nil)
                }
                return window
            }

            if let readyFile = options.readyFile {
                try "ready\n".write(
                    to: URL(fileURLWithPath: readyFile),
                    atomically: true,
                    encoding: .utf8
                )
            }
        } catch {
            fputs("runWhiteBackdrop.swift failed: \(error)\n", stderr)
            NSApp.terminate(nil)
        }
    }
}

@main
@MainActor
enum BackdropCLI {
    static func main() {
        do {
            let app = NSApplication.shared
            app.setActivationPolicy(.accessory)
            let options = try BackdropOptions(arguments: Array(CommandLine.arguments.dropFirst()))
            let delegate = BackdropDelegate(options: options)
            app.delegate = delegate
            app.run()
        } catch {
            fputs("runWhiteBackdrop.swift failed: \(error)\n", stderr)
            exit(1)
        }
    }
}
