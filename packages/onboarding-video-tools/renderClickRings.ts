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
};

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

  return candidate.map((event) => {
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
}

function toLocalEvents(
  events: ClickEvent[],
  windowFrame: WindowFrame,
  pad: number,
  scaleX: number,
  scaleY: number,
  maxWidth: number,
  maxHeight: number,
) {
  return events
    .map((event) => ({
      time: event.time,
      x: Math.round((event.x - windowFrame.x) * scaleX + pad),
      y: Math.round((event.y - windowFrame.y) * scaleY + pad),
    }))
    .filter(
      (event) =>
        event.x >= 0 &&
        event.y >= 0 &&
        event.x < maxWidth &&
        event.y < maxHeight,
    );
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
): string {
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
): string {
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

async function main() {
  const options = parseRenderOptions(process.argv.slice(2));
  const rawEvents = parseClickEvents(
    await fs.readFile(options.eventsPath, "utf8"),
  );
  const videoInfo = probeVideo(options.inputPath);
  const scaleX = videoInfo.width / options.windowFrame.width;
  const scaleY = videoInfo.height / options.windowFrame.height;
  const finalWidth = videoInfo.width + options.pad * 2;
  const finalHeight = videoInfo.height + options.pad * 2;
  const localEvents = toLocalEvents(
    rawEvents,
    options.windowFrame,
    options.pad,
    scaleX,
    scaleY,
    finalWidth,
    finalHeight,
  );

  const blackRingAlpha = buildRingAlphaExpr(localEvents, {
    animationDuration: 0.24,
    startRadius: 10,
    endRadius: 42,
    thickness: 5.2,
    maxOpacity: 235,
  });
  const whiteRingAlpha = buildRingAlphaExpr(localEvents, {
    animationDuration: 0.22,
    startRadius: 7,
    endRadius: 34,
    thickness: 3.4,
    maxOpacity: 255,
  });
  const corePulseAlpha = buildPulseAlphaExpr(localEvents, {
    animationDuration: 0.14,
    startRadius: 9,
    endRadius: 3,
    maxOpacity: 150,
  });

  // Keep every synthetic overlay source on the same padded canvas and timeline
  // as the captured window so event coordinates and timestamps stay aligned.
  const filterScript = [
    `[0:v]pad=iw+${options.pad * 2}:ih+${options.pad * 2}:${options.pad}:${options.pad}:color=0xF3F4F6[base]`,
    `color=c=black@0.0:s=${finalWidth}x${finalHeight}:d=${videoInfo.duration.toFixed(3)},format=rgba,geq=r='0':g='0':b='0':a='${blackRingAlpha}'[black_ring]`,
    `color=c=white@0.0:s=${finalWidth}x${finalHeight}:d=${videoInfo.duration.toFixed(3)},format=rgba,geq=r='255':g='255':b='255':a='${whiteRingAlpha}'[white_ring]`,
    `color=c=black@0.0:s=${finalWidth}x${finalHeight}:d=${videoInfo.duration.toFixed(3)},format=rgba,geq=r='0':g='0':b='0':a='${corePulseAlpha}'[core_pulse]`,
    `[base][black_ring]overlay=format=auto[with_black_ring]`,
    `[with_black_ring][white_ring]overlay=format=auto[with_white_ring]`,
    `[with_white_ring][core_pulse]overlay=format=auto,fps=30,format=yuv420p[outv]`,
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
        "18",
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
  const pad = Number(args.pad ?? "48");

  if (!inputPath || !outputPath || !eventsPath || !windowFrameArg) {
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
  };
}

await main();
