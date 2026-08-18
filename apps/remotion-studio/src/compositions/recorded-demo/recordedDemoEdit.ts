const rampDurationInSeconds = 4;
const minimumShortWaitDurationInSeconds = 4;

type RecordedDemoSourceSectionBase = {
  name: string;
  sourceEndInSeconds: number;
  sourceStartInSeconds: number;
};

export type RecordedDemoSourceSection =
  | (RecordedDemoSourceSectionBase & {
      kind: "face";
      playbackRate?: number;
    })
  | (RecordedDemoSourceSectionBase & {
      kind: "wait";
      maximumPlaybackRate: number;
    })
  | (RecordedDemoSourceSectionBase & {
      endingPlaybackRate: number;
      kind: "slowdown";
    });

type RecordedDemoSegmentBase = {
  durationInFrames: number;
  editEndInFrames: number;
  editStartInFrames: number;
  name: string;
  sourceEndInFrames: number;
  sourceStartInFrames: number;
};

export type RecordedDemoFaceSegment = RecordedDemoSegmentBase & {
  kind: "face";
  playbackRate: number;
};

export type RecordedDemoWaitSegment = RecordedDemoSegmentBase & {
  kind: "wait";
  playbackRates: readonly number[];
  sourceFrames: readonly number[];
};

export type RecordedDemoSlowdownSegment = RecordedDemoSegmentBase & {
  kind: "slowdown";
  playbackRates: readonly number[];
  sourceFrames: readonly number[];
};

export type RecordedDemoVariableSegment = RecordedDemoSlowdownSegment | RecordedDemoWaitSegment;

export type RecordedDemoEditSegment = RecordedDemoFaceSegment | RecordedDemoVariableSegment;

export type RecordedDemoEdit = {
  durationInFrames: number;
  fps: number;
  segments: readonly RecordedDemoEditSegment[];
};

export const createWaitPlaybackRates = ({
  fps,
  maximumPlaybackRate,
  sourceDurationInFrames,
}: {
  fps: number;
  maximumPlaybackRate: number;
  sourceDurationInFrames: number;
}) => {
  if (maximumPlaybackRate <= 1) {
    throw new Error("A recorded demo wait maximum playback rate must be greater than 1");
  }

  const rampDurationInFrames = rampDurationInSeconds * fps;
  const minimumShortWaitDurationInFrames = minimumShortWaitDurationInSeconds * fps;
  const baseRampPlaybackRates = Array.from({ length: rampDurationInFrames }, (_, index) => {
    const progress = index / (rampDurationInFrames - 1);
    const easedProgress = (1 - Math.cos(Math.PI * progress)) / 2;

    return 1 + (maximumPlaybackRate - 1) * easedProgress;
  });
  const baseRampSourceDuration = baseRampPlaybackRates.reduce(
    (duration, playbackRate) => duration + playbackRate,
    0,
  );
  const rampAdjustmentWeights = baseRampPlaybackRates.map((_, index) => {
    if (index === 0 || index === baseRampPlaybackRates.length - 1) {
      return 0;
    }

    return Math.sin((Math.PI * index) / (baseRampPlaybackRates.length - 1));
  });
  const rampAdjustmentWeightTotal = rampAdjustmentWeights.reduce(
    (total, weight) => total + weight,
    0,
  );
  const minimumFullRampSourceDuration = 2 * baseRampSourceDuration + maximumPlaybackRate;

  if (sourceDurationInFrames < minimumFullRampSourceDuration) {
    let durationInFrames = minimumShortWaitDurationInFrames;
    let peakPlaybackRate =
      1 + (sourceDurationInFrames - durationInFrames) / ((durationInFrames - 1) / 2);

    while (peakPlaybackRate > maximumPlaybackRate) {
      durationInFrames += 1;
      peakPlaybackRate =
        1 + (sourceDurationInFrames - durationInFrames) / ((durationInFrames - 1) / 2);
    }

    if (peakPlaybackRate <= 1) {
      throw new Error("A recorded demo wait section is too short for its minimum duration");
    }

    const curveWeights = Array.from(
      { length: durationInFrames },
      (_, index) => Math.sin((Math.PI * index) / (durationInFrames - 1)) ** 2,
    );
    const curveWeightTotal = curveWeights.reduce((total, weight) => total + weight, 0);
    const playbackRateRange = (sourceDurationInFrames - durationInFrames) / curveWeightTotal;

    return curveWeights.map((weight) => 1 + playbackRateRange * weight);
  }

  const cruiseDurationInFrames = Math.round(
    (sourceDurationInFrames - 2 * baseRampSourceDuration) / maximumPlaybackRate,
  );

  if (cruiseDurationInFrames < 1) {
    throw new Error("A recorded demo wait section is too short for the speed ramp");
  }

  const targetRampSourceDuration =
    (sourceDurationInFrames - cruiseDurationInFrames * maximumPlaybackRate) / 2;
  const rampSourceAdjustment = targetRampSourceDuration - baseRampSourceDuration;
  const rampUpPlaybackRates = baseRampPlaybackRates.map(
    (playbackRate, index) =>
      playbackRate +
      (rampSourceAdjustment * (rampAdjustmentWeights[index] ?? 0)) / rampAdjustmentWeightTotal,
  );

  for (let index = 0; index < rampUpPlaybackRates.length; index += 1) {
    const playbackRate = rampUpPlaybackRates[index];
    const previousPlaybackRate = rampUpPlaybackRates[index - 1];

    if (!playbackRate) {
      throw new Error("A recorded demo speed ramp contains an empty frame");
    }

    if (playbackRate < 1 || playbackRate > maximumPlaybackRate) {
      throw new Error("A recorded demo speed ramp exceeds its playback range");
    }

    if (previousPlaybackRate && playbackRate < previousPlaybackRate) {
      throw new Error("A recorded demo speed ramp must increase continuously");
    }
  }

  const rampDownPlaybackRates = [...rampUpPlaybackRates].reverse();
  const cruisePlaybackRates = Array.from(
    { length: cruiseDurationInFrames },
    () => maximumPlaybackRate,
  );

  return [...rampUpPlaybackRates, ...cruisePlaybackRates, ...rampDownPlaybackRates];
};

