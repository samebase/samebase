#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parseSrt, serializeSrt, type Caption } from "@remotion/captions";

import { resolveRepoRoot, runMain } from "../../../../scripts/lib/scriptRuntime.ts";
import { trackedFilePath } from "../../../../scripts/lib/trackedFilePath.ts";
import { founderDemoEdit } from "../compositions/founder-demo/founderDemoEdit.ts";
import { onboardingDemoEdit } from "../compositions/onboarding-demo/onboardingDemoEdit.ts";
import { createRecordedDemoCaptionCues } from "../compositions/recorded-demo/recordedDemoCaptions.ts";
import type { RecordedDemoEdit } from "../compositions/recorded-demo/recordedDemoEdit.ts";

const demos = [
  {
    edit: founderDemoEdit,
    outputName: "founder-demo-youtube.srt",
    sourcePath: trackedFilePath("apps/remotion-studio/public/media/founder-demo.srt"),
  },
  {
    edit: onboardingDemoEdit,
    outputName: "onboarding-demo-youtube.srt",
    sourcePath: trackedFilePath("apps/remotion-studio/public/media/onboarding-demo.srt"),
  },
] satisfies readonly {
  edit: RecordedDemoEdit;
  outputName: string;
  sourcePath: string;
}[];

function createEditedCaptions(captions: readonly Caption[], edit: RecordedDemoEdit): Caption[] {
  return createRecordedDemoCaptionCues(captions, edit).map(
    ({ caption, editEndInFrames, editStartInFrames }) => ({
      confidence: caption.confidence,
      endMs: (editEndInFrames / edit.fps) * 1_000,
      startMs: (editStartInFrames / edit.fps) * 1_000,
      text: caption.text,
      timestampMs: null,
    }),
  );
}

async function generateRecordedDemoSubtitles(): Promise<void> {
  const repoRoot = resolveRepoRoot();
  const outputDirectory = path.join(repoRoot, "apps/remotion-studio/out");
  await mkdir(outputDirectory, { recursive: true });

  for (const demo of demos) {
    const source = await readFile(path.join(repoRoot, demo.sourcePath), "utf8");
    const parsed = parseSrt({ input: source });
    const captions = createEditedCaptions(parsed.captions, demo.edit);
    const outputPath = path.join(outputDirectory, demo.outputName);
    const srt = `${serializeSrt({ lines: captions.map((caption) => [caption]) })}\n`;

    await writeFile(outputPath, srt, "utf8");
    console.log(`Generated ${path.relative(repoRoot, outputPath)}`);
  }
}

await runMain(generateRecordedDemoSubtitles);
