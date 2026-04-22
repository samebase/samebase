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

type StackStep1Options = {
  githubUrl: string;
  convexUrl: string;
  cloudflareUrl: string;
  outputPath: string;
  padPoints: number;
};

type StackStep12Options = {
  githubUrl: string;
  convexUrl: string;
  cloudflareUrl: string;
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

type StackStep1Target =
  | "tabs.github"
  | "tabs.convex"
  | "convex.homeLogin"
  | "convex.githubLogin"
  | "tabs.cloudflare"
  | "cloudflare.homeLogin"
  | "cloudflare.githubLogin";

type StackStep1Step =
  | {
      kind: "click";
      target: StackStep1Target;
    }
  | {
      kind: "wait";
      seconds: number;
    };

type StackStep1Coords = {
  tabs: {
    github: ScreenPoint;
    convex: ScreenPoint;
    cloudflare: ScreenPoint;
  };
  convex: {
    homeLogin: ScreenPoint;
    githubLogin: ScreenPoint | null;
  };
  cloudflare: {
    homeLogin: ScreenPoint;
    githubLogin: ScreenPoint | null;
  };
  windowFrame: WindowFrame;
};

type MouseTiming = {
  moveDuration: number;
  pauseBeforeClick: number;
  clickHoldDuration: number;
  pauseAfterClick: number;
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
const DEFAULT_STACK_STEP_1_OUTPUT_PATH = path.join(
  DEFAULT_RENDER_DIR,
  "stack-onboarding-step-1-signin.mp4",
);
const DEFAULT_STACK_STEP_1_2_OUTPUT_PATH = path.join(
  DEFAULT_RENDER_DIR,
  "stack-onboarding-step-1-2.mp4",
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
const STACK_STEP_1_MOUSE_TIMING = {
  moveDuration: 0.58,
  pauseBeforeClick: 0.12,
  clickHoldDuration: 0.08,
  pauseAfterClick: 0.22,
} as const;
// Keep page reveals long enough to register, but do not add the same pause to
// small control interactions like dropdown picks or suggestion chips.
const STACK_PAGE_LOAD_SHOW_SECONDS = 1;
const STACK_TAB_SHOW_SECONDS = 0.4;
const STACK_CONTROL_SETTLE_SECONDS = 0.25;
const STACK_CLOUDFLARE_DASHBOARD_SHOW_SECONDS = 2;
const LANDING_DEMO_OUTPUT_FPS = 30;
const LANDING_DEMO_RECORDER_WARMUP_SECONDS = 0.8;
const LANDING_DEMO_AUTOMATION_START_DELAY_SECONDS =
  LANDING_DEMO_RECORDER_WARMUP_SECONDS + 0.12;
const LANDING_DEMO_RECORDER_BUFFER_SECONDS = 0.75;
const LANDING_DEMO_BROWSER_BUFFER_SECONDS = 3;
// Keep the tutorial browser close to square so late-form actions like GitHub's
// repository submit remain visible without adding bespoke scroll logic.
const STACK_STEP_1_WINDOW_BOUNDS = {
  x: 120,
  y: 96,
  right: 1145,
  bottom: 1121,
} as const;
const STACK_STEP_1_TAB_CENTER_X_OFFSETS = {
  github: 220,
  convex: 448,
  cloudflare: 682,
} as const;
const STACK_STEP_1_TAB_CENTER_Y_OFFSET = 20;
const STACK_STEP_1_CONVEX_LOGOUT_URL = "https://dashboard.convex.dev/logout";
const STACK_STEP_1_CLOUDFLARE_LOGOUT_URL = "https://dash.cloudflare.com/logout";
const STACK_STEP_1_CONVEX_LOGIN_URL = "https://www.convex.dev/login";
const STACK_STEP_1_CLOUDFLARE_LOGIN_URL = "https://dash.cloudflare.com/login";
const STACK_STEP_2_TEMPLATE_REPO_URL = "https://github.com/noter-md/template";
const STACK_STEP_2_USE_TEMPLATE_LABEL = "Use this template";
const STACK_STEP_2_OWNER_POPUP_LABEL_FRAGMENT = "Owner (Required)";
const STACK_STEP_2_REPO_NAME_SUGGESTION_LABEL_FRAGMENT =
  "Use suggested repository name ";
const STACK_STEP_2_CREATE_REPOSITORY_BUTTON_LABEL = "Create repository";
// Step 2 mixes live page-load waits with measured clicks, so keep a
// conservative recording budget above the nominal click timings to avoid
// truncating the final GitHub repo page on slower network turns.
const STACK_STEP_2_DURATION_BUDGET_SECONDS = 30;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function main(argv: string[]) {
  const [command, ...commandArgs] = argv;

  if (command === "landing-demo") {
    await runLandingDemo(parseLandingDemoArgs(commandArgs));
    return;
  }

  if (command === "stack-step-1-signin") {
    await runStackStep1SigninDemo(parseStackStep1Args(commandArgs));
    return;
  }

  if (command === "stack-step-1-2") {
    await runStackStep1And2Demo(parseStackStep12Args(commandArgs));
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
      "  noter-onboarding-video stack-step-1-signin [--output <path>] [--pad <points>]",
      "  noter-onboarding-video stack-step-1-2 [--output <path>] [--pad <points>]",
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

function parseStackStep1Args(argv: string[]): StackStep1Options {
  const args = parseArgs(argv);
  const pad = Number(args.pad ?? String(DEFAULT_SCENE_PAD_POINTS));

  if (!Number.isInteger(pad) || pad < 0) {
    throw new Error(`Invalid --pad value: ${args.pad ?? "<missing>"}`);
  }

  return {
    githubUrl: args["github-url"] ?? DEFAULT_URLS.githubUrl,
    convexUrl: args["convex-url"] ?? DEFAULT_URLS.convexUrl,
    cloudflareUrl: args["cloudflare-url"] ?? DEFAULT_URLS.cloudflareUrl,
    outputPath: args.output ?? DEFAULT_STACK_STEP_1_OUTPUT_PATH,
    padPoints: pad,
  };
}

function parseStackStep12Args(argv: string[]): StackStep12Options {
  const args = parseArgs(argv);
  const pad = Number(args.pad ?? String(DEFAULT_SCENE_PAD_POINTS));

  if (!Number.isInteger(pad) || pad < 0) {
    throw new Error(`Invalid --pad value: ${args.pad ?? "<missing>"}`);
  }

  return {
    githubUrl: args["github-url"] ?? DEFAULT_URLS.githubUrl,
    convexUrl: args["convex-url"] ?? DEFAULT_URLS.convexUrl,
    cloudflareUrl: args["cloudflare-url"] ?? DEFAULT_URLS.cloudflareUrl,
    outputPath: args.output ?? DEFAULT_STACK_STEP_1_2_OUTPUT_PATH,
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

    backdropProcess = spawn(backdropBin, ["--ready-file", backdropReadyFile], {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });

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

async function runStackStep1SigninDemo(options: StackStep1Options) {
  await mkdir(DEFAULT_TMP_DIR, { recursive: true });
  await mkdir(path.dirname(options.outputPath), { recursive: true });

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
  const recorderStartedFile = path.join(
    DEFAULT_TMP_DIR,
    `stack-step1-recorder-started-${runId}.txt`,
  );
  const backdropReadyFile = path.join(
    DEFAULT_TMP_DIR,
    `stack-step1-backdrop-ready-${runId}.txt`,
  );
  let recorderProcess: BufferedChildProcess | null = null;
  let backdropProcess: BufferedChildProcess | null = null;

  try {
    const coords = await prepareStackStep1Coords(options);
    const sequence = buildStackStep1Sequence(coords);
    const recordingDurationSeconds = computeTimedRecordingDurationSeconds(
      sequence,
      STACK_STEP_1_MOUSE_TIMING,
    );
    const windowFrame = serializeWindowFrame(coords.windowFrame);
    const captureFrame = expandWindowFrame(
      coords.windowFrame,
      options.padPoints,
    );
    const captureFrameArg = serializeWindowFrame(captureFrame);
    await focusChromeWindow(coords.windowFrame);

    backdropProcess = spawn(backdropBin, ["--ready-file", backdropReadyFile], {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });

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

    await runStackStep1Sequence(mouseBin, coords, sequence);

    await waitForChild(recorderProcess, "recordChromeScene.swift");
    recorderProcess = null;
    await terminateChild(backdropProcess);
    backdropProcess = null;

    process.stdout.write(`${options.outputPath}\n`);
  } catch (error) {
    await terminateChild(recorderProcess);
    await terminateChild(backdropProcess);
    throw error;
  } finally {
    await Promise.all([
      rm(recorderStartedFile, { force: true }),
      rm(backdropReadyFile, { force: true }),
    ]);
  }
}

async function runStackStep1And2Demo(options: StackStep12Options) {
  await mkdir(DEFAULT_TMP_DIR, { recursive: true });
  await mkdir(path.dirname(options.outputPath), { recursive: true });

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
  const recorderStartedFile = path.join(
    DEFAULT_TMP_DIR,
    `stack-step12-recorder-started-${runId}.txt`,
  );
  const backdropReadyFile = path.join(
    DEFAULT_TMP_DIR,
    `stack-step12-backdrop-ready-${runId}.txt`,
  );
  let recorderProcess: BufferedChildProcess | null = null;
  let backdropProcess: BufferedChildProcess | null = null;

  try {
    const coords = await prepareStackStep1Coords(options);
    const sequence = buildStackStep1Sequence(coords);
    const recordingDurationSeconds =
      computeTimedRecordingDurationSeconds(
        sequence,
        STACK_STEP_1_MOUSE_TIMING,
      ) + STACK_STEP_2_DURATION_BUDGET_SECONDS;
    const windowFrame = serializeWindowFrame(coords.windowFrame);
    const captureFrame = expandWindowFrame(
      coords.windowFrame,
      options.padPoints,
    );
    const captureFrameArg = serializeWindowFrame(captureFrame);
    await focusChromeWindow(coords.windowFrame);

    backdropProcess = spawn(backdropBin, ["--ready-file", backdropReadyFile], {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });

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

    await runStackStep1Sequence(mouseBin, coords, sequence);
    await runStackStep2GithubTemplateSequence(mouseBin, coords.windowFrame);

    await waitForChild(recorderProcess, "recordChromeScene.swift");
    recorderProcess = null;
    await terminateChild(backdropProcess);
    backdropProcess = null;

    process.stdout.write(`${options.outputPath}\n`);
  } catch (error) {
    await terminateChild(recorderProcess);
    await terminateChild(backdropProcess);
    throw error;
  } finally {
    await Promise.all([
      rm(recorderStartedFile, { force: true }),
      rm(backdropReadyFile, { force: true }),
    ]);
  }
}

async function prepareStackStep1Coords(
  options: StackStep1Options,
): Promise<StackStep1Coords> {
  await configureStackStep1ChromeWindow(options);
  const windowFrame = await readFrontChromeWindowFrame();

  const tabs = measureStackStep1TabCenters(windowFrame);

  await activateChromeTab(2);
  await waitForChromeActiveTabUrlIncludes("convex.dev", 10_000);
  const convexHomeLogin = await waitForChromeAxElementCenter("Log in", 10_000);

  await setChromeTabUrl(2, STACK_STEP_1_CONVEX_LOGIN_URL);
  const convexGithubLogin = await resolveOptionalChromeAuthButton({
    buttonLabels: ["Continue with GitHub", "GitHub"],
    successUrlFragments: ["dashboard.convex.dev"],
    timeoutMs: 15_000,
  });
  if (convexGithubLogin === null) {
    await sleep(400);
  }

  await setChromeTabUrl(2, options.convexUrl);
  await waitForChromeActiveTabUrlIncludes("convex.dev", 10_000);

  await activateChromeTab(3);
  await waitForChromeActiveTabUrlIncludes("cloudflare.com", 10_000);
  const cloudflareHomeLogin = await waitForChromeAxElementCenter(
    "Log in",
    10_000,
  );

  await setChromeTabUrl(3, STACK_STEP_1_CLOUDFLARE_LOGIN_URL);
  const cloudflareGithubLogin = await resolveOptionalChromeAuthButton({
    buttonLabels: ["Continue with GitHub", "GitHub"],
    successUrlFragments: [],
    timeoutMs: 15_000,
  });

  await setChromeTabUrl(3, options.cloudflareUrl);
  await waitForChromeActiveTabUrlIncludes("cloudflare.com", 10_000);

  await activateChromeTab(1);
  await focusChromeWindow(windowFrame);

  return {
    tabs,
    convex: {
      homeLogin: convexHomeLogin,
      githubLogin: convexGithubLogin,
    },
    cloudflare: {
      homeLogin: cloudflareHomeLogin,
      githubLogin: cloudflareGithubLogin,
    },
    windowFrame,
  };
}

function buildStackStep1Sequence(coords: StackStep1Coords): StackStep1Step[] {
  const sequence: StackStep1Step[] = [
    { kind: "click", target: "tabs.convex" },
    { kind: "wait", seconds: STACK_TAB_SHOW_SECONDS },
    { kind: "click", target: "convex.homeLogin" },
    { kind: "wait", seconds: STACK_PAGE_LOAD_SHOW_SECONDS },
  ];

  if (coords.convex.githubLogin !== null) {
    sequence.push(
      { kind: "click", target: "convex.githubLogin" },
      { kind: "wait", seconds: STACK_PAGE_LOAD_SHOW_SECONDS },
    );
  } else {
    sequence.push({ kind: "wait", seconds: STACK_PAGE_LOAD_SHOW_SECONDS });
  }

  sequence.push(
    { kind: "click", target: "tabs.cloudflare" },
    { kind: "wait", seconds: STACK_TAB_SHOW_SECONDS },
    { kind: "click", target: "cloudflare.homeLogin" },
    { kind: "wait", seconds: STACK_PAGE_LOAD_SHOW_SECONDS },
  );

  if (coords.cloudflare.githubLogin !== null) {
    sequence.push(
      { kind: "click", target: "cloudflare.githubLogin" },
      { kind: "wait", seconds: STACK_CLOUDFLARE_DASHBOARD_SHOW_SECONDS },
    );
  } else {
    sequence.push({
      kind: "wait",
      seconds: STACK_CLOUDFLARE_DASHBOARD_SHOW_SECONDS,
    });
  }

  sequence.push(
    { kind: "click", target: "tabs.github" },
    { kind: "wait", seconds: STACK_TAB_SHOW_SECONDS },
  );

  return sequence;
}

async function configureStackStep1ChromeWindow(options: StackStep1Options) {
  await runAppleScript(`
    tell application "Google Chrome"
      activate
      if (count of windows) is 0 then
        make new window
      end if
      set targetWindow to front window
      set bounds of targetWindow to {${STACK_STEP_1_WINDOW_BOUNDS.x}, ${STACK_STEP_1_WINDOW_BOUNDS.y}, ${STACK_STEP_1_WINDOW_BOUNDS.right}, ${STACK_STEP_1_WINDOW_BOUNDS.bottom}}
      repeat while (count of tabs of targetWindow) < 3
        make new tab at end of tabs of targetWindow
      end repeat
      repeat while (count of tabs of targetWindow) > 3
        close tab 4 of targetWindow
      end repeat
      set URL of tab 1 of targetWindow to "${escapeAppleScriptString(options.githubUrl)}"
      set URL of tab 2 of targetWindow to "${STACK_STEP_1_CONVEX_LOGOUT_URL}"
      set URL of tab 3 of targetWindow to "${STACK_STEP_1_CLOUDFLARE_LOGOUT_URL}"
      set active tab index of targetWindow to 1
    end tell
  `);

  await sleep(1_800);
  await setChromeTabUrl(2, options.convexUrl);
  await activateChromeTab(2);
  await waitForChromeActiveTabUrlIncludes("convex.dev", 10_000);
  await setChromeTabUrl(3, options.cloudflareUrl);
  await activateChromeTab(3);
  await waitForChromeActiveTabUrlIncludes("cloudflare.com", 10_000);
  await activateChromeTab(1);
}

function measureStackStep1TabCenters(
  windowFrame: WindowFrame,
): StackStep1Coords["tabs"] {
  return {
    // Chrome's real tab widths in the prepared recording profile are much more
    // compact than an even three-column split. These offsets are measured from
    // a live Retina screenshot of the recording window so the cursor lands in
    // the visual middle of each tab instead of grazing the edge.
    github: {
      x: windowFrame.x + STACK_STEP_1_TAB_CENTER_X_OFFSETS.github,
      y: windowFrame.y + STACK_STEP_1_TAB_CENTER_Y_OFFSET,
    },
    convex: {
      x: windowFrame.x + STACK_STEP_1_TAB_CENTER_X_OFFSETS.convex,
      y: windowFrame.y + STACK_STEP_1_TAB_CENTER_Y_OFFSET,
    },
    cloudflare: {
      x: windowFrame.x + STACK_STEP_1_TAB_CENTER_X_OFFSETS.cloudflare,
      y: windowFrame.y + STACK_STEP_1_TAB_CENTER_Y_OFFSET,
    },
  };
}

async function readFrontChromeWindowFrame(): Promise<WindowFrame> {
  const raw = await runAppleScript(`
    tell application "Google Chrome"
      if (count of windows) is 0 then
        error "Google Chrome has no windows."
      end if
      set windowBounds to bounds of front window
      return (item 1 of windowBounds as text) & "," & (item 2 of windowBounds as text) & "," & (item 3 of windowBounds as text) & "," & (item 4 of windowBounds as text)
    end tell
  `);

  const bounds = raw
    .trim()
    .split(",")
    .map((value) => Number(value.trim()));
  if (bounds.length !== 4 || bounds.some((value) => !Number.isFinite(value))) {
    throw new Error(`Invalid Chrome window bounds: ${raw.trim()}`);
  }

  const [left, top, right, bottom] = bounds;
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

async function setChromeTabUrl(tabIndex: number, url: string) {
  await runAppleScript(`
    tell application "Google Chrome"
      set targetWindow to front window
      set active tab index of targetWindow to ${tabIndex}
      set URL of active tab of targetWindow to "${escapeAppleScriptString(url)}"
    end tell
  `);
  await sleep(350);
}

async function activateChromeTab(tabIndex: number) {
  await runAppleScript(`
    tell application "Google Chrome"
      set targetWindow to front window
      set active tab index of targetWindow to ${tabIndex}
      activate
    end tell
  `);
  await sleep(250);
}

async function waitForChromeActiveTabUrlIncludes(
  fragment: string,
  timeoutMs: number,
) {
  const found = await waitForChromeActiveTabUrlIncludesWithin(
    fragment,
    timeoutMs,
  );
  if (found) {
    return;
  }

  throw new Error(`Timed out waiting for Chrome URL containing: ${fragment}`);
}

async function waitForChromeActiveTabUrlIncludesWithin(
  fragment: string,
  timeoutMs: number,
) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const url = await readChromeActiveTabUrl();
    if (url.includes(fragment)) {
      return true;
    }

    await sleep(250);
  }

  return false;
}

async function readChromeActiveTabUrl() {
  return runAppleScript(`
    tell application "Google Chrome"
      return URL of active tab of front window
    end tell
  `).then((value) => value.trim());
}

async function waitForChromeAxElementCenter(
  label: string,
  timeoutMs: number,
): Promise<ScreenPoint> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const point = await measureChromeAxElementCenter(label);
    if (point) {
      return point;
    }

    await sleep(250);
  }

  throw new Error(`Timed out waiting for Chrome element: ${label}`);
}

async function resolveOptionalChromeAuthButton(options: {
  buttonLabels: string[];
  successUrlFragments: string[];
  timeoutMs: number;
}) {
  const start = Date.now();

  while (Date.now() - start < options.timeoutMs) {
    const url = await readChromeActiveTabUrl();
    if (
      options.successUrlFragments.some((fragment) => url.includes(fragment))
    ) {
      for (const label of options.buttonLabels) {
        const point = await measureChromeAxElementCenter(label);
        if (point) {
          return point;
        }
      }

      return null;
    }

    for (const label of options.buttonLabels) {
      const point = await measureChromeAxElementCenter(label);
      if (point) {
        return point;
      }
    }

    await sleep(250);
  }

  return null;
}

async function measureChromeAxElementCenter(
  label: string,
): Promise<ScreenPoint | null> {
  return measureChromeAxElementCenterForRoles(label, ["AXButton", "AXLink"]);
}

async function measureChromeAxElementCenterForRoles(
  label: string,
  roles: readonly string[],
): Promise<ScreenPoint | null> {
  const raw = await runAppleScript(`
    tell application "System Events"
      tell process "Google Chrome"
        set frontmost to true
        set allItems to entire contents of window 1
        repeat with itemRef in allItems
          try
            set itemRole to role of itemRef as text
            if ${roles
              .map((role) => `itemRole is "${escapeAppleScriptString(role)}"`)
              .join(" or ")} then
              set itemLabel to ""
              try
                set itemLabel to description of itemRef as text
              end try
              if itemLabel is "" then
                try
                  set itemLabel to name of itemRef as text
                end try
              end if
              if itemLabel is "${escapeAppleScriptString(label)}" then
                set itemPosition to position of itemRef
                set itemSize to size of itemRef
                return ((item 1 of itemPosition) as text) & "," & ((item 2 of itemPosition) as text) & "|" & ((item 1 of itemSize) as text) & "," & ((item 2 of itemSize) as text)
              end if
            end if
          end try
        end repeat
        return ""
      end tell
    end tell
  `);

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const [positionPart, sizePart] = trimmed.split("|");
  if (!positionPart || !sizePart) {
    throw new Error(`Invalid AX measurement: ${trimmed}`);
  }

  const [x, y] = positionPart.split(",").map(Number);
  const [width, height] = sizePart.split(",").map(Number);
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    throw new Error(`Invalid AX measurement numbers: ${trimmed}`);
  }

  return {
    x: Math.round(x + width / 2),
    y: Math.round(y + height / 2),
  };
}

async function waitForChromeAxElementCenterForRoles(
  label: string,
  roles: readonly string[],
  timeoutMs: number,
): Promise<ScreenPoint> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const point = await measureChromeAxElementCenterForRoles(label, roles);
    if (point) {
      return point;
    }

    await sleep(250);
  }

  throw new Error(`Timed out waiting for Chrome element: ${label}`);
}

async function pressChromeAxButton(label: string) {
  const result = await runAppleScript(`
    tell application "System Events"
      tell process "Google Chrome"
        set frontmost to true
        set allItems to entire contents of window 1
        repeat with itemRef in allItems
          try
            if (role of itemRef as text) is "AXButton" then
              set itemLabel to ""
              try
                set itemLabel to description of itemRef as text
              end try
              if itemLabel is "" then
                try
                  set itemLabel to name of itemRef as text
                end try
              end if
              if itemLabel is "${escapeAppleScriptString(label)}" then
                click itemRef
                return "ok"
              end if
            end if
          end try
        end repeat
        return "missing"
      end tell
    end tell
  `);

  if (result.trim() !== "ok") {
    throw new Error(`Chrome button not found: ${label}`);
  }
}

async function readChromeAxPopupButtonLabelContaining(
  fragment: string,
): Promise<string | null> {
  const result = await runAppleScript(`
    tell application "System Events"
      tell process "Google Chrome"
        set frontmost to true
        set allItems to entire contents of window 1
        repeat with itemRef in allItems
          try
            if (role of itemRef as text) is "AXPopUpButton" then
              set itemLabel to ""
              try
                set itemLabel to description of itemRef as text
              end try
              if itemLabel is "" then
                try
                  set itemLabel to name of itemRef as text
                end try
              end if
              if itemLabel contains "${escapeAppleScriptString(fragment)}" then
                return itemLabel
              end if
            end if
          end try
        end repeat
        return ""
      end tell
    end tell
  `);

  const trimmed = result.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function readChromeAxMenuItemLabels(): Promise<string[]> {
  const result = await runAppleScript(`
    tell application "System Events"
      tell process "Google Chrome"
        set frontmost to true
        set allItems to entire contents of window 1
        set outputLines to ""
        repeat with itemRef in allItems
          try
            if (role of itemRef as text) is "AXMenuItem" then
              set itemLabel to ""
              try
                set itemLabel to description of itemRef as text
              end try
              if itemLabel is "" then
                try
                  set itemLabel to name of itemRef as text
                end try
              end if
              if itemLabel is not "" then
                if outputLines is "" then
                  set outputLines to itemLabel
                else
                  set outputLines to outputLines & linefeed & itemLabel
                end if
              end if
            end if
          end try
        end repeat
        return outputLines
      end tell
    end tell
  `);

  return result
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function readChromeAxButtonLabelContaining(
  fragment: string,
): Promise<string | null> {
  const result = await runAppleScript(`
    tell application "System Events"
      tell process "Google Chrome"
        set frontmost to true
        set allItems to entire contents of window 1
        repeat with itemRef in allItems
          try
            if (role of itemRef as text) is "AXButton" then
              set itemLabel to ""
              try
                set itemLabel to description of itemRef as text
              end try
              if itemLabel is "" then
                try
                  set itemLabel to name of itemRef as text
                end try
              end if
              if itemLabel contains "${escapeAppleScriptString(fragment)}" then
                return itemLabel
              end if
            end if
          end try
        end repeat
        return ""
      end tell
    end tell
  `);

  const trimmed = result.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function pressEscapeKey() {
  await runAppleScript(`
    tell application "System Events"
      key code 53
    end tell
  `);
}

async function runStackStep2GithubTemplateSequence(
  mouseBin: string,
  windowFrame: WindowFrame,
) {
  await sleep(350);
  await setChromeTabUrl(1, STACK_STEP_2_TEMPLATE_REPO_URL);
  await waitForChromeActiveTabUrlIncludes("/noter-md/template", 12_000);
  await sleep(STACK_PAGE_LOAD_SHOW_SECONDS * 1_000);

  const useTemplatePoint = await waitForChromeAxElementCenterForRoles(
    STACK_STEP_2_USE_TEMPLATE_LABEL,
    ["AXButton", "AXLink"],
    10_000,
  );
  await runMouseClick(
    mouseBin,
    useTemplatePoint,
    windowFrame,
    STACK_STEP_1_MOUSE_TIMING,
  );
  await waitForChromeActiveTabUrlIncludes("github.com/new?", 12_000);
  await sleep(STACK_PAGE_LOAD_SHOW_SECONDS * 1_000);

  const owner = await selectPreferredGithubRepoOwner(mouseBin, windowFrame);
  const suggestedRepoNameLabel = await readChromeAxButtonLabelContaining(
    STACK_STEP_2_REPO_NAME_SUGGESTION_LABEL_FRAGMENT,
  );
  if (suggestedRepoNameLabel === null) {
    throw new Error("GitHub repo name suggestion is unavailable.");
  }

  const suggestedRepoName = suggestedRepoNameLabel.replace(
    STACK_STEP_2_REPO_NAME_SUGGESTION_LABEL_FRAGMENT,
    "",
  );
  if (suggestedRepoName.length === 0) {
    throw new Error("GitHub repo name suggestion was empty.");
  }

  const suggestionPoint = await waitForChromeAxElementCenterForRoles(
    suggestedRepoNameLabel,
    ["AXButton"],
    10_000,
  );
  await runMouseClick(
    mouseBin,
    suggestionPoint,
    windowFrame,
    STACK_STEP_1_MOUSE_TIMING,
  );
  await sleep(STACK_CONTROL_SETTLE_SECONDS * 1_000);

  const createRepositoryPoint = await waitForChromeAxElementCenterForRoles(
    STACK_STEP_2_CREATE_REPOSITORY_BUTTON_LABEL,
    ["AXButton"],
    10_000,
  );
  await runMouseClick(
    mouseBin,
    createRepositoryPoint,
    windowFrame,
    STACK_STEP_1_MOUSE_TIMING,
  );
  if (
    !(await waitForChromeActiveTabUrlIncludesWithin(
      `github.com/${owner}/${suggestedRepoName}`,
      1_500,
    ))
  ) {
    // GitHub occasionally ignores the geometry-driven click on this submit
    // button even though the mouse visibly lands on it, so only fall back to a
    // direct AX press when that on-screen click failed to start navigation.
    await pressChromeAxButton(STACK_STEP_2_CREATE_REPOSITORY_BUTTON_LABEL);
  }
  await waitForChromeActiveTabUrlIncludes(
    `github.com/${owner}/${suggestedRepoName}`,
    18_000,
  );
  await sleep(STACK_PAGE_LOAD_SHOW_SECONDS * 1_000);
}

async function selectPreferredGithubRepoOwner(
  mouseBin: string,
  windowFrame: WindowFrame,
) {
  const popupLabel = await readChromeAxPopupButtonLabelContaining(
    STACK_STEP_2_OWNER_POPUP_LABEL_FRAGMENT,
  );
  if (popupLabel === null) {
    throw new Error("GitHub owner selector is unavailable.");
  }

  const ownerPopupPoint = await waitForChromeAxElementCenterForRoles(
    popupLabel,
    ["AXPopUpButton"],
    4_000,
  );
  await runMouseClick(
    mouseBin,
    ownerPopupPoint,
    windowFrame,
    STACK_STEP_1_MOUSE_TIMING,
  );
  await sleep(250);

  const ownerOptions = await readChromeAxMenuItemLabels();
  const preferredOwner = ownerOptions.at(0);
  if (!preferredOwner) {
    throw new Error("GitHub owner menu did not expose any choices.");
  }

  const currentOwner = popupLabel.split(",")[0]?.trim() ?? "";
  if (preferredOwner === currentOwner) {
    await pressEscapeKey();
    await sleep(250);
    return currentOwner;
  }

  const preferredOwnerPoint = await waitForChromeAxElementCenterForRoles(
    preferredOwner,
    ["AXMenuItem"],
    2_000,
  );
  await runMouseClick(
    mouseBin,
    preferredOwnerPoint,
    windowFrame,
    STACK_STEP_1_MOUSE_TIMING,
  );
  await sleep(STACK_CONTROL_SETTLE_SECONDS * 1_000);
  return preferredOwner;
}

function escapeAppleScriptString(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

async function runAppleScript(script: string) {
  const { stdout } = await runCommandCapture(
    "osascript",
    ["-e", script],
    REPO_ROOT,
  );
  return stdout;
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

async function runStackStep1Sequence(
  mouseBin: string,
  coords: StackStep1Coords,
  sequence: readonly StackStep1Step[],
) {
  for (const step of sequence) {
    if (step.kind === "wait") {
      await sleep(step.seconds * 1000);
      continue;
    }

    const point = resolveStackStep1Target(coords, step.target);
    await runMouseClick(
      mouseBin,
      point,
      coords.windowFrame,
      STACK_STEP_1_MOUSE_TIMING,
    );
    await applyStackStep1PostClickEffect(step.target, coords.windowFrame);
  }
}

async function runMouseClick(
  mouseBin: string,
  point: ScreenPoint,
  windowFrame: WindowFrame,
  timing: MouseTiming,
) {
  const safePoint = clampPointInsideWindowFrame(point, windowFrame);

  await runCommand(
    mouseBin,
    [
      "--actions",
      `click:${safePoint.x},${safePoint.y}`,
      "--move-duration",
      String(timing.moveDuration),
      "--pause-before-click",
      String(timing.pauseBeforeClick),
      "--click-hold-duration",
      String(timing.clickHoldDuration),
      "--pause-after-click",
      String(timing.pauseAfterClick),
      "--require-frontmost-bundle",
      "com.google.Chrome",
      "--require-window-owner",
      "Google Chrome",
      "--require-window-frame",
      serializeWindowFrame(windowFrame),
    ],
    REPO_ROOT,
  );
}

function clampPointInsideWindowFrame(
  point: ScreenPoint,
  windowFrame: WindowFrame,
): ScreenPoint {
  const inset = 5;
  const maxX = windowFrame.x + windowFrame.width - inset;
  const maxY = windowFrame.y + windowFrame.height - inset;

  return {
    // AppKit/AX measurements can land directly on Chrome's outer border while
    // the native mouse helper validates against the slightly smaller visible
    // frame, so keep every synthesized click a few points inside the window.
    x: Math.min(Math.max(point.x, windowFrame.x + inset), maxX),
    y: Math.min(Math.max(point.y, windowFrame.y + inset), maxY),
  };
}

async function applyStackStep1PostClickEffect(
  target: StackStep1Target,
  windowFrame: WindowFrame,
) {
  switch (target) {
    case "tabs.github":
      await activateChromeTab(1);
      break;
    case "tabs.convex":
      await activateChromeTab(2);
      break;
    case "tabs.cloudflare":
      await activateChromeTab(3);
      break;
    case "convex.homeLogin":
    case "convex.githubLogin":
    case "cloudflare.homeLogin":
    case "cloudflare.githubLogin":
      return;
    default:
      target satisfies never;
      return;
  }

  await focusChromeWindow(windowFrame);
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

function resolveStackStep1Target(
  coords: StackStep1Coords,
  target: StackStep1Target,
): ScreenPoint {
  switch (target) {
    case "tabs.github":
      return coords.tabs.github;
    case "tabs.convex":
      return coords.tabs.convex;
    case "convex.homeLogin":
      return coords.convex.homeLogin;
    case "convex.githubLogin":
      if (coords.convex.githubLogin !== null) {
        return coords.convex.githubLogin;
      }

      throw new Error("Convex GitHub login target is unavailable.");
    case "tabs.cloudflare":
      return coords.tabs.cloudflare;
    case "cloudflare.homeLogin":
      return coords.cloudflare.homeLogin;
    case "cloudflare.githubLogin":
      if (coords.cloudflare.githubLogin !== null) {
        return coords.cloudflare.githubLogin;
      }

      throw new Error("Cloudflare GitHub login target is unavailable.");
    default:
      target satisfies never;
      throw new Error("Unsupported stack-step-1 target.");
  }
}

function computeRecordingDurationSeconds(steps: readonly LandingDemoStep[]) {
  return computeTimedRecordingDurationSeconds(steps, LANDING_DEMO_MOUSE_TIMING);
}

function computeTimedRecordingDurationSeconds(
  steps: readonly { kind: "click" | "wait"; seconds?: number }[],
  timing: MouseTiming,
) {
  return (
    steps.reduce((totalSeconds, step) => {
      if (step.kind === "wait") {
        return totalSeconds + (step.seconds ?? 0);
      }

      return (
        totalSeconds +
        timing.moveDuration +
        timing.pauseBeforeClick +
        timing.clickHoldDuration +
        timing.pauseAfterClick
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

function runCommandCapture(command: string, args: string[], cwd: string) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve({ stdout, stderr });
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