const createSlowdownPlaybackRates = ({
  endingPlaybackRate,
  sourceDurationInFrames,
}: {
  endingPlaybackRate: number;
  sourceDurationInFrames: number;
}) => {
  if (endingPlaybackRate <= 0 || endingPlaybackRate >= 1) {
    throw new Error("A recorded demo slowdown ending rate must be between 0 and 1");
  }

  const averagePlaybackRate = (1 + endingPlaybackRate) / 2;
  const durationInFrames = Math.round(sourceDurationInFrames / averagePlaybackRate);
  const basePlaybackRates = Array.from({ length: durationInFrames }, (_, index) => {
    const progress = index / (durationInFrames - 1);
    const easedProgress = (1 - Math.cos(Math.PI * progress)) / 2;

    return 1 + (endingPlaybackRate - 1) * easedProgress;
  });
  const sourceDurationAdjustment =
    sourceDurationInFrames -
    basePlaybackRates.reduce((duration, playbackRate) => duration + playbackRate, 0);
  const adjustmentWeights = basePlaybackRates.map((_, index) =>
    Math.sin((Math.PI * index) / (basePlaybackRates.length - 1)),
  );
  const adjustmentWeightTotal = adjustmentWeights.reduce((total, weight) => total + weight, 0);
  const playbackRates = basePlaybackRates.map(
    (playbackRate, index) =>
      playbackRate +
      (sourceDurationAdjustment * (adjustmentWeights[index] ?? 0)) / adjustmentWeightTotal,
  );

  for (let index = 0; index < playbackRates.length; index += 1) {
    const playbackRate = playbackRates[index];
    const previousPlaybackRate = playbackRates[index - 1];

    if (!playbackRate || playbackRate < endingPlaybackRate || playbackRate > 1) {
      throw new Error("A recorded demo slowdown exceeds its playback range");
    }

    if (previousPlaybackRate && playbackRate > previousPlaybackRate) {
      throw new Error("A recorded demo slowdown must decrease continuously");
    }
  }

  return playbackRates;
};

