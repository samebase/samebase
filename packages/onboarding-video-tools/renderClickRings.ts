import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

type ParsedArgs = Record<string, string | undefined>;

type ClickEvent = {
  time: number;
  x: number;
  y: number;
};

type VideoInfo = {
  width: number;
  height: number;
  duration: number;
};

type WindowFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type RenderClickRingsOptions = {
  inputPath: string;
  outputPath: string;
  eventsPath: string;
  windowFrame: WindowFrame;
  pad: number;
  fps: number;
  ringDuration: number;
};

const DEFAULT_PAD = 32;
const WINDOW_CORNER_RADIUS = 26;
const WINDOW_BACKGROUND_COLOR = "0xF6F6F3";
const AMBIENT_SHADOW_PAD = 34;
const AMBIENT_SHADOW_OPACITY = 0.22;
const AMBIENT_SHADOW_BLUR_RADIUS = 24;
const AMBIENT_SHADOW_OFFSET_X = 0;
const AMBIENT_SHADOW_OFFSET_Y = 8;
const KEY_SHADOW_PAD = 22;
const KEY_SHADOW_OPACITY = 0.24;
const KEY_SHADOW_BLUR_RADIUS = 10;
const KEY_SHADOW_OFFSET_X = 0;
const KEY_SHADOW_OFFSET_Y = 14;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

function parseWindowFrame(rawFrame: string): WindowFrame {
  const parts = rawFrame.split(",").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((value) => !Number.isFinite(value)) ||
    parts[2] <= 0 ||
    parts[3] <= 0
  ) {
    throw new Error(`Invalid --window-frame value: ${rawFrame}`);
  }

  return {
    x: parts[0],
    y: parts[1],
    width: parts[2],
    height: parts[3],
  };
}

function parsePositiveInt(rawValue: string, flagName: string) {
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid ${flagName} value: ${rawValue}`);
  }

  return value;
}

function parsePositiveDuration(rawValue: string, flagName: string) {
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid ${flagName} value: ${rawValue}`);
  }

  return value;
}

function probeVideo(inputPath: string): VideoInfo {
  const output = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-show_entries",
      "format=duration",
      "-of",
      "json",
      inputPath,
    ],
    { encoding: "utf8" },
  );
  const parsed = parseProbeResult(output, inputPath);
  const stream = parsed.streams[0];

  return {
    width: stream.width,
    height: stream.height,
    duration: Number(parsed.format.duration),
  };
}

function parseProbeResult(
  output: string,
  inputPath: string,
): {
  streams: Array<{ width: number; height: number }>;
  format: { duration: string };
} {
  const candidate: unknown = JSON.parse(output);
  if (!isRecord(candidate)) {
    throw new Error(`Could not read video stream info for ${inputPath}`);
  }

  const streamsValue = candidate.streams;
  const formatValue = candidate.format;
  if (!Array.isArray(streamsValue) || streamsValue.length === 0) {
    throw new Error(`Could not read video stream info for ${inputPath}`);
  }
  if (!isRecord(formatValue)) {
    throw new Error(`Could not read video stream info for ${inputPath}`);
  }

  const streams = streamsValue.map((stream) => {
    if (!isRecord(stream)) {
      throw new Error(`Could not read video stream info for ${inputPath}`);
    }

    if (typeof stream.width !== "number" || typeof stream.height !== "number") {
      throw new Error(`Could not read video stream info for ${inputPath}`);
    }

    return {
      width: stream.width,
      height: stream.height,
    };
  });

  if (typeof formatValue.duration !== "string") {
    throw new Error(`Could not read video stream info for ${inputPath}`);
  }

  return {
    streams,
    format: {
      duration: formatValue.duration,
    },
  };
}

function parseClickEvents(raw: string): ClickEvent[] {
  const candidate: unknown = JSON.parse(raw);
  if (!Array.isArray(candidate)) {
    throw new Error("Click event log must be a JSON array.");
  }

  const events = candidate.map((event) => {
    if (!isRecord(event)) {
      throw new Error("Click event log contains an invalid event.");
    }

    if (
      typeof event.time !== "number" ||
      !Number.isFinite(event.time) ||
      typeof event.x !== "number" ||
      !Number.isFinite(event.x) ||
      typeof event.y !== "number" ||
      !Number.isFinite(event.y)
    ) {
      throw new Error("Click event log contains an invalid event.");
    }

    return {
      time: event.time,
      x: event.x,
      y: event.y,
    };
  });

  if (events.length === 0) {
    throw new Error("Click event log is empty.");
  }

  return events;
}

