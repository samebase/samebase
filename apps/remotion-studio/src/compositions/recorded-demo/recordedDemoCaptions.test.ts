import { describe, expect, it } from "vite-plus/test";

import { createRecordedDemoCaptionCues } from "./recordedDemoCaptions";
import { createRecordedDemoEdit } from "./recordedDemoEdit";

const caption = (text: string, startMs: number, endMs: number) => ({
  confidence: 1,
  endMs,
  startMs,
  text,
  timestampMs: (startMs + endMs) / 2,
});

describe("createRecordedDemoCaptionCues", () => {
  it("retimes spoken captions and omits captions from accelerated waits", () => {
    const fps = 10;
    const edit = createRecordedDemoEdit({
      fps,
      sourceDurationInFrames: 120,
      sourceSections: [
        {
          kind: "face",
          name: "First face",
          sourceEndInSeconds: 3,
          sourceStartInSeconds: 0,
        },
        {
          kind: "wait",
          maximumPlaybackRate: 4,
          name: "Wait",
          sourceEndInSeconds: 9,
          sourceStartInSeconds: 3,
        },
        {
          kind: "face",
          name: "Second face",
          sourceEndInSeconds: 12,
          sourceStartInSeconds: 9,
        },
      ],
    });
    const secondFace = edit.segments[2];

    if (secondFace?.kind !== "face") {
      throw new Error("The test edit must end with a face segment");
    }

    const cues = createRecordedDemoCaptionCues(
      [
        caption("First", 1_000, 2_000),
        caption("Clipped", 2_500, 3_500),
        caption("Waiting", 4_000, 5_000),
        caption("Second", 9_500, 10_500),
      ],
      edit,
    );

    expect(
      cues.map(({ caption: cueCaption, editEndInFrames, editStartInFrames }) => ({
        editEndInFrames,
        editStartInFrames,
        text: cueCaption.text,
      })),
    ).toEqual([
      { editEndInFrames: 20, editStartInFrames: 10, text: "First" },
      { editEndInFrames: 30, editStartInFrames: 25, text: "Clipped" },
      {
        editEndInFrames: secondFace.editStartInFrames + 15,
        editStartInFrames: secondFace.editStartInFrames + 5,
        text: "Second",
      },
    ]);
  });
});