export const createRecordedDemoEdit = ({
  fps,
  sourceDurationInFrames,
  sourceSections,
}: {
  fps: number;
  sourceDurationInFrames: number;
  sourceSections: readonly RecordedDemoSourceSection[];
}): RecordedDemoEdit => {
  const segments: RecordedDemoEditSegment[] = [];
  const toSourceFrame = (seconds: number) => Math.round(seconds * fps);

  for (const section of sourceSections) {
    const previousSegment = segments[segments.length - 1];
    const sourceStartInFrames = toSourceFrame(section.sourceStartInSeconds);
    const sourceEndInFrames = toSourceFrame(section.sourceEndInSeconds);
    const sourceDuration = sourceEndInFrames - sourceStartInFrames;
    const editStartInFrames = previousSegment?.editEndInFrames ?? 0;

    if (sourceDuration <= 0) {
      throw new Error(`${section.name} must have a positive source duration`);
    }

    if (previousSegment && sourceStartInFrames !== previousSegment.sourceEndInFrames) {
      throw new Error(`${section.name} must start where the previous source segment ends`);
    }

    if (sourceEndInFrames > sourceDurationInFrames) {
      throw new Error(`${section.name} extends beyond the source recording`);
    }

    if (section.kind === "face") {
      const playbackRate = section.playbackRate ?? 1;

      if (!Number.isFinite(playbackRate) || playbackRate <= 0) {
        throw new Error(`${section.name} playback rate must be greater than 0`);
      }

      const durationInFrames = Math.round(sourceDuration / playbackRate);

      if (Math.abs(durationInFrames * playbackRate - sourceDuration) > 0.000_001) {
        throw new Error(`${section.name} playback rate must cover its full source range`);
      }

      segments.push({
        kind: "face",
        durationInFrames,
        editEndInFrames: editStartInFrames + durationInFrames,
        editStartInFrames,
        name: `${section.name} · ${playbackRate}×`,
        playbackRate,
        sourceEndInFrames,
        sourceStartInFrames,
      });
      continue;
    }

    const playbackRates =
      section.kind === "wait"
        ? createWaitPlaybackRates({
            fps,
            maximumPlaybackRate: section.maximumPlaybackRate,
            sourceDurationInFrames: sourceDuration,
          })
        : createSlowdownPlaybackRates({
            endingPlaybackRate: section.endingPlaybackRate,
            sourceDurationInFrames: sourceDuration,
          });
    let sourceFrame = sourceStartInFrames;
    const sourceFrames = playbackRates.map((playbackRate) => {
      const currentSourceFrame = sourceFrame;
      sourceFrame += playbackRate;

      return currentSourceFrame;
    });

    if (Math.abs(sourceFrame - sourceEndInFrames) > 0.000_001) {
      throw new Error(`${section.name} speed ramp must cover its full source range`);
    }

    const durationInFrames = playbackRates.length;
    const playbackRateLabel =
      section.kind === "wait"
        ? `${Math.max(...playbackRates).toFixed(1)}× peak`
        : `${section.endingPlaybackRate.toFixed(1)}× ending`;
    segments.push({
      kind: section.kind,
      durationInFrames,
      editEndInFrames: editStartInFrames + durationInFrames,
      editStartInFrames,
      name: `${section.name} · ${playbackRateLabel}`,
      playbackRates,
      sourceEndInFrames,
      sourceFrames,
      sourceStartInFrames,
    });
  }

  const lastSegment = segments[segments.length - 1];

  if (!lastSegment) {
    throw new Error("A recorded demo edit must contain at least one segment");
  }

  if (lastSegment.sourceEndInFrames !== sourceDurationInFrames) {
    throw new Error("A recorded demo edit must cover the full source recording");
  }

  return {
    durationInFrames: lastSegment.editEndInFrames,
    fps,
    segments,
  };
};

export const getRecordedDemoEditSegment = (edit: RecordedDemoEdit, editFrame: number) => {
  const clampedFrame = Math.min(Math.max(Math.floor(editFrame), 0), edit.durationInFrames - 1);
  const segment = edit.segments.find(
    ({ editEndInFrames, editStartInFrames }) =>
      clampedFrame >= editStartInFrames && clampedFrame < editEndInFrames,
  );

  if (!segment) {
    throw new Error(`No recorded demo edit segment contains frame ${clampedFrame}`);
  }

  return segment;
};

export const getRecordedDemoSegmentPlaybackRate = (
  segment: RecordedDemoEditSegment,
  localFrame: number,
) => {
  if (segment.kind === "face") {
    return segment.playbackRate;
  }

  const clampedFrame = Math.min(Math.max(Math.floor(localFrame), 0), segment.durationInFrames - 1);
  const playbackRate = segment.playbackRates[clampedFrame];

  if (!playbackRate) {
    throw new Error(`${segment.name} has no playback rate at frame ${clampedFrame}`);
  }

  return playbackRate;
};

export const getRecordedDemoSegmentSourceFrame = (
  segment: RecordedDemoEditSegment,
  localFrame: number,
) => {
  const clampedFrame = Math.min(Math.max(Math.floor(localFrame), 0), segment.durationInFrames - 1);

  if (segment.kind === "face") {
    return segment.sourceStartInFrames + clampedFrame * segment.playbackRate;
  }

  const sourceFrame = segment.sourceFrames[clampedFrame];

  if (sourceFrame === undefined) {
    throw new Error(`${segment.name} has no source frame at edit frame ${clampedFrame}`);
  }

  return sourceFrame;
};

export const getRecordedDemoPlaybackRate = (edit: RecordedDemoEdit, editFrame: number) => {
  const segment = getRecordedDemoEditSegment(edit, editFrame);
  const localFrame = Math.floor(editFrame) - segment.editStartInFrames;

  return getRecordedDemoSegmentPlaybackRate(segment, localFrame);
};

export const getRecordedDemoSourceFrame = (edit: RecordedDemoEdit, editFrame: number) => {
  const segment = getRecordedDemoEditSegment(edit, editFrame);
  const localFrame = Math.floor(editFrame) - segment.editStartInFrames;

  return getRecordedDemoSegmentSourceFrame(segment, localFrame);
};
