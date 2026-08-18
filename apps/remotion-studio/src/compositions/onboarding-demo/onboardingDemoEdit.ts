import {
  createRecordedDemoEdit,
  type RecordedDemoSourceSection,
} from "../recorded-demo/recordedDemoEdit";

export const onboardingDemoFps = 30;

const sourceDurationInFrames = 20_337;
const standardWaitMaximumPlaybackRate = 24;

const sourceSections = [
  {
    kind: "face",
    name: "Face 00:00",
    sourceEndInSeconds: 324.588,
    sourceStartInSeconds: 0,
  },
  {
    kind: "wait",
    maximumPlaybackRate: standardWaitMaximumPlaybackRate,
    name: "Wait 05:24",
    sourceEndInSeconds: 355.557,
    sourceStartInSeconds: 324.588,
  },
  {
    kind: "face",
    name: "Face 05:55",
    sourceEndInSeconds: 489.699,
    sourceStartInSeconds: 355.557,
  },
  {
    kind: "wait",
    maximumPlaybackRate: standardWaitMaximumPlaybackRate,
    name: "Wait 08:09",
    sourceEndInSeconds: 520.499,
    sourceStartInSeconds: 489.699,
  },
  {
    kind: "face",
    name: "Face 08:40",
    sourceEndInSeconds: 522.637,
    sourceStartInSeconds: 520.499,
  },
  {
    kind: "wait",
    maximumPlaybackRate: standardWaitMaximumPlaybackRate,
    name: "Wait 08:42",
    sourceEndInSeconds: 550.471,
    sourceStartInSeconds: 522.637,
  },
  {
    kind: "face",
    name: "Face 09:10",
    sourceEndInSeconds: 577.524,
    sourceStartInSeconds: 550.471,
  },
  {
    kind: "wait",
    maximumPlaybackRate: standardWaitMaximumPlaybackRate,
    name: "Wait 09:37",
    sourceEndInSeconds: 598.304,
    sourceStartInSeconds: 577.524,
  },
  {
    kind: "face",
    name: "Face 09:58",
    sourceEndInSeconds: 625.4,
    sourceStartInSeconds: 598.304,
  },
  {
    kind: "wait",
    maximumPlaybackRate: standardWaitMaximumPlaybackRate,
    name: "Wait 10:25",
    sourceEndInSeconds: 645.594,
    sourceStartInSeconds: 625.4,
  },
  {
    kind: "face",
    name: "Face 10:45",
    sourceEndInSeconds: sourceDurationInFrames / onboardingDemoFps,
    sourceStartInSeconds: 645.594,
  },
] satisfies readonly RecordedDemoSourceSection[];

export const onboardingDemoEdit = createRecordedDemoEdit({
  fps: onboardingDemoFps,
  sourceDurationInFrames,
  sourceSections,
});

export const onboardingDemoEditDurationInFrames = onboardingDemoEdit.durationInFrames;
