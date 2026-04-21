import { spawn, type ChildProcessByStdio } from "node:child_process";
import { access, mkdtemp, mkdir, readFile, rm, stat } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

type ParsedArgs = Record<string, string | undefined>;
type BufferedChildProcess = ChildProcessByStdio<null, Readable, Readable>;

type ScreenPoint = {
  x: number;
  y: number;
};

type WindowFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type LandingCoords = {
  github: { page: ScreenPoint };
  convex: { page: ScreenPoint };
  cloudflare: { page: ScreenPoint };
  codex: { page: ScreenPoint };
  tabs: {
    github: ScreenPoint;
    convex: ScreenPoint;
    cloudflare: ScreenPoint;
    codex: ScreenPoint;
  };
  windowFrame: WindowFrame;
};

type LandingDemoOptions = {
  githubUrl: string;
  convexUrl: string;
  cloudflareUrl: string;
  codexUrl: string;
  outputPath: string;
  padPoints: number;
};

type ScreenDemoOptions = {
  outputPath: string;
  durationSeconds: number;
};

type LandingDemoTarget =
  | "tabs.github"
  | "github.page"
  | "tabs.convex"
  | "convex.page"
  | "tabs.cloudflare"
  | "cloudflare.page"
  | "tabs.codex"
  | "codex.page";

type LandingDemoStep =
  | {
      kind: "click";
      target: LandingDemoTarget;
    }
  | {
      kind: "wait";
      seconds: number;
    };

const PACKAGE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(PACKAGE_DIR, "../..");
const DEFAULT_TMP_DIR = path.join(REPO_ROOT, ".tmp", "onboarding-video-tools");
const DEFAULT_RENDER_DIR = path.join(
  REPO_ROOT,
  "research",
  "onboarding-video-artifacts",
);
const DEFAULT_OUTPUT_PATH = path.join(
  DEFAULT_RENDER_DIR,
  "chrome-landing-tabs-demo.mp4",
);
const DEFAULT_SCREEN_OUTPUT_PATH = path.join(
  DEFAULT_RENDER_DIR,
  "screen-capture-demo.mp4",
);
const DEFAULT_SCENE_PAD_POINTS = 40;
const DEFAULT_BOTTOM_SHADOW_EXTRA_PAD_POINTS = 8;
const DEFAULT_URLS = {
  githubUrl: "https://github.com/",
  convexUrl: "https://www.convex.dev/",
  cloudflareUrl: "https://www.cloudflare.com/",
  codexUrl: "https://openai.com/codex",
} as const;
const LANDING_DEMO_SEQUENCE: readonly LandingDemoStep[] = [
  { kind: "click", target: "tabs.github" },
  { kind: "wait", seconds: 0.65 },
  { kind: "click", target: "github.page" },
  { kind: "wait", seconds: 0.45 },
  { kind: "click", target: "tabs.convex" },
  { kind: "wait", seconds: 0.65 },
  { kind: "click", target: "convex.page" },
  { kind: "wait", seconds: 0.45 },
  { kind: "click", target: "tabs.cloudflare" },
  { kind: "wait", seconds: 0.65 },
  { kind: "click", target: "cloudflare.page" },
  { kind: "wait", seconds: 0.45 },
  { kind: "click", target: "tabs.codex" },
  { kind: "wait", seconds: 0.65 },
  { kind: "click", target: "codex.page" },
  { kind: "wait", seconds: 0.45 },
  { kind: "click", target: "tabs.github" },
  { kind: "wait", seconds: 0.65 },
] as const;
const LANDING_DEMO_MOUSE_TIMING = {
  moveDuration: 0.6,
  pauseBeforeClick: 0.12,
  clickHoldDuration: 0.08,
  pauseAfterClick: 0.24,
} as const;
const LANDING_DEMO_OUTPUT_FPS = 30;
const LANDING_DEMO_RECORDER_WARMUP_SECONDS = 0.8;
const LANDING_DEMO_AUTOMATION_START_DELAY_SECONDS =
  LANDING_DEMO_RECORDER_WARMUP_SECONDS + 0.12;
