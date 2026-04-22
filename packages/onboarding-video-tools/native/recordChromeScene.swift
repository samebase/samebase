import AppKit
import AVFoundation
import CoreGraphics
import CoreMedia
import CoreVideo
import Foundation
import ScreenCaptureKit

enum RecorderError: Error, CustomStringConvertible {
    case invalidArguments(String)
    case windowNotFound(String)
    case recordingFailed(String)
    case fileWasNotWritten(String)

    var description: String {
        switch self {
        case .invalidArguments(let message),
             .windowNotFound(let message),
             .recordingFailed(let message),
             .fileWasNotWritten(let message):
            return message
        }
    }
}

struct RecorderOptions {
    let bundleID: String
    let windowFrame: CGRect
    let captureFrame: CGRect
    let outputPath: String
    let startedFile: String?
    let duration: TimeInterval
    let warmupDuration: TimeInterval
    let fps: Int32
    let cursorVisible: Bool
    let clickHighlightsVisible: Bool

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
                throw RecorderError.invalidArguments("Unexpected argument: \(key)")
            }

            guard index + 1 < arguments.count else {
                throw RecorderError.invalidArguments("Missing value for \(key)")
            }

            values[String(key.dropFirst(2))] = arguments[index + 1]
            index += 2
        }

        guard let bundleID = values["bundle-id"], !bundleID.isEmpty else {
            throw RecorderError.invalidArguments("Missing required --bundle-id")
        }

        guard let outputPath = values["output"], !outputPath.isEmpty else {
            throw RecorderError.invalidArguments("Missing required --output")
        }

        guard let windowFrame = try Self.parseRect(values["window-frame"]) else {
            throw RecorderError.invalidArguments("Missing required --window-frame")
        }

        guard let captureFrame = try Self.parseRect(values["capture-frame"]) else {
            throw RecorderError.invalidArguments("Missing required --capture-frame")
        }

        self.bundleID = bundleID
        self.windowFrame = windowFrame
        self.captureFrame = captureFrame
        self.outputPath = outputPath
        self.startedFile = values["started-file"]
        self.duration = try Self.parsePositiveDuration(
            values["duration"],
            flagName: "--duration",
            defaultValue: 4
        )
        self.warmupDuration = try Self.parseNonNegativeDuration(
            values["warmup-duration"],
            flagName: "--warmup-duration",
            defaultValue: 0.8
        )
        self.fps = try Self.parsePositiveInt32(
            values["fps"],
            flagName: "--fps",
            defaultValue: 30
        )
        self.cursorVisible = try Self.parseBool(
            values["cursor"],
            flagName: "--cursor",
            defaultValue: true
        )
        self.clickHighlightsVisible = try Self.parseBool(
            values["click-highlights"],
            flagName: "--click-highlights",
            defaultValue: true
        )
    }

    private static func parsePositiveDuration(
        _ rawValue: String?,
        flagName: String,
        defaultValue: TimeInterval
    ) throws -> TimeInterval {
        guard let rawValue else {
            return defaultValue
        }

        guard let duration = TimeInterval(rawValue), duration.isFinite, duration > 0 else {
            throw RecorderError.invalidArguments("Invalid \(flagName) value: \(rawValue)")
        }

        return duration
    }

    private static func parseNonNegativeDuration(
        _ rawValue: String?,
        flagName: String,
        defaultValue: TimeInterval
    ) throws -> TimeInterval {
        guard let rawValue else {
            return defaultValue
        }

        guard let duration = TimeInterval(rawValue), duration.isFinite, duration >= 0 else {
            throw RecorderError.invalidArguments("Invalid \(flagName) value: \(rawValue)")
        }

        return duration
    }

    private static func parsePositiveInt32(
        _ rawValue: String?,
        flagName: String,
        defaultValue: Int32
    ) throws -> Int32 {
        guard let rawValue else {
            return defaultValue
        }

        guard let value = Int32(rawValue), value > 0 else {
            throw RecorderError.invalidArguments("Invalid \(flagName) value: \(rawValue)")
        }

        return value
    }

    private static func parseBool(
        _ rawValue: String?,
        flagName: String,
        defaultValue: Bool
    ) throws -> Bool {
        guard let rawValue else {
            return defaultValue
        }

        switch rawValue.lowercased() {
        case "true":
            return true
        case "false":
            return false
        default:
            throw RecorderError.invalidArguments("Invalid \(flagName) value: \(rawValue)")
        }
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
            throw RecorderError.invalidArguments("Invalid rect: \(rawRect)")
        }

        return CGRect(x: x, y: y, width: width, height: height)
    }
}

