import {
  createRecordedDemoEdit,
  type RecordedDemoSourceSection,
} from "../recorded-demo/recordedDemoEdit.ts";

export const scoutDemoFps = 30;
export const scoutDemoWidth = 1_920;
export const scoutDemoHeight = 1_080;

// Set the source duration and frame size from the recording before adding edit points.
const sourceDurationInFrames: number | null = null;

// Use original recording times. Keep speech at 1x and set waits to a 32x maximum.
// A specific long wait can use 64x after reviewing the footage.
const sourceSections: readonly RecordedDemoSourceSection[] = [];

export const scoutDemoEdit =
  // eslint-disable-next-line typescript/no-unnecessary-condition -- The editable null duration keeps this composition inactive until the source footage arrives.
  sourceDurationInFrames === null
    ? null
    : createRecordedDemoEdit({
        fps: scoutDemoFps,
        sourceDurationInFrames,
        sourceSections,
      });