function mapEventToVideoCoordinates(
  event: ClickEvent,
  windowFrame: WindowFrame,
  pad: number,
  scaleX: number,
  scaleY: number,
  maxWidth: number,
  maxHeight: number,
  videoDuration: number,
) {
  if (event.time < 0 || event.time > videoDuration) {
    throw new Error(
      `Click event at ${event.time.toFixed(3)}s falls outside the ${videoDuration.toFixed(3)}s recording.`,
    );
  }

  const mapped = {
    time: event.time,
    x: Math.round((event.x - windowFrame.x) * scaleX + pad),
    y: Math.round((event.y - windowFrame.y) * scaleY + pad),
  };

  if (
    mapped.x < 0 ||
    mapped.y < 0 ||
    mapped.x >= maxWidth ||
    mapped.y >= maxHeight
  ) {
    throw new Error(
      `Mapped click ${event.x},${event.y} to ${mapped.x},${mapped.y}, which is outside the padded ${maxWidth}x${maxHeight} frame.`,
    );
  }

  return mapped;
}

function combineExpressions(parts: string[]): string {
  if (parts.length === 0) {
    return "0";
  }

  return parts.reduce((left, right) => `max(${left},${right})`);
}

function buildRingAlphaExpr(
  events: Array<{ time: number; x: number; y: number }>,
  options: {
    animationDuration: number;
    startRadius: number;
    endRadius: number;
    thickness: number;
    maxOpacity: number;
  },
) {
  const { animationDuration, startRadius, endRadius, thickness, maxOpacity } =
    options;
  const amplitude = endRadius - startRadius;

  const parts = events.map((event) => {
    const start = event.time.toFixed(3);
    const end = (event.time + animationDuration).toFixed(3);
    const timeProgress = `((T-${start})/${animationDuration})`;
    const radius = `(${startRadius}+${amplitude}*${timeProgress})`;
    const distance = `hypot(X-${event.x},Y-${event.y})`;
    const ring = `max(0,1-abs(${distance}-${radius})/${thickness})`;
    const fade = `(1-${timeProgress})`;
    return `if(between(T,${start},${end}),${maxOpacity}*${ring}*${fade},0)`;
  });

  return combineExpressions(parts);
}

function buildPulseAlphaExpr(
  events: Array<{ time: number; x: number; y: number }>,
  options: {
    animationDuration: number;
    startRadius: number;
    endRadius: number;
    maxOpacity: number;
  },
) {
  const { animationDuration, startRadius, endRadius, maxOpacity } = options;
  const amplitude = endRadius - startRadius;

  const parts = events.map((event) => {
    const start = event.time.toFixed(3);
    const end = (event.time + animationDuration).toFixed(3);
    const timeProgress = `((T-${start})/${animationDuration})`;
    const radius = `(${startRadius}+${amplitude}*${timeProgress})`;
    const distance = `hypot(X-${event.x},Y-${event.y})`;
    const disk = `max(0,1-${distance}/${radius})`;
    const fade = `(1-${timeProgress})`;
    return `if(between(T,${start},${end}),${maxOpacity}*${disk}*${fade},0)`;
  });

  return combineExpressions(parts);
}

function buildRoundedRectAlphaExpr(
  width: number,
  height: number,
  cornerRadius: number,
) {
  const clampedCornerRadius = Math.max(
    1,
    Math.min(cornerRadius, Math.floor(Math.min(width, height) / 2)),
  );
  const rightEdge = width - clampedCornerRadius - 1;
  const bottomEdge = height - clampedCornerRadius - 1;
  const deltaX = `max(max(${clampedCornerRadius}-X,0),X-${rightEdge})`;
  const deltaY = `max(max(${clampedCornerRadius}-Y,0),Y-${bottomEdge})`;

  return `255*lte(hypot(${deltaX},${deltaY}),${clampedCornerRadius})`;
}

