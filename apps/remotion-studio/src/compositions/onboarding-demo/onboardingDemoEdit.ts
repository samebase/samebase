import {
  createRecordedDemoEdit,
  type RecordedDemoSourceSection,
} from "../recorded-demo/recordedDemoEdit";

export const onboardingDemoFps = 30;

const sourceDurationInFrames = 22_755;
const standardWaitMaximumPlaybackRate = 24;

const sourceSections = [
  {
    kind: "face",
    name: "Face 00:00",
    sourceEndInSeconds: 405.184,
    sourceStartInSeconds: 0,
  },
  {
    kind: "wait",
    maximumPlaybackRate: standardWaitMaximumPlaybackRate,
    name: "Wait 06:45",
    sourceEndInSeconds: 436.133,
    sourceStartInSeconds: 405.184,
  },
  {
    kind: "face",
    name: "Face 07:16",
    sourceEndInSeconds: 570.296,
    sourceStartInSeconds: 436.133,
  },
  {
    kind: "wait",
    maximumPlaybackRate: standardWaitMaximumPlaybackRate,
    name: "Wait 09:30",
    sourceEndInSeconds: 601.096,
    sourceStartInSeconds: 570.296,
  },
  {
    kind: "face",
    name: "Face 10:01",
    sourceEndInSeconds: 603.233,
    sourceStartInSeconds: 601.096,
  },
  {
    kind: "wait",
    maximumPlaybackRate: standardWaitMaximumPlaybackRate,
    name: "Wait 10:03",
    sourceEndInSeconds: 631.067,
    sourceStartInSeconds: 603.233,
  },
  {
    kind: "face",
    name: "Face 10:31",
    sourceEndInSeconds: 658.12,
    sourceStartInSeconds: 631.067,
  },
  {
    kind: "wait",
    maximumPlaybackRate: standardWaitMaximumPlaybackRate,
    name: "Wait 10:58",
    sourceEndInSeconds: 678.9,
    sourceStartInSeconds: 658.12,
  },
  {
    kind: "face",
    name: "Face 11:18",
    sourceEndInSeconds: 706,
    sourceStartInSeconds: 678.9,
  },
  {
    kind: "wait",
    maximumPlaybackRate: standardWaitMaximumPlaybackRate,
    name: "Wait 11:46",
    sourceEndInSeconds: 726.167,
    sourceStartInSeconds: 706,
  },
  {
    kind: "face",
    name: "Face 12:06",
    sourceEndInSeconds: sourceDurationInFrames / onboardingDemoFps,
    sourceStartInSeconds: 726.167,
  },
] satisfies readonly RecordedDemoSourceSection[];

export const onboardingDemoEdit = createRecordedDemoEdit({
  fps: onboardingDemoFps,
  sourceDurationInFrames,
  sourceSections,
});

export const onboardingDemoEditDurationInFrames = onboardingDemoEdit.durationInFrames;