const LANDING_DEMO_RECORDER_BUFFER_SECONDS = 0.75;
const LANDING_DEMO_BROWSER_BUFFER_SECONDS = 3;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function main(argv: string[]) {
  const [command, ...commandArgs] = argv;

  if (command === "landing-demo") {
    await runLandingDemo(parseLandingDemoArgs(commandArgs));
    return;
  }

  if (command === "screen-demo") {
    await runScreenDemo(parseScreenDemoArgs(commandArgs));
    return;
  }

  throw new Error(
    [
      "Usage:",
      "  noter-onboarding-video landing-demo [--output <path>] [--pad <points>]",
      "  noter-onboarding-video screen-demo [--output <path>] [--duration <seconds>]",
    ].join("\n"),
  );
}

function parseArgs(argv: string[]): ParsedArgs {
  const values: ParsedArgs = {};

  for (let index = 0; index < argv.length; ) {
    const key = argv.at(index);

    if (key === "--") {
      index += 1;
      continue;
    }

    const value = argv.at(index + 1);
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Invalid argument pair near: ${key ?? "<end>"}`);
    }

    values[key.slice(2)] = value;
    index += 2;
  }

  return values;
}

function parseLandingDemoArgs(argv: string[]): LandingDemoOptions {
  const args = parseArgs(argv);
  const pad = Number(args.pad ?? String(DEFAULT_SCENE_PAD_POINTS));

  if (!Number.isInteger(pad) || pad < 0) {
    throw new Error(`Invalid --pad value: ${args.pad ?? "<missing>"}`);
  }

  return {
    githubUrl: args["github-url"] ?? DEFAULT_URLS.githubUrl,
    convexUrl: args["convex-url"] ?? DEFAULT_URLS.convexUrl,
    cloudflareUrl: args["cloudflare-url"] ?? DEFAULT_URLS.cloudflareUrl,
    codexUrl: args["codex-url"] ?? DEFAULT_URLS.codexUrl,
    outputPath: args.output ?? DEFAULT_OUTPUT_PATH,
    padPoints: pad,
  };
}

function parseScreenDemoArgs(argv: string[]): ScreenDemoOptions {
  const args = parseArgs(argv);
  const durationSeconds = Number(args.duration ?? "4");

  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error(
      `Invalid --duration value: ${args.duration ?? "<missing>"}`,
    );
  }

  return {
    outputPath: args.output ?? DEFAULT_SCREEN_OUTPUT_PATH,
    durationSeconds,
  };
}

async function runLandingDemo(options: LandingDemoOptions) {
  await mkdir(DEFAULT_TMP_DIR, { recursive: true });
  await mkdir(path.dirname(options.outputPath), { recursive: true });

  const recordingDurationSeconds = computeRecordingDurationSeconds(
    LANDING_DEMO_SEQUENCE,
  );
  const holdOpenSeconds =
    LANDING_DEMO_AUTOMATION_START_DELAY_SECONDS +
    recordingDurationSeconds +
    LANDING_DEMO_BROWSER_BUFFER_SECONDS;

  const recorderBin = path.join(DEFAULT_TMP_DIR, "record-chrome-scene");
  const mouseBin = path.join(DEFAULT_TMP_DIR, "animate-mouse");
  const backdropBin = path.join(DEFAULT_TMP_DIR, "run-white-backdrop");

  await compileSwiftBinary(
    path.join(PACKAGE_DIR, "native", "recordChromeScene.swift"),
    recorderBin,
    ["AppKit", "AVFoundation", "CoreMedia", "CoreVideo", "ScreenCaptureKit"],
  );
  await compileSwiftBinary(
    path.join(PACKAGE_DIR, "native", "animateMouse.swift"),
    mouseBin,
    ["AppKit"],
  );
  await compileSwiftBinary(
    path.join(PACKAGE_DIR, "native", "runWhiteBackdrop.swift"),
    backdropBin,
    ["AppKit"],
  );

  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const readyFile = path.join(DEFAULT_TMP_DIR, `landing-ready-${runId}.txt`);
  const coordsFile = path.join(DEFAULT_TMP_DIR, `landing-coords-${runId}.json`);
  const recorderStartedFile = path.join(
    DEFAULT_TMP_DIR,
    `landing-recorder-started-${runId}.txt`,
  );
  const backdropReadyFile = path.join(
    DEFAULT_TMP_DIR,
    `landing-backdrop-ready-${runId}.txt`,
  );
  const profileDir = await mkdtemp(
    path.join(DEFAULT_TMP_DIR, "chrome-profile-"),
  );

  let demoProcess: BufferedChildProcess | null = null;
  let recorderProcess: BufferedChildProcess | null = null;
  let backdropProcess: BufferedChildProcess | null = null;

  try {
    demoProcess = spawn(
      process.execPath,
      [
        "--experimental-strip-types",
        path.join(PACKAGE_DIR, "launchChromeLandingTabs.ts"),
        "--profile-dir",
        profileDir,
        "--ready-file",
        readyFile,
        "--coords-file",
        coordsFile,
        "--github-url",
        options.githubUrl,
        "--convex-url",
        options.convexUrl,
        "--cloudflare-url",
        options.cloudflareUrl,
        "--codex-url",
        options.codexUrl,
        "--hold-open-seconds",
        holdOpenSeconds.toFixed(2),
      ],
      {
        cwd: REPO_ROOT,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    await waitForFile(readyFile, 24_000);
    await waitForFile(coordsFile, 24_000);

    const coords = parseLandingCoords(await readFile(coordsFile, "utf8"));
    const windowFrame = serializeWindowFrame(coords.windowFrame);
    const captureFrame = expandWindowFrame(
      coords.windowFrame,
      options.padPoints,
    );
    const captureFrameArg = serializeWindowFrame(captureFrame);
    const demoActions = serializeLandingDemoActions(
      coords,
      LANDING_DEMO_SEQUENCE,
    );

    await focusChromeWindow(coords.windowFrame);

    backdropProcess = spawn(
      backdropBin,
      ["--ready-file", backdropReadyFile],
      {
        cwd: REPO_ROOT,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    await waitForFile(backdropReadyFile, 4_000);
    await focusChromeWindow(coords.windowFrame);

    recorderProcess = spawn(
      recorderBin,
      [
        "--bundle-id",
        "com.google.Chrome",
        "--window-frame",
        windowFrame,
        "--capture-frame",
        captureFrameArg,
        "--output",
        options.outputPath,
        "--started-file",
        recorderStartedFile,
        "--duration",
        recordingDurationSeconds.toFixed(2),
        "--warmup-duration",
        String(LANDING_DEMO_RECORDER_WARMUP_SECONDS),
        "--fps",
        String(LANDING_DEMO_OUTPUT_FPS),
        "--cursor",
        "true",
        "--click-highlights",
        "true",
      ],
      {
        cwd: REPO_ROOT,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    await waitForFile(recorderStartedFile, 12_000);
    await sleep(LANDING_DEMO_AUTOMATION_START_DELAY_SECONDS * 1000);
    await focusChromeWindow(coords.windowFrame);

    await runCommand(
      mouseBin,
      [
        "--actions",
        demoActions,
        "--move-duration",
        String(LANDING_DEMO_MOUSE_TIMING.moveDuration),
        "--pause-before-click",
        String(LANDING_DEMO_MOUSE_TIMING.pauseBeforeClick),
        "--click-hold-duration",
        String(LANDING_DEMO_MOUSE_TIMING.clickHoldDuration),
        "--pause-after-click",
        String(LANDING_DEMO_MOUSE_TIMING.pauseAfterClick),
        "--require-frontmost-bundle",
        "com.google.Chrome",
        "--require-window-owner",
        "Google Chrome",
        "--require-window-frame",
        windowFrame,
      ],
      REPO_ROOT,
    );

    await waitForChild(recorderProcess, "recordChromeScene.swift");
    recorderProcess = null;
    await terminateChild(backdropProcess);
    backdropProcess = null;
    await waitForChild(demoProcess, "launchChromeLandingTabs.ts");
    demoProcess = null;

    process.stdout.write(`${options.outputPath}\n`);
  } catch (error) {
    await terminateChild(demoProcess);
    await terminateChild(recorderProcess);
    await terminateChild(backdropProcess);
    throw error;
  } finally {
    await killChromeProfile(profileDir);
    await rm(profileDir, { recursive: true, force: true });
    await Promise.all([
      rm(readyFile, { force: true }),
      rm(coordsFile, { force: true }),
      rm(recorderStartedFile, { force: true }),
      rm(backdropReadyFile, { force: true }),
    ]);
  }
}

async function runScreenDemo(options: ScreenDemoOptions) {
  await mkdir(DEFAULT_TMP_DIR, { recursive: true });
  await mkdir(path.dirname(options.outputPath), { recursive: true });

  const recorderBin = path.join(DEFAULT_TMP_DIR, "record-display-scene");
  await compileSwiftBinary(
    path.join(PACKAGE_DIR, "native", "recordDisplayScene.swift"),
    recorderBin,
    ["AppKit", "AVFoundation", "CoreMedia", "CoreVideo", "ScreenCaptureKit"],
  );

  await runCommand(
    recorderBin,
    [
      "--output",
      options.outputPath,
      "--duration",
      options.durationSeconds.toFixed(2),
      "--warmup-duration",
      "0.35",
      "--fps",
      String(LANDING_DEMO_OUTPUT_FPS),
      "--cursor",
      "true",
      "--click-highlights",
      "true",
    ],
    REPO_ROOT,
  );

  process.stdout.write(`${options.outputPath}\n`);
}

function serializeLandingDemoActions(
  coords: LandingCoords,
  steps: readonly LandingDemoStep[],
) {
  return steps
    .map((step) => {
      if (step.kind === "wait") {
        return `wait:${step.seconds}`;
      }

      const point = resolveLandingDemoTarget(coords, step.target);
      return `click:${point.x},${point.y}`;
    })
    .join(";");
}

function resolveLandingDemoTarget(
  coords: LandingCoords,
  target: LandingDemoTarget,
): ScreenPoint {
  switch (target) {
    case "tabs.github":
      return coords.tabs.github;
    case "github.page":
      return coords.github.page;
    case "tabs.convex":
      return coords.tabs.convex;
    case "convex.page":
      return coords.convex.page;
    case "tabs.cloudflare":
      return coords.tabs.cloudflare;
    case "cloudflare.page":
      return coords.cloudflare.page;
    case "tabs.codex":
      return coords.tabs.codex;
    case "codex.page":
      return coords.codex.page;
    default:
      target satisfies never;
      throw new Error("Unsupported landing-demo target.");
  }
}

function computeRecordingDurationSeconds(steps: readonly LandingDemoStep[]) {
  return (
    steps.reduce((totalSeconds, step) => {
      if (step.kind === "wait") {
        return totalSeconds + step.seconds;
      }

      return (
        totalSeconds +
        LANDING_DEMO_MOUSE_TIMING.moveDuration +
        LANDING_DEMO_MOUSE_TIMING.pauseBeforeClick +
        LANDING_DEMO_MOUSE_TIMING.clickHoldDuration +
        LANDING_DEMO_MOUSE_TIMING.pauseAfterClick
      );
    }, 0) + LANDING_DEMO_RECORDER_BUFFER_SECONDS
  );
}

function expandWindowFrame(
  windowFrame: WindowFrame,
  padPoints: number,
): WindowFrame {
  const bottomPadPoints = padPoints + DEFAULT_BOTTOM_SHADOW_EXTRA_PAD_POINTS;

  return {
    x: windowFrame.x - padPoints,
    y: windowFrame.y - padPoints,
    width: windowFrame.width + padPoints * 2,
    // Native macOS shadow extends farther below the window than on the other
    // edges, so keep a slightly larger bottom margin to ensure the MP4 edge is
    // already white when embedded elsewhere.
    height: windowFrame.height + padPoints + bottomPadPoints,
  };
}

function serializeWindowFrame(windowFrame: WindowFrame) {
  return `${windowFrame.x},${windowFrame.y},${windowFrame.width},${windowFrame.height}`;
}

async function compileSwiftBinary(
  sourcePath: string,
  outputPath: string,
  frameworks: string[],
) {
  const shouldCompile = await binaryNeedsRebuild(sourcePath, outputPath);
  if (!shouldCompile) {
    return;
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await runCommand(
    "swiftc",
    [
      "-parse-as-library",
      "-o",
      outputPath,
      sourcePath,
      ...frameworks.flatMap((framework) => ["-framework", framework]),
    ],
    REPO_ROOT,
  );
}

async function binaryNeedsRebuild(sourcePath: string, outputPath: string) {
  try {
    await access(outputPath, fsConstants.F_OK);
  } catch {
    return true;
  }

  const [sourceStat, outputStat] = await Promise.all([
    stat(sourcePath),
    stat(outputPath),
  ]);

  return sourceStat.mtimeMs > outputStat.mtimeMs;
}

async function waitForFile(filePath: string, timeoutMs: number) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      await access(filePath, fsConstants.F_OK);
      return;
    } catch {
      await sleep(100);
    }
  }

  throw new Error(`Timed out waiting for ${filePath}`);
}

function runCommand(command: string, args: string[], cwd: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const suffix = stderr.trim().length > 0 ? `\n${stderr.trim()}` : "";
      reject(
        new Error(
          `${command} ${args.join(" ")} failed with ${
            signal ? `signal ${signal}` : `exit code ${code ?? "unknown"}`
          }.${suffix}`,
        ),
      );
    });
  });
}

function waitForChild(child: BufferedChildProcess, label: string) {
  return new Promise<void>((resolve, reject) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      if (child.exitCode === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${label} failed with ${
            child.signalCode
              ? `signal ${child.signalCode}`
              : `exit code ${child.exitCode ?? "unknown"}`
          }.`,
        ),
      );
      return;
    }

    let stderr = "";

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const suffix = stderr.trim().length > 0 ? `\n${stderr.trim()}` : "";
      reject(
        new Error(
          `${label} failed with ${
            signal ? `signal ${signal}` : `exit code ${code ?? "unknown"}`
          }.${suffix}`,
        ),
      );
    });
  });
}