function buildShadowOverlayPosition(
  pad: number,
  shadowPad: number,
  offsetX: number,
  offsetY: number,
) {
  return {
    x: pad - shadowPad + offsetX,
    y: pad - shadowPad + offsetY,
  };
}

async function main() {
  const options = parseRenderOptions(process.argv.slice(2));
  const videoInfo = probeVideo(options.inputPath);
  const scaleX = videoInfo.width / options.windowFrame.width;
  const scaleY = videoInfo.height / options.windowFrame.height;
  const finalWidth = videoInfo.width + options.pad * 2;
  const finalHeight = videoInfo.height + options.pad * 2;
  const ambientShadowWidth = videoInfo.width + AMBIENT_SHADOW_PAD * 2;
  const ambientShadowHeight = videoInfo.height + AMBIENT_SHADOW_PAD * 2;
  const ambientShadowOverlay = buildShadowOverlayPosition(
    options.pad,
    AMBIENT_SHADOW_PAD,
    AMBIENT_SHADOW_OFFSET_X,
    AMBIENT_SHADOW_OFFSET_Y,
  );
  const keyShadowWidth = videoInfo.width + KEY_SHADOW_PAD * 2;
  const keyShadowHeight = videoInfo.height + KEY_SHADOW_PAD * 2;
  const keyShadowOverlay = buildShadowOverlayPosition(
    options.pad,
    KEY_SHADOW_PAD,
    KEY_SHADOW_OFFSET_X,
    KEY_SHADOW_OFFSET_Y,
  );
  const rawEvents = parseClickEvents(
    await fs.readFile(options.eventsPath, "utf8"),
  );
  const localEvents = rawEvents.map((event) =>
    mapEventToVideoCoordinates(
      event,
      options.windowFrame,
      options.pad,
      scaleX,
      scaleY,
      finalWidth,
      finalHeight,
      videoInfo.duration,
    ),
  );
  const corePulseDuration = Math.min(options.ringDuration, 0.14);

  const blackRingAlpha = buildRingAlphaExpr(localEvents, {
    animationDuration: options.ringDuration,
    startRadius: 10,
    endRadius: 44,
    thickness: 8.4,
    maxOpacity: 255,
  });
  const whiteRingAlpha = buildRingAlphaExpr(localEvents, {
    animationDuration: options.ringDuration,
    startRadius: 10,
    endRadius: 44,
    thickness: 4.8,
    maxOpacity: 255,
  });
  const corePulseAlpha = buildPulseAlphaExpr(localEvents, {
    animationDuration: corePulseDuration,
    startRadius: 10,
    endRadius: 4,
    maxOpacity: 190,
  });
  const roundedWindowAlpha = buildRoundedRectAlphaExpr(
    videoInfo.width,
    videoInfo.height,
    WINDOW_CORNER_RADIUS,
  );

  const filterScript = [
    // ScreenCaptureKit emits a variable-rate stream, so normalize the base
    // capture first. Otherwise a click on a mostly static page can produce too
    // few frames for the ripple to fully grow before it fades out.
    `[0:v]fps=${options.fps},setsar=1,format=rgba,split[window_rgb][window_alpha_src]`,
    `[window_alpha_src]format=gray,geq=lum='${roundedWindowAlpha}'[window_alpha]`,
    `[window_rgb][window_alpha]alphamerge[window_masked]`,
    `[window_alpha]pad=${ambientShadowWidth}:${ambientShadowHeight}:${AMBIENT_SHADOW_PAD}:${AMBIENT_SHADOW_PAD}:color=black,boxblur=${AMBIENT_SHADOW_BLUR_RADIUS}:1,lut=y='val*${AMBIENT_SHADOW_OPACITY}'[ambient_shadow_alpha]`,
    `color=c=black:s=${ambientShadowWidth}x${ambientShadowHeight}:r=${options.fps}:d=${videoInfo.duration.toFixed(3)},format=rgba[ambient_shadow_rgb]`,
    `[ambient_shadow_rgb][ambient_shadow_alpha]alphamerge[ambient_shadow]`,
    `[window_alpha]pad=${keyShadowWidth}:${keyShadowHeight}:${KEY_SHADOW_PAD}:${KEY_SHADOW_PAD}:color=black,boxblur=${KEY_SHADOW_BLUR_RADIUS}:1,lut=y='val*${KEY_SHADOW_OPACITY}'[key_shadow_alpha]`,
    `color=c=black:s=${keyShadowWidth}x${keyShadowHeight}:r=${options.fps}:d=${videoInfo.duration.toFixed(3)},format=rgba[key_shadow_rgb]`,
    `[key_shadow_rgb][key_shadow_alpha]alphamerge[key_shadow]`,
    `color=c=${WINDOW_BACKGROUND_COLOR}:s=${finalWidth}x${finalHeight}:r=${options.fps}:d=${videoInfo.duration.toFixed(3)},format=rgba[window_background]`,
    `[window_background][ambient_shadow]overlay=${ambientShadowOverlay.x}:${ambientShadowOverlay.y}:format=auto[with_ambient_shadow]`,
    `[with_ambient_shadow][key_shadow]overlay=${keyShadowOverlay.x}:${keyShadowOverlay.y}:format=auto[with_shadow]`,
    `[with_shadow][window_masked]overlay=${options.pad}:${options.pad}:format=auto[base]`,
    `color=c=black@0.0:s=${finalWidth}x${finalHeight}:r=${options.fps}:d=${videoInfo.duration.toFixed(3)},format=rgba,geq=r='0':g='0':b='0':a='${blackRingAlpha}'[black_ring]`,
    `color=c=white@0.0:s=${finalWidth}x${finalHeight}:r=${options.fps}:d=${videoInfo.duration.toFixed(3)},format=rgba,geq=r='255':g='255':b='255':a='${whiteRingAlpha}'[white_ring]`,
    `color=c=white@0.0:s=${finalWidth}x${finalHeight}:r=${options.fps}:d=${videoInfo.duration.toFixed(3)},format=rgba,geq=r='255':g='255':b='255':a='${corePulseAlpha}'[core_pulse]`,
    `[base][black_ring]overlay=format=auto[with_black_ring]`,
    `[with_black_ring][white_ring]overlay=format=auto[with_white_ring]`,
    `[with_white_ring][core_pulse]overlay=format=auto,format=yuv420p[outv]`,
  ].join(";\n");

  const filterScriptPath = path.join(
    os.tmpdir(),
    `click-rings-${Date.now()}-${Math.random().toString(16).slice(2)}.ffscript`,
  );

  try {
    await fs.writeFile(filterScriptPath, filterScript);
    execFileSync(
      "ffmpeg",
      [
        "-hide_banner",
        "-y",
        "-i",
        options.inputPath,
        "-filter_complex_script",
        filterScriptPath,
        "-map",
        "[outv]",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-profile:v",
        "high",
        "-preset",
        "fast",
        "-crf",
        "14",
        "-movflags",
        "+faststart",
        options.outputPath,
      ],
      { stdio: "pipe" },
    );
  } finally {
    await fs.rm(filterScriptPath, { force: true });
  }
}

function parseRenderOptions(argv: string[]): RenderClickRingsOptions {
  const args = parseArgs(argv);
  const inputPath = args.input;
  const outputPath = args.output;
  const eventsPath = args.events;
  const windowFrameArg = args["window-frame"];
  const fpsArg = args.fps;
  const ringDurationArg = args["ring-duration"];
  const pad = Number(args.pad ?? String(DEFAULT_PAD));

  if (
    !inputPath ||
    !outputPath ||
    !eventsPath ||
    !windowFrameArg ||
    !fpsArg ||
    !ringDurationArg
  ) {
    throw new Error("Missing required arguments.");
  }

  if (Number.isNaN(pad) || pad < 0) {
    throw new Error(`Invalid --pad value: ${args.pad ?? "<missing>"}`);
  }

  return {
    inputPath,
    outputPath,
    eventsPath,
    windowFrame: parseWindowFrame(windowFrameArg),
    pad,
    fps: parsePositiveInt(fpsArg, "--fps"),
    ringDuration: parsePositiveDuration(ringDurationArg, "--ring-duration"),
  };
}

await main();
