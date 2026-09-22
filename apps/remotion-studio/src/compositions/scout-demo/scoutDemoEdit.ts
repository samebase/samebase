import {
  createRecordedDemoEdit,
  type RecordedDemoSourceSection,
} from "../recorded-demo/recordedDemoEdit.ts";

export const scoutDemoFps = 30;
export const scoutDemoWidth = 3_840;
export const scoutDemoHeight = 2_480;

const sourceDurationInFrames = 27_357;

// Boundaries use the original recording. Each ramp lasts this long in the edited video.
export const scoutDemoFastForward = {
  startInSeconds: 1 * 60 + 58,
  endInSeconds: 14 * 60 + 35,
  maximumPlaybackRate: 32,
  rampDurationInSeconds: 2,
};

const sourceSections: readonly RecordedDemoSourceSection[] = [
  {
    kind: "face",
    name: "Introduction and task",
    sourceStartInSeconds: 0,
    sourceEndInSeconds: scoutDemoFastForward.startInSeconds,
  },
  {
    kind: "wait",
    name: "Scout at work",
    sourceStartInSeconds: scoutDemoFastForward.startInSeconds,
    sourceEndInSeconds: scoutDemoFastForward.endInSeconds,
    maximumPlaybackRate: scoutDemoFastForward.maximumPlaybackRate,
    rampDurationInSeconds: scoutDemoFastForward.rampDurationInSeconds,
  },
  {
    kind: "face",
    name: "Review and conclusion",
    sourceStartInSeconds: scoutDemoFastForward.endInSeconds,
    sourceEndInSeconds: sourceDurationInFrames / scoutDemoFps,
  },
];

export const scoutDemoEdit = createRecordedDemoEdit({
  fps: scoutDemoFps,
  sourceDurationInFrames,
  sourceSections,
});
