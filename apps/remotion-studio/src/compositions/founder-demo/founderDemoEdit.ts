export const founderDemoFps = 30;

const sourceDurationInFrames = 73_545;
const rampDurationInSeconds = 2;
const minimumShortWaitDurationInSeconds = 4;
const rampDurationInFrames = rampDurationInSeconds * founderDemoFps;
const minimumShortWaitDurationInFrames = minimumShortWaitDurationInSeconds * founderDemoFps;
export const founderDemoMaximumDirectPlaybackRate = 16;
export const founderDemoTimelapsePlaybackRate = 24;
const longWaitCruisePlaybackRate = 32;

type SourceSectionBase = {
  name: string;
  sourceEndInSeconds: number;
  sourceStartInSeconds: number;
};

type SourceSection =
  | (SourceSectionBase & {
      kind: "face";
    })
  | (SourceSectionBase & {
      kind: "wait";
      cruisePlaybackRate: number;
    });

type SegmentBase = {
  durationInFrames: number;
  editEndInFrames: number;
  editStartInFrames: number;
  name: string;
  sourceEndInFrames: number;
  sourceStartInFrames: number;
};

export type FounderDemoFaceSegment = SegmentBase & {
  kind: "face";
};

export type FounderDemoWaitSegment = SegmentBase & {
  kind: "wait";
  playbackRates: readonly number[];
  sourceFrames: readonly number[];
};

export type FounderDemoEditSegment = FounderDemoFaceSegment | FounderDemoWaitSegment;

const sourceSections = [
  {
    kind: "face",
    name: "Face 00:00",
    sourceEndInSeconds: 62.49,
    sourceStartInSeconds: 0,
  },
  {
    kind: "wait",
    cruisePlaybackRate: founderDemoTimelapsePlaybackRate,
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
    cruisePlaybackRate: founderDemoTimelapsePlaybackRate,
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
    cruisePlaybackRate: founderDemoTimelapsePlaybackRate,
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
    cruisePlaybackRate: founderDemoTimelapsePlaybackRate,
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
    cruisePlaybackRate: longWaitCruisePlaybackRate,
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
    cruisePlaybackRate: longWaitCruisePlaybackRate,
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
    cruisePlaybackRate: longWaitCruisePlaybackRate,
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
] satisfies readonly SourceSection[];

const toSourceFrame = (seconds: number) => Math.round(seconds * founderDemoFps);

const directRampPlaybackRates = Array.from({ length: rampDurationInFrames }, (_, index) => {
  const progress = index / (rampDurationInFrames - 1);
  const easedProgress = (1 - Math.cos(Math.PI * progress)) / 2;

  return 1 + (founderDemoMaximumDirectPlaybackRate - 1) * easedProgress;
});

const createWaitPlaybackRates = (sourceDuration: number, cruisePlaybackRate: number) => {
  const timelapseRampPlaybackRates =
    cruisePlaybackRate > founderDemoTimelapsePlaybackRate
      ? Array.from({ length: rampDurationInFrames }, (_, index) => {
          const progress = index / (rampDurationInFrames - 1);
          const easedProgress = (1 - Math.cos(Math.PI * progress)) / 2;

          return (
            founderDemoMaximumDirectPlaybackRate +
            (cruisePlaybackRate - founderDemoMaximumDirectPlaybackRate) * easedProgress
          );
        })
      : [];
  const baseRampPlaybackRates = [...directRampPlaybackRates, ...timelapseRampPlaybackRates];
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

  const minimumFullRampSourceDuration = 2 * baseRampSourceDuration + cruisePlaybackRate;

  if (sourceDuration < minimumFullRampSourceDuration) {
    let durationInFrames = minimumShortWaitDurationInFrames;
    let maximumPlaybackRate =
      1 + (sourceDuration - durationInFrames) / ((durationInFrames - 1) / 2);

    while (maximumPlaybackRate > founderDemoMaximumDirectPlaybackRate) {
      durationInFrames += 1;
      maximumPlaybackRate = 1 + (sourceDuration - durationInFrames) / ((durationInFrames - 1) / 2);
    }

    if (maximumPlaybackRate <= 1) {
      throw new Error("A founder demo wait section is too short for its minimum duration");
    }

    const curveWeights = Array.from(
      { length: durationInFrames },
      (_, index) => Math.sin((Math.PI * index) / (durationInFrames - 1)) ** 2,
    );
    const curveWeightTotal = curveWeights.reduce((total, weight) => total + weight, 0);
    const playbackRateRange = (sourceDuration - durationInFrames) / curveWeightTotal;

    return curveWeights.map((weight) => 1 + playbackRateRange * weight);
  }

  const cruiseDurationInFrames = Math.round(
    (sourceDuration - 2 * baseRampSourceDuration) / cruisePlaybackRate,
  );

  if (cruiseDurationInFrames < 1) {
    throw new Error("A founder demo wait section is too short for the speed ramp");
  }

  const targetRampSourceDuration =
    (sourceDuration - cruiseDurationInFrames * cruisePlaybackRate) / 2;
  const rampSourceAdjustment = targetRampSourceDuration - baseRampSourceDuration;
  const rampUpPlaybackRates = baseRampPlaybackRates.map(
    (playbackRate, index) =>
      playbackRate +
      (rampSourceAdjustment * (rampAdjustmentWeights[index] ?? 0)) / rampAdjustmentWeightTotal,
  );
  const maximumRampPlaybackRate =
    timelapseRampPlaybackRates.length > 0
      ? cruisePlaybackRate
      : founderDemoMaximumDirectPlaybackRate;

  for (let index = 0; index < rampUpPlaybackRates.length; index += 1) {
    const playbackRate = rampUpPlaybackRates[index];
    const previousPlaybackRate = rampUpPlaybackRates[index - 1];

    if (!playbackRate) {
      throw new Error("A founder demo speed ramp contains an empty frame");
    }

    if (playbackRate < 1 || playbackRate > maximumRampPlaybackRate) {
      throw new Error("A founder demo speed ramp exceeds its playback range");
    }

    if (previousPlaybackRate && playbackRate < previousPlaybackRate) {
      throw new Error("A founder demo speed ramp must increase continuously");
    }
  }

  const rampDownPlaybackRates = [...rampUpPlaybackRates].reverse();
  const cruisePlaybackRates = Array.from(
    { length: cruiseDurationInFrames },
    () => cruisePlaybackRate,
  );

  return [...rampUpPlaybackRates, ...cruisePlaybackRates, ...rampDownPlaybackRates];
};

export const founderDemoEditSegments: FounderDemoEditSegment[] = [];

for (const section of sourceSections) {
  const previousSegment = founderDemoEditSegments[founderDemoEditSegments.length - 1];
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
    const durationInFrames = sourceDuration;

    founderDemoEditSegments.push({
      kind: "face",
      durationInFrames,
      editEndInFrames: editStartInFrames + durationInFrames,
      editStartInFrames,
      name: `${section.name} · 1×`,
      sourceEndInFrames,
      sourceStartInFrames,
    });
    continue;
  }

  const playbackRates = createWaitPlaybackRates(sourceDuration, section.cruisePlaybackRate);
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
  const maximumPlaybackRate = Math.max(...playbackRates);
  founderDemoEditSegments.push({
    kind: "wait",
    durationInFrames,
    editEndInFrames: editStartInFrames + durationInFrames,
    editStartInFrames,
    name:
      maximumPlaybackRate === section.cruisePlaybackRate
        ? section.cruisePlaybackRate > founderDemoTimelapsePlaybackRate
          ? `${section.name} · 4s to 32× · 32× · 4s to 1×`
          : `${section.name} · 2s to 16× · 24× · 2s to 1×`
        : `${section.name} · 4s curve · ${maximumPlaybackRate.toFixed(1)}× peak`,
    playbackRates,
    sourceEndInFrames,
    sourceFrames,
    sourceStartInFrames,
  });
}

