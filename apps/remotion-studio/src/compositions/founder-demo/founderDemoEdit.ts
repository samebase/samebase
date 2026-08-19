import {
  createRecordedDemoEdit,
  type RecordedDemoSourceSection,
} from "../recorded-demo/recordedDemoEdit.ts";

export const founderDemoFps = 30;

const sourceDurationInFrames = 73_545;
const mediumWaitMaximumPlaybackRate = 24;
const longWaitMaximumPlaybackRate = 32;

const sourceSections = [
  {
    kind: "face",
    name: "Face 00:00",
    sourceEndInSeconds: 62.49,
    sourceStartInSeconds: 0,
  },
  {
    kind: "wait",
    maximumPlaybackRate: mediumWaitMaximumPlaybackRate,
    name: "Wait 01:02",
    sourceEndInSeconds: 89.51,
    sourceStartInSeconds: 62.49,
  },
  {
    kind: "face",
    name: "Face 01:29",
    sourceEndInSeconds: 105.61,
    sourceStartInSeconds: 89.51,
  },
  {
    kind: "wait",
    maximumPlaybackRate: mediumWaitMaximumPlaybackRate,
    name: "Wait 01:45",
    sourceEndInSeconds: 180.5,
    sourceStartInSeconds: 105.61,
  },
  {
    kind: "face",
    name: "Face 03:00",
    sourceEndInSeconds: 207.89,
    sourceStartInSeconds: 180.5,
  },
  {
    kind: "wait",
    maximumPlaybackRate: mediumWaitMaximumPlaybackRate,
    name: "Wait 03:27",
    sourceEndInSeconds: 268.82,
    sourceStartInSeconds: 207.89,
  },
  {
    kind: "face",
    name: "Face 04:28",
    sourceEndInSeconds: 310.59,
    sourceStartInSeconds: 268.82,
  },
  {
    kind: "wait",
    maximumPlaybackRate: mediumWaitMaximumPlaybackRate,
    name: "Wait 05:10",
    sourceEndInSeconds: 391.83,
    sourceStartInSeconds: 310.59,
  },
  {
    kind: "face",
    name: "Face 06:31",
    sourceEndInSeconds: 400.97,
    sourceStartInSeconds: 391.83,
  },
  {
    kind: "wait",
    maximumPlaybackRate: longWaitMaximumPlaybackRate,
    name: "Wait 06:40",
    sourceEndInSeconds: 1_105.99,
    sourceStartInSeconds: 400.97,
  },
  {
    kind: "face",
    name: "Face 18:25",
    sourceEndInSeconds: 1_130.98,
    sourceStartInSeconds: 1_105.99,
  },
  {
    kind: "wait",
    maximumPlaybackRate: longWaitMaximumPlaybackRate,
    name: "Wait 18:50",
    sourceEndInSeconds: 1_699.77,
    sourceStartInSeconds: 1_130.98,
  },
  {
    kind: "face",
    name: "Face 28:19",
    sourceEndInSeconds: 1_704.9,
    sourceStartInSeconds: 1_699.77,
  },
  {
    kind: "wait",
    maximumPlaybackRate: longWaitMaximumPlaybackRate,
    name: "Wait 28:24",
    sourceEndInSeconds: 2_439.7,
    sourceStartInSeconds: 1_704.9,
  },
  {
    kind: "face",
    name: "Face 40:39",
    sourceEndInSeconds: sourceDurationInFrames / founderDemoFps,
    sourceStartInSeconds: 2_439.7,
  },
] satisfies readonly RecordedDemoSourceSection[];

export const founderDemoEdit = createRecordedDemoEdit({
  fps: founderDemoFps,
  sourceDurationInFrames,
  sourceSections,
});

export const founderDemoEditDurationInFrames = founderDemoEdit.durationInFrames;
