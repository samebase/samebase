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
  pad: number;
};

const PACKAGE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(PACKAGE_DIR, "../..");
const DEFAULT_TMP_DIR = path.join(REPO_ROOT, ".tmp", "onboarding-video-tools");
const DEFAULT_OUTPUT_PATH = path.join(
  DEFAULT_TMP_DIR,
  "chrome-landing-tabs-demo.mp4",
);
const DEFAULT_URLS = {
  githubUrl: "https://github.com/",
  convexUrl: "https://www.convex.dev/",
  cloudflareUrl: "https://www.cloudflare.com/",
  codexUrl: "https://openai.com/codex",
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function main(argv: string[]) {
  const [command, ...commandArgs] = argv;

  if (command === "landing-demo") {
    await runLandingDemo(parseLandingDemoArgs(commandArgs));
    return;
  }

  throw new Error(
    [
      "Usage:",
      "  noter-onboarding-video landing-demo [--output <path>] [--pad <pixels>]",
    ].join("\n"),
  );
}

function parseArgs(argv: string[]): ParsedArgs {
  const values: ParsedArgs = {};

  for (let index = 0; index < argv.length; index += 2) {
    const key = argv.at(index);
    const value = argv.at(index + 1);

    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Invalid argument pair near: ${key ?? "<end>"}`);
    }

    values[key.slice(2)] = value;
  }

  return values;
}

function parseLandingDemoArgs(argv: string[]): LandingDemoOptions {
  const args = parseArgs(argv);
  const pad = Number(args.pad ?? "48");

  if (Number.isNaN(pad) || pad < 0) {
    throw new Error(`Invalid --pad value: ${args.pad ?? "<missing>"}`);
  }

  return {
    githubUrl: args["github-url"] ?? DEFAULT_URLS.githubUrl,
    convexUrl: args["convex-url"] ?? DEFAULT_URLS.convexUrl,
    cloudflareUrl: args["cloudflare-url"] ?? DEFAULT_URLS.cloudflareUrl,
    codexUrl: args["codex-url"] ?? DEFAULT_URLS.codexUrl,
    outputPath: args.output ?? DEFAULT_OUTPUT_PATH,
    pad,
  };
}

async function runLandingDemo(options: LandingDemoOptions) {
  await mkdir(DEFAULT_TMP_DIR, { recursive: true });
  await mkdir(path.dirname(options.outputPath), { recursive: true });

  const recorderBin = path.join(DEFAULT_TMP_DIR, "record-chrome-window");
  const mouseBin = path.join(DEFAULT_TMP_DIR, "animate-mouse");
  await compileSwiftBinary(
    path.join(PACKAGE_DIR, "native", "recordChromeWindow.swift"),
    recorderBin,
    ["AppKit", "AVFoundation", "CoreMedia", "CoreVideo", "ScreenCaptureKit"],
  );
  await compileSwiftBinary(
    path.join(PACKAGE_DIR, "native", "animateMouse.swift"),
    mouseBin,
    ["AppKit"],
  );

  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const rawOutputPath = path.join(
    DEFAULT_TMP_DIR,
    `chrome-landing-tabs-demo-${runId}.raw.mp4`,
  );
  const readyFile = path.join(DEFAULT_TMP_DIR, `landing-ready-${runId}.txt`);
  const coordsFile = path.join(DEFAULT_TMP_DIR, `landing-coords-${runId}.json`);
  const recorderStartedFile = path.join(
    DEFAULT_TMP_DIR,
    `landing-recorder-started-${runId}.txt`,
  );
  const clickEventsFile = path.join(
    DEFAULT_TMP_DIR,
    `landing-click-events-${runId}.json`,
  );
  const profileDir = await mkdtemp(
    path.join(DEFAULT_TMP_DIR, "chrome-profile-"),
  );

  let demoProcess: BufferedChildProcess | null = null;
  let recorderProcess: BufferedChildProcess | null = null;

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
    const demoActions = buildLandingDemoActions(coords);
    await focusChromeWindow(coords.windowFrame);

    recorderProcess = spawn(
      recorderBin,
      [
        "--bundle-id",
        "com.google.Chrome",
        "--window-frame",
        windowFrame,
        "--output",
        rawOutputPath,
        "--started-file",
        recorderStartedFile,
        "--duration",
        "13",
        "--fps",
        "30",
        "--cursor",
        "true",
        "--click-highlights",
        "false",
      ],
      {
        cwd: REPO_ROOT,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    await waitForFile(recorderStartedFile, 12_000);
    await focusChromeWindow(coords.windowFrame);

    await runCommand(
      mouseBin,
      [
        "--actions",
        demoActions,
        "--event-log",
        clickEventsFile,
        "--move-duration",
        "0.6",
        "--pause-before-click",
        "0.08",
        "--pause-after-click",
        "0.36",
        "--require-frontmost-bundle",
        "com.google.Chrome",
        "--require-window-owner",
        "Google Chrome",
        "--require-window-frame",
        windowFrame,
        "--scroll-step-pause",
        "0.012",
      ],
      REPO_ROOT,
    );

    await waitForChild(recorderProcess, "record_chrome_window.swift");
    await waitForChild(demoProcess, "launchChromeLandingTabs.ts");

    await runCommand(
      process.execPath,
      [
        "--experimental-strip-types",
        path.join(PACKAGE_DIR, "renderClickRings.ts"),
        "--input",
        rawOutputPath,
        "--output",
        options.outputPath,
        "--events",
        clickEventsFile,
        "--window-frame",
        windowFrame,
        "--pad",
        String(options.pad),
      ],
      REPO_ROOT,
    );

    process.stdout.write(`${options.outputPath}\n`);
  } catch (error) {
    await terminateChild(demoProcess);
    await terminateChild(recorderProcess);
    throw error;
  } finally {
    await killChromeProfile(profileDir);
    await rm(profileDir, { recursive: true, force: true });
    await Promise.all([
      rm(readyFile, { force: true }),
      rm(coordsFile, { force: true }),
      rm(recorderStartedFile, { force: true }),
    ]);
  }
}

function buildLandingDemoActions(coords: LandingCoords) {
  return [
    `click:${coords.tabs.github.x},${coords.tabs.github.y}`,
    "wait:0.65",
    `click:${coords.github.page.x},${coords.github.page.y}`,
    "wait:0.45",
    `click:${coords.tabs.convex.x},${coords.tabs.convex.y}`,
    "wait:0.65",
    `click:${coords.convex.page.x},${coords.convex.page.y}`,
    "wait:0.45",
    `click:${coords.tabs.cloudflare.x},${coords.tabs.cloudflare.y}`,
    "wait:0.65",
    `click:${coords.cloudflare.page.x},${coords.cloudflare.page.y}`,
    "wait:0.45",
    `click:${coords.tabs.codex.x},${coords.tabs.codex.y}`,
    "wait:0.65",
    `click:${coords.codex.page.x},${coords.codex.page.y}`,
    "wait:0.45",
    `click:${coords.tabs.github.x},${coords.tabs.github.y}`,
    "wait:0.65",
  ].join(";");
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