struct CaptureTarget {
    let display: SCDisplay
    let pointPixelScale: CGFloat
    let sourceRect: CGRect
}

final class StopSignalMonitor {
    private(set) var shouldStop = false
    private var sources: [DispatchSourceSignal] = []

    init() {
        for signalNumber in [SIGTERM, SIGINT] {
            signal(signalNumber, SIG_IGN)
            let source = DispatchSource.makeSignalSource(signal: signalNumber, queue: .main)
            source.setEventHandler { [weak self] in
                self?.shouldStop = true
            }
            source.resume()
            sources.append(source)
        }
    }
}

@MainActor
final class RecordingDelegate: NSObject, SCRecordingOutputDelegate {
    private(set) var failure: Error?

    nonisolated
    func recordingOutput(_ recordingOutput: SCRecordingOutput, didFailWithError error: Error) {
        Task { @MainActor in
            self.failure = error
        }
    }
}

@MainActor
final class ChromeSceneRecorder {
    private var stream: SCStream?
    private var recordingOutput: SCRecordingOutput?
    private var recordingDelegate: RecordingDelegate?
    private let stopSignalMonitor = StopSignalMonitor()

    func record(options: RecorderOptions) async throws {
        let outputURL = URL(fileURLWithPath: options.outputPath)
        try FileManager.default.createDirectory(
            at: outputURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )

        if FileManager.default.fileExists(atPath: options.outputPath) {
            try FileManager.default.removeItem(at: outputURL)
        }

        let target = try await waitForCaptureTarget(
            bundleID: options.bundleID,
            windowFrame: options.windowFrame,
            captureFrame: options.captureFrame,
            timeout: 15
        )

        let filter = SCContentFilter(display: target.display, excludingWindows: [])
        let scale = max(target.pointPixelScale, 1)

        let configuration = SCStreamConfiguration()
        configuration.width = Int(options.captureFrame.width * scale)
        configuration.height = Int(options.captureFrame.height * scale)
        configuration.minimumFrameInterval = CMTime(value: 1, timescale: options.fps)
        configuration.pixelFormat = kCVPixelFormatType_32BGRA
        configuration.showsCursor = options.cursorVisible
        configuration.sourceRect = target.sourceRect
        configuration.scalesToFit = true

        if #available(macOS 15.0, *) {
            configuration.showMouseClicks = options.clickHighlightsVisible
        }

        let stream = SCStream(filter: filter, configuration: configuration, delegate: nil)
        self.stream = stream

        let recordingConfiguration = SCRecordingOutputConfiguration()
        recordingConfiguration.outputURL = outputURL
        recordingConfiguration.videoCodecType = .h264
        recordingConfiguration.outputFileType = .mp4

        let recordingDelegate = RecordingDelegate()
        let recordingOutput = SCRecordingOutput(
            configuration: recordingConfiguration,
            delegate: recordingDelegate
        )
        self.recordingDelegate = recordingDelegate
        self.recordingOutput = recordingOutput

        try stream.addRecordingOutput(recordingOutput)
        try await stream.startCapture()

        if let startedFile = options.startedFile {
            try "\(Date().timeIntervalSince1970)\n".write(
                to: URL(fileURLWithPath: startedFile),
                atomically: true,
                encoding: .utf8
            )
        }