const lastEditSegment = founderDemoEditSegments[founderDemoEditSegments.length - 1];

if (!lastEditSegment) {
  throw new Error("The founder demo edit must contain at least one segment");
}

export const founderDemoEditDurationInFrames = lastEditSegment.editEndInFrames;

export const getFounderDemoEditSegment = (editFrame: number) => {
  const clampedFrame = Math.min(
    Math.max(Math.floor(editFrame), 0),
    founderDemoEditDurationInFrames - 1,
  );
  const segment = founderDemoEditSegments.find(
    ({ editEndInFrames, editStartInFrames }) =>
      clampedFrame >= editStartInFrames && clampedFrame < editEndInFrames,
  );

  if (!segment) {
    throw new Error(`No edit segment contains frame ${clampedFrame}`);
  }

  return segment;
};

export const getFounderDemoSegmentPlaybackRate = (
  segment: FounderDemoEditSegment,
  localFrame: number,
) => {
  if (segment.kind === "face") {
    return 1;
  }

  const clampedFrame = Math.min(Math.max(Math.floor(localFrame), 0), segment.durationInFrames - 1);
  const playbackRate = segment.playbackRates[clampedFrame];

  if (!playbackRate) {
    throw new Error(`${segment.name} has no playback rate at frame ${clampedFrame}`);
  }

  return playbackRate;
};

export const getFounderDemoSegmentSourceFrame = (
  segment: FounderDemoEditSegment,
  localFrame: number,
) => {
  const clampedFrame = Math.min(Math.max(Math.floor(localFrame), 0), segment.durationInFrames - 1);

  if (segment.kind === "face") {
    return segment.sourceStartInFrames + clampedFrame;
  }

  const sourceFrame = segment.sourceFrames[clampedFrame];

  if (sourceFrame === undefined) {
    throw new Error(`${segment.name} has no source frame at edit frame ${clampedFrame}`);
  }

  return sourceFrame;
};

export const getFounderDemoPlaybackRate = (editFrame: number) => {
  const segment = getFounderDemoEditSegment(editFrame);
  const localFrame = Math.floor(editFrame) - segment.editStartInFrames;

  return getFounderDemoSegmentPlaybackRate(segment, localFrame);
};

export const getFounderDemoSourceFrame = (editFrame: number) => {
  const segment = getFounderDemoEditSegment(editFrame);
  const localFrame = Math.floor(editFrame) - segment.editStartInFrames;

  return getFounderDemoSegmentSourceFrame(segment, localFrame);
};
