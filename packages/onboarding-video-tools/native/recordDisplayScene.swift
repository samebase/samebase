import AppKit
import AVFoundation
import CoreGraphics
import CoreMedia
import CoreVideo
import Foundation
import ScreenCaptureKit

enum DisplayRecorderError: Error, CustomStringConvertible {
    case invalidArguments(String)
    case displayNotFound(String)
    case recordingFailed(String)
    case fileWasNotWritten(String)

    var description: String {
        switch self {
        case .invalidArguments(let message),
             .displayNotFound(let message),
             .recordingFailed(let message),
             .fileWasNotWritten(let message):
            return message
        }
    }
}

struct DisplayRecorderOptions {
    let outputPath: String
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
                throw DisplayRecorderError.invalidArguments("Unexpected argument: \(key)")
            }

            guard index + 1 < arguments.count else {
                throw DisplayRecorderError.invalidArguments("Missing value for \(key)")
            }

            values[String(key.dropFirst(2))] = arguments[index + 1]
            index += 2
        }

        guard let outputPath = values["output"], !outputPath.isEmpty else {
            throw DisplayRecorderError.invalidArguments("Missing required --output")
        }

        self.outputPath = outputPath
        self.duration = try Self.parsePositiveDuration(
            values["duration"],
            flagName: "--duration",
            defaultValue: 4
        )
        self.warmupDuration = try Self.parseNonNegativeDuration(
            values["warmup-duration"],
            flagName: "--warmup-duration",
            defaultValue: 0.35
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
            throw DisplayRecorderError.invalidArguments("Invalid \(flagName) value: \(rawValue)")
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
            throw DisplayRecorderError.invalidArguments("Invalid \(flagName) value: \(rawValue)")
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
            throw DisplayRecorderError.invalidArguments("Invalid \(flagName) value: \(rawValue)")
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
            throw DisplayRecorderError.invalidArguments("Invalid \(flagName) value: \(rawValue)")
        }
    }
}

struct DisplayCaptureTarget {
    let display: SCDisplay
    let pointPixelScale: CGFloat
}

@MainActor
final class DisplayRecordingDelegate: NSObject, SCRecordingOutputDelegate {
    private(set) var failure: Error?

    nonisolated
    func recordingOutput(_ recordingOutput: SCRecordingOutput, didFailWithError error: Error) {
        Task { @MainActor in
            self.failure = error
        }
    }
}

func currentMouseLocation() -> CGPoint {
    if let event = CGEvent(source: nil) {
        return event.location
    }

    let fallbackLocation = NSEvent.mouseLocation
    guard let screenFrame = NSScreen.screens.first?.frame else {
        return fallbackLocation
    }

    return CGPoint(
        x: fallbackLocation.x,
        y: screenFrame.maxY - fallbackLocation.y
    )
}

@MainActor
final class DisplaySceneRecorder {
    private var stream: SCStream?
    private var recordingOutput: SCRecordingOutput?
    private var recordingDelegate: DisplayRecordingDelegate?

    func record(options: DisplayRecorderOptions) async throws {
        let outputURL = URL(fileURLWithPath: options.outputPath)
        try FileManager.default.createDirectory(
            at: outputURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )

        if FileManager.default.fileExists(atPath: options.outputPath) {
            try FileManager.default.removeItem(at: outputURL)
        }

        let target = try await selectDisplayTarget()
        let filter = SCContentFilter(display: target.display, excludingWindows: [])
        let scale = max(target.pointPixelScale, 1)

        let configuration = SCStreamConfiguration()
        configuration.width = Int(target.display.frame.width * scale)
        configuration.height = Int(target.display.frame.height * scale)
        configuration.minimumFrameInterval = CMTime(value: 1, timescale: options.fps)
        configuration.pixelFormat = kCVPixelFormatType_32BGRA
        configuration.showsCursor = options.cursorVisible
        configuration.sourceRect = CGRect(
            x: 0,
            y: 0,
            width: target.display.frame.width,
            height: target.display.frame.height
        )
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

        let recordingDelegate = DisplayRecordingDelegate()
        let recordingOutput = SCRecordingOutput(
            configuration: recordingConfiguration,
            delegate: recordingDelegate
        )
        self.recordingDelegate = recordingDelegate
        self.recordingOutput = recordingOutput

        try stream.addRecordingOutput(recordingOutput)
        try await stream.startCapture()
        try await Task.sleep(for: .seconds(options.warmupDuration))
        try await Task.sleep(for: .seconds(options.duration))

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
            throw DisplayRecorderError.recordingFailed(failure.localizedDescription)
        }

        guard FileManager.default.fileExists(atPath: options.outputPath) else {
            throw DisplayRecorderError.fileWasNotWritten(
                "ScreenCaptureKit finished without writing \(options.outputPath)."
            )
        }
    }

    private func selectDisplayTarget() async throws -> DisplayCaptureTarget {
        let mousePoint = currentMouseLocation()
        let content = try await SCShareableContent.excludingDesktopWindows(
            false,
            onScreenWindowsOnly: true
        )

        if let display = content.displays.first(where: {
            mousePoint.x >= $0.frame.minX &&
            mousePoint.x < $0.frame.maxX &&
            mousePoint.y >= $0.frame.minY &&
            mousePoint.y < $0.frame.maxY
        }) {
            let filter = SCContentFilter(display: display, excludingWindows: [])
            let contentInfo = SCShareableContent.info(for: filter)
            return DisplayCaptureTarget(
                display: display,
                pointPixelScale: max(CGFloat(contentInfo.pointPixelScale), 1)
            )
        }

        guard let firstDisplay = content.displays.first else {
            throw DisplayRecorderError.displayNotFound("No shareable displays are available.")
        }

        let filter = SCContentFilter(display: firstDisplay, excludingWindows: [])
        let contentInfo = SCShareableContent.info(for: filter)
        return DisplayCaptureTarget(
            display: firstDisplay,
            pointPixelScale: max(CGFloat(contentInfo.pointPixelScale), 1)
        )
    }
}

@main
@MainActor
enum DisplayRecorderCLI {
    static func main() async {
        do {
            _ = NSApplication.shared
            let options = try DisplayRecorderOptions(arguments: Array(CommandLine.arguments.dropFirst()))
            let recorder = DisplaySceneRecorder()
            try await recorder.record(options: options)
            print(options.outputPath)
        } catch {
            fputs("recordDisplayScene.swift failed: \(error)\n", stderr)
            exit(1)
        }
    }
}