        try await waitUntilDurationExpiresOrStopRequested(options.warmupDuration)
        try await waitUntilDurationExpiresOrStopRequested(options.duration)

        do {
            try await stream.stopCapture()
        } catch {
            let nsError = error as NSError
            let alreadyStopped =
                nsError.domain == "com.apple.ScreenCaptureKit.SCStreamErrorDomain" &&
                nsError.code == -3808

            if !alreadyStopped {
                throw error
            }
        }

        try await Task.sleep(for: .seconds(1.2))

        if let failure = recordingDelegate.failure {
            throw RecorderError.recordingFailed(failure.localizedDescription)
        }

        guard FileManager.default.fileExists(atPath: options.outputPath) else {
            throw RecorderError.fileWasNotWritten(
                "ScreenCaptureKit finished without writing \(options.outputPath)."
            )
        }
    }

    private func waitForCaptureTarget(
        bundleID: String,
        windowFrame: CGRect,
        captureFrame: CGRect,
        timeout: TimeInterval
    ) async throws -> CaptureTarget {
        let deadline = Date().addingTimeInterval(timeout)

        while Date() < deadline {
            let content = try await SCShareableContent.excludingDesktopWindows(
                false,
                onScreenWindowsOnly: true
            )

            let matchingWindow = content.windows.first(where: {
                guard
                    let owningApplication = $0.owningApplication,
                    owningApplication.bundleIdentifier == bundleID
                else {
                    return false
                }

                return framesMatch(lhs: $0.frame, rhs: windowFrame)
            })

            let matchingDisplay = content.displays.first(where: {
                rectContainsRect(outer: $0.frame, inner: captureFrame)
            })

            if let matchingWindow, let matchingDisplay {
                let filter = SCContentFilter(display: matchingDisplay, excludingWindows: [])
                let contentInfo = SCShareableContent.info(for: filter)
                let sourceRect = CGRect(
                    x: captureFrame.minX - matchingDisplay.frame.minX,
                    y: captureFrame.minY - matchingDisplay.frame.minY,
                    width: captureFrame.width,
                    height: captureFrame.height
                )

                _ = matchingWindow
                return CaptureTarget(
                    display: matchingDisplay,
                    pointPixelScale: max(CGFloat(contentInfo.pointPixelScale), 1),
                    sourceRect: sourceRect
                )
            }

            try await Task.sleep(for: .milliseconds(250))
        }

        throw RecorderError.windowNotFound(
            "Could not find an on-screen window for \(bundleID) matching the requested frame."
        )
    }

    private func rectContainsRect(outer: CGRect, inner: CGRect) -> Bool {
        inner.minX >= outer.minX &&
        inner.minY >= outer.minY &&
        inner.maxX <= outer.maxX &&
        inner.maxY <= outer.maxY
    }

    private func framesMatch(lhs: CGRect, rhs: CGRect) -> Bool {
        abs(lhs.origin.x - rhs.origin.x) < 2 &&
        abs(lhs.origin.y - rhs.origin.y) < 2 &&
        abs(lhs.size.width - rhs.size.width) < 2 &&
        abs(lhs.size.height - rhs.size.height) < 2
    }

    private func waitUntilDurationExpiresOrStopRequested(_ duration: TimeInterval) async throws {
        let deadline = Date().addingTimeInterval(duration)

        while !stopSignalMonitor.shouldStop {
            let remaining = deadline.timeIntervalSinceNow
            if remaining <= 0 {
                return
            }

            try await Task.sleep(for: .seconds(min(remaining, 0.1)))
        }
    }
}

@main
@MainActor
enum RecorderCLI {
    static func main() async {
        do {
            _ = NSApplication.shared
            let options = try RecorderOptions(arguments: Array(CommandLine.arguments.dropFirst()))
            let recorder = ChromeSceneRecorder()
            try await recorder.record(options: options)
            print(options.outputPath)
        } catch {
            fputs("recordChromeScene.swift failed: \(error)\n", stderr)
            exit(1)
        }
    }
}
