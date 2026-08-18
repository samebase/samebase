import {
  createRecordedDemoEdit,
  type RecordedDemoSourceSection,
} from "../recorded-demo/recordedDemoEdit";

export const onboardingDemoFps = 30;

const sourceDurationInFrames = 20_337;
const annotatedWaitMaximumPlaybackRate = 16;

const sourceSections = [
  {
    kind: "face",
    name: "Face 00:00",
    sourceEndInSeconds: 48.69,
    sourceStartInSeconds: 0,
  },
  {
    kind: "wait",
    maximumPlaybackRate: annotatedWaitMaximumPlaybackRate,
    name: "Wait 00:48",
    sourceEndInSeconds: 54.69,
    sourceStartInSeconds: 48.69,
  },
  {
    kind: "face",
    name: "Face 00:54",
    sourceEndInSeconds: 56.14,
    sourceStartInSeconds: 54.69,
  },
  {
    kind: "wait",
    maximumPlaybackRate: annotatedWaitMaximumPlaybackRate,
    name: "Wait 00:56",
    sourceEndInSeconds: 71.76,
    sourceStartInSeconds: 56.14,
  },
  {
    kind: "face",
    name: "Face 01:11",
    sourceEndInSeconds: 74.66,
    sourceStartInSeconds: 71.76,
  },
  {
    kind: "wait",
    maximumPlaybackRate: annotatedWaitMaximumPlaybackRate,
    name: "Wait 01:14",
    sourceEndInSeconds: 82.71,
    sourceStartInSeconds: 74.66,
  },
  {
    kind: "face",
    name: "Face 01:22",
    sourceEndInSeconds: 92.67,
    sourceStartInSeconds: 82.71,
  },
  {
    kind: "wait",
    maximumPlaybackRate: annotatedWaitMaximumPlaybackRate,
    name: "Wait 01:32",
    sourceEndInSeconds: 97.48,
    sourceStartInSeconds: 92.67,
  },
  {
    kind: "face",
    name: "Face 01:37",
    sourceEndInSeconds: 115.94,
    sourceStartInSeconds: 97.48,
  },
  {
    kind: "wait",
    maximumPlaybackRate: annotatedWaitMaximumPlaybackRate,
    name: "Wait 01:55",
    sourceEndInSeconds: 126.34,
    sourceStartInSeconds: 115.94,
  },
  {
    kind: "face",
    name: "Face 02:06",
    sourceEndInSeconds: 130,
    sourceStartInSeconds: 126.34,
  },
  {
    kind: "wait",
    maximumPlaybackRate: annotatedWaitMaximumPlaybackRate,
    name: "Wait 02:10",
    sourceEndInSeconds: 143.69,
    sourceStartInSeconds: 130,
  },
  {
    kind: "face",
    name: "Face 02:23",
    sourceEndInSeconds: 180.8,
    sourceStartInSeconds: 143.69,
  },
  {
    kind: "wait",
    maximumPlaybackRate: annotatedWaitMaximumPlaybackRate,
    name: "Wait 03:00",
    sourceEndInSeconds: 187.11,
    sourceStartInSeconds: 180.8,
  },
  {
    kind: "face",
    name: "Face 03:07",
    sourceEndInSeconds: 235.43,
    sourceStartInSeconds: 187.11,
  },
  {
    kind: "wait",
    maximumPlaybackRate: annotatedWaitMaximumPlaybackRate,
    name: "Wait 03:55",
    sourceEndInSeconds: 242.11,
    sourceStartInSeconds: 235.43,
  },
  {
    kind: "face",
    name: "Face 04:02",
    sourceEndInSeconds: 324.69,
    sourceStartInSeconds: 242.11,
  },
  {
    kind: "wait",
    maximumPlaybackRate: annotatedWaitMaximumPlaybackRate,
    name: "Wait 05:24",
    sourceEndInSeconds: 355.63,
    sourceStartInSeconds: 324.69,
  },
  {
    kind: "face",
    name: "Face 05:55",
    sourceEndInSeconds: 488.17,
    sourceStartInSeconds: 355.63,
  },
  {
    kind: "wait",
    maximumPlaybackRate: annotatedWaitMaximumPlaybackRate,
    name: "Wait 08:08",
    sourceEndInSeconds: 519.97,
    sourceStartInSeconds: 488.17,
  },
  {
    kind: "face",
    name: "Face 08:39",
    sourceEndInSeconds: 529.97,
    sourceStartInSeconds: 519.97,
  },
  {
    kind: "wait",
    maximumPlaybackRate: annotatedWaitMaximumPlaybackRate,
    name: "Wait 08:49",
    sourceEndInSeconds: 549.62,
    sourceStartInSeconds: 529.97,
  },
  {
    kind: "face",
    name: "Face 09:09",
    sourceEndInSeconds: 583.03,
    sourceStartInSeconds: 549.62,
  },
  {
    kind: "wait",
    maximumPlaybackRate: annotatedWaitMaximumPlaybackRate,
    name: "Wait 09:43",
    sourceEndInSeconds: 597.79,
    sourceStartInSeconds: 583.03,
  },
  {
    kind: "face",
    name: "Face 09:57",
    sourceEndInSeconds: 626.63,
    sourceStartInSeconds: 597.79,
  },
  {
    kind: "wait",
    maximumPlaybackRate: annotatedWaitMaximumPlaybackRate,
    name: "Wait 10:26",
    sourceEndInSeconds: 645.52,
    sourceStartInSeconds: 626.63,
  },
  {
    kind: "face",
    name: "Face 10:45",
    sourceEndInSeconds: sourceDurationInFrames / onboardingDemoFps,
    sourceStartInSeconds: 645.52,
  },
] satisfies readonly RecordedDemoSourceSection[];

export const onboardingDemoEdit = createRecordedDemoEdit({
  fps: onboardingDemoFps,
  sourceDurationInFrames,
  sourceSections,
});

export const onboardingDemoEditDurationInFrames = onboardingDemoEdit.durationInFrames;
