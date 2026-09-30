#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { bundle } from "@remotion/bundler";
import { openBrowser, renderStill, selectComposition } from "@remotion/renderer";

import { fail, resolveRepoRoot, runMain } from "../../../../scripts/lib/scriptRuntime.ts";
import { trackedFilePath } from "../../../../scripts/lib/trackedFilePath.ts";
import { chromeMode, chromiumOptions, webpackOverride } from "../renderSettings.ts";

const usage = `Usage: renderContactSheet.ts <composition-id> <frames> <columns> <output.jpg> [cell width]

<frames> is a comma-separated list of frame numbers (75) or seconds (2.5s).
The cell width defaults to 640 pixels.
Example: renderContactSheet.ts MengerDiveSpike 0,1s,2s,149 3 out/sheet.jpg 480`;
const cellPadding = 8;
const labelInset = 12;

type TimePoint = { kind: "frame"; value: number } | { kind: "seconds"; value: number };

function parseTimePoint(token: string): TimePoint {
  if (/^\d+$/.test(token)) {
    return { kind: "frame", value: Number(token) };
  }
  if (/^\d+(\.\d+)?s$/.test(token)) {
    return { kind: "seconds", value: Number(token.slice(0, -1)) };
  }
  return fail(`Invalid frame or time "${token}".\n\n${usage}`);
}

function readArguments() {
  const [compositionId, timeList, columnText, outputPath, cellWidthText = "640", ...rest] =
    process.argv.slice(2);
  if (!compositionId || !timeList || !columnText || !outputPath || rest.length > 0) {
    return fail(usage);
  }
  const columns = Number(columnText);
  if (!Number.isInteger(columns) || columns < 1) {
    return fail(`Invalid column count "${columnText}".\n\n${usage}`);
  }
  const cellWidth = Number(cellWidthText);
  if (!Number.isInteger(cellWidth) || cellWidth < 64) {
    return fail(`Invalid cell width "${cellWidthText}".\n\n${usage}`);
  }
  return {
    cellWidth,
    columns,
    compositionId,
    outputPath: path.resolve(outputPath),
    timePoints: timeList.split(",").map((token) => parseTimePoint(token.trim())),
  };
}

function runFfmpeg(args: string[]): void {
  const result = spawnSync("ffmpeg", args, { encoding: "utf8" });
  if (result.error) {
    fail(`Could not start ffmpeg: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`ffmpeg failed:\n${result.stderr}`);
  }
}

async function renderContactSheet(): Promise<void> {
  const { cellWidth, columns, compositionId, outputPath, timePoints } = readArguments();
  const entryPoint = path.join(
    resolveRepoRoot(),
    trackedFilePath("apps/remotion-studio/src/index.ts"),
  );
  const workDirectory = await mkdtemp(path.join(tmpdir(), "remotion-contact-sheet-"));
  const serveUrl = await bundle({ entryPoint, webpackOverride });
  const browser = await openBrowser("chrome", { chromeMode, chromiumOptions });

  try {
    const composition = await selectComposition({
      id: compositionId,
      puppeteerInstance: browser,
      serveUrl,
    });
    const labelComposition = await selectComposition({
      id: "ContactSheetLabel",
      puppeteerInstance: browser,
      serveUrl,
    });
    const frames = timePoints.map((timePoint) =>
      timePoint.kind === "frame" ? timePoint.value : Math.round(timePoint.value * composition.fps),
    );
    const lastFrame = composition.durationInFrames - 1;
    const outOfRange = frames.find((frame) => frame > lastFrame);
    if (outOfRange !== undefined) {
      fail(`Frame ${outOfRange} is after the last frame of ${compositionId} (${lastFrame}).`);
    }

    for (const [index, frame] of frames.entries()) {
      const cellName = String(index).padStart(3, "0");
      const startedAt = performance.now();
      await renderStill({
        chromiumOptions,
        composition,
        frame,
        output: path.join(workDirectory, `cell-${cellName}.png`),
        puppeteerInstance: browser,
        serveUrl,
      });
      const elapsedMilliseconds = performance.now() - startedAt;
      const labelProps = { text: `${(frame / composition.fps).toFixed(2)} s  f${frame}` };
      await renderStill({
        chromiumOptions,
        composition: { ...labelComposition, props: labelProps },
        inputProps: labelProps,
        output: path.join(workDirectory, `label-${cellName}.png`),
        puppeteerInstance: browser,
        serveUrl,
      });
      console.log(`Rendered frame ${frame} in ${Math.round(elapsedMilliseconds)} ms`);
    }

    const rows = Math.ceil(frames.length / columns);
    await mkdir(path.dirname(outputPath), { recursive: true });
    runFfmpeg([
      "-y",
      "-loglevel",
      "error",
      "-framerate",
      "1",
      "-i",
      path.join(workDirectory, "cell-%03d.png"),
      "-framerate",
      "1",
      "-i",
      path.join(workDirectory, "label-%03d.png"),
      "-filter_complex",
      `[0:v]scale=${cellWidth}:-2:flags=lanczos[cell];[cell][1:v]overlay=${labelInset}:${labelInset},tile=${columns}x${rows}:padding=${cellPadding}:margin=${cellPadding}:color=white`,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      outputPath,
    ]);
    console.log(`Wrote ${outputPath}`);
  } finally {
    await browser.close({ silent: true });
    await rm(workDirectory, { force: true, recursive: true });
  }
}

await runMain(renderContactSheet);
