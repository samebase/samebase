import type { Caption } from "@remotion/captions";

import type { RecordedDemoEdit } from "./recordedDemoEdit";

export type RecordedDemoCaptionCue = {
  caption: Caption;
  editEndInFrames: number;
  editStartInFrames: number;
};

export function createRecordedDemoCaptionCues(
  captions: readonly Caption[],
  edit: RecordedDemoEdit,
): RecordedDemoCaptionCue[] {
  const cues: RecordedDemoCaptionCue[] = [];

  for (const segment of edit.segments) {
    if (segment.kind !== "face") {
      continue;
    }

    for (const caption of captions) {
      const captionStartInSourceFrames = (caption.startMs / 1_000) * edit.fps;
      const captionEndInSourceFrames = (caption.endMs / 1_000) * edit.fps;
      const visibleStartInSourceFrames = Math.max(
        captionStartInSourceFrames,
        segment.sourceStartInFrames,
      );
      const visibleEndInSourceFrames = Math.min(
        captionEndInSourceFrames,
        segment.sourceEndInFrames,
      );

      if (visibleEndInSourceFrames <= visibleStartInSourceFrames || caption.text.trim() === "") {
        continue;
      }

      const localStartInFrames = Math.floor(
        (visibleStartInSourceFrames - segment.sourceStartInFrames) / segment.playbackRate,
      );
      const localEndInFrames = Math.min(
        segment.durationInFrames,
        Math.ceil((visibleEndInSourceFrames - segment.sourceStartInFrames) / segment.playbackRate),
      );
      const editStartInFrames = segment.editStartInFrames + localStartInFrames;

      cues.push({
        caption,
        editEndInFrames: editStartInFrames + Math.max(1, localEndInFrames - localStartInFrames),
        editStartInFrames,
      });
    }
  }

  return cues.sort(
    (left, right) =>
      left.editStartInFrames - right.editStartInFrames ||
      left.editEndInFrames - right.editEndInFrames ||
      left.caption.startMs - right.caption.startMs ||
      left.caption.text.localeCompare(right.caption.text),
  );
}