async function waitForChildExit(child: BufferedChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  await new Promise<void>((resolve) => {
    child.on("close", () => {
      resolve();
    });
  });
}

async function terminateChild(child: BufferedChildProcess | null) {
  if (!child) {
    return;
  }

  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGTERM");
  }

  await waitForChildExit(child);
}

async function killChromeProfile(profileDir: string) {
  const profilePattern = `Google Chrome.*${profileDir}`;

  try {
    await runCommand("pkill", ["-f", profilePattern], REPO_ROOT);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("exit code 1")) {
      throw error;
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function focusChromeWindow(windowFrame: WindowFrame) {
  const right = windowFrame.x + windowFrame.width;
  const bottom = windowFrame.y + windowFrame.height;
  const script = [
    'tell application "Google Chrome"',
    "  repeat with targetWindow in windows",
    "    set windowBounds to bounds of targetWindow",
    `    if (item 1 of windowBounds is ${windowFrame.x}) and (item 2 of windowBounds is ${windowFrame.y}) and (item 3 of windowBounds is ${right}) and (item 4 of windowBounds is ${bottom}) then`,
    "      set index of targetWindow to 1",
    "      activate",
    "      return",
    "    end if",
    "  end repeat",
    '  error "Could not focus the expected Chrome window."',
    "end tell",
  ].join("\n");

  await runCommand("osascript", ["-e", script], REPO_ROOT);
  await sleep(200);
}

function parseLandingCoords(raw: string): LandingCoords {
  const candidate: unknown = JSON.parse(raw);
  if (!isRecord(candidate)) {
    throw new Error("Landing coordinates must be a JSON object.");
  }

  return {
    github: parseLandingPageCoords(candidate.github, "github"),
    convex: parseLandingPageCoords(candidate.convex, "convex"),
    cloudflare: parseLandingPageCoords(candidate.cloudflare, "cloudflare"),
    codex: parseLandingPageCoords(candidate.codex, "codex"),
    tabs: parseTabs(candidate.tabs),
    windowFrame: parseWindowFrame(candidate.windowFrame),
  };
}

function parseLandingPageCoords(
  value: unknown,
  label: string,
): { page: ScreenPoint } {
  if (!isRecord(value)) {
    throw new Error(`Missing ${label} coordinates.`);
  }

  return {
    page: parseScreenPoint(value.page, `${label}.page`),
  };
}

function parseTabs(value: unknown): LandingCoords["tabs"] {
  if (!isRecord(value)) {
    throw new Error("Missing tab coordinates.");
  }

  return {
    github: parseScreenPoint(value.github, "tabs.github"),
    convex: parseScreenPoint(value.convex, "tabs.convex"),
    cloudflare: parseScreenPoint(value.cloudflare, "tabs.cloudflare"),
    codex: parseScreenPoint(value.codex, "tabs.codex"),
  };
}

function parseScreenPoint(value: unknown, label: string): ScreenPoint {
  if (!isRecord(value)) {
    throw new Error(`Missing ${label} point.`);
  }

  if (typeof value.x !== "number" || typeof value.y !== "number") {
    throw new Error(`Invalid ${label} point.`);
  }

  return {
    x: value.x,
    y: value.y,
  };
}

function parseWindowFrame(value: unknown): WindowFrame {
  if (!isRecord(value)) {
    throw new Error("Missing window frame.");
  }

  if (
    typeof value.x !== "number" ||
    typeof value.y !== "number" ||
    typeof value.width !== "number" ||
    typeof value.height !== "number"
  ) {
    throw new Error("Invalid window frame.");
  }

  return {
    x: value.x,
    y: value.y,
    width: value.width,
    height: value.height,
  };
}
