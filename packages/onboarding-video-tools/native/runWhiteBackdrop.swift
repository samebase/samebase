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

struct BackdropOptions {
    let frame: CGRect
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

        guard let frame = try Self.parseRect(values["frame"]) else {
            throw BackdropError.invalidArguments("Missing required --frame")
        }

        self.frame = frame
        self.readyFile = values["ready-file"]
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
            throw BackdropError.invalidArguments("Invalid rect: \(rawRect)")
        }

        return CGRect(x: x, y: y, width: width, height: height)
    }
}

@MainActor
final class BackdropDelegate: NSObject, NSApplicationDelegate {
    private let options: BackdropOptions
    private var window: NSWindow?

    init(options: BackdropOptions) {
        self.options = options
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        do {
            let window = NSWindow(
                contentRect: options.frame,
                styleMask: .borderless,
                backing: .buffered,
                defer: false
            )
            window.title = "OnboardingVideoBackdrop"
            window.backgroundColor = .white
            window.isOpaque = true
            window.hasShadow = false
            window.ignoresMouseEvents = true
            window.level = .normal
            window.collectionBehavior = [.stationary, .moveToActiveSpace]
            window.orderFrontRegardless()
            self.window = window

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
