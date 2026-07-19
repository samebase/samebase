export const ticTacToeRecordingFps = 60;
const sourceDurationInFrames = 87559;

type Chapter = "BUILD" | "SHIP" | "PLAY";
type PlaybackRate = 1 | 3 | 6 | 10 | 12;

type SourceSegment = {
  chapter?: Chapter;
  name: string;
  playbackRate: PlaybackRate;
  sourceEndInSeconds: number;
  sourceStartInSeconds: number;
};

export type TicTacToeEditSegment = SourceSegment & {
  durationInFrames: number;
  editEndInFrames: number;
  editStartInFrames: number;
  sourceEndInFrames: number;
  sourceStartInFrames: number;
};

const sourceSegments = [
  {
    name: "Opening prompt · 3×",
    playbackRate: 3,
    sourceEndInSeconds: 52,
    sourceStartInSeconds: 0,
  },
  {
    name: "Read opening prompt · 1×",
    playbackRate: 1,
    sourceEndInSeconds: 54,
    sourceStartInSeconds: 52,
  },
  {
    chapter: "BUILD",
    name: "Agent work 00:54 · 6×",
    playbackRate: 6,
    sourceEndInSeconds: 110,
    sourceStartInSeconds: 54,
  },
  {
    name: "Typing 02:57 · 3×",
    playbackRate: 3,
    sourceEndInSeconds: 180,
    sourceStartInSeconds: 177,
  },
  {
    name: "Read prompt 03:00 · 1×",
    playbackRate: 1,
    sourceEndInSeconds: 182,
    sourceStartInSeconds: 180,
  },
  {
    name: "Agent work 03:02 · 6×",
    playbackRate: 6,
    sourceEndInSeconds: 217,
    sourceStartInSeconds: 182,
  },
  {
    name: "Typing 05:45 · 3×",
    playbackRate: 3,
    sourceEndInSeconds: 376,
    sourceStartInSeconds: 345,
  },
  {
    name: "Read prompt 06:16 · 1×",
    playbackRate: 1,
    sourceEndInSeconds: 378,
    sourceStartInSeconds: 376,
  },
  {
    name: "Agent work 06:18 · 6×",
    playbackRate: 6,
    sourceEndInSeconds: 386,
    sourceStartInSeconds: 378,
  },
  {
    name: "Typing 06:26 · 3×",
    playbackRate: 3,
    sourceEndInSeconds: 406,
    sourceStartInSeconds: 386,
  },
  {
    name: "Read prompt 06:46 · 1×",
    playbackRate: 1,
    sourceEndInSeconds: 408,
    sourceStartInSeconds: 406,
  },
  {
    name: "Agent work 06:48 · 6×",
    playbackRate: 6,
    sourceEndInSeconds: 529,
    sourceStartInSeconds: 408,
  },
  {
    name: "Typing 08:49 · 3×",
    playbackRate: 3,
    sourceEndInSeconds: 538,
    sourceStartInSeconds: 529,
  },
  {
    name: "Read prompt 08:58 · 1×",
    playbackRate: 1,
    sourceEndInSeconds: 540,
    sourceStartInSeconds: 538,
  },
  {
    name: "Agent work 09:00 · 6×",
    playbackRate: 6,
    sourceEndInSeconds: 578,
    sourceStartInSeconds: 572,
  },
  {
    name: "Typing 09:38 · 3×",
    playbackRate: 3,
    sourceEndInSeconds: 586,
    sourceStartInSeconds: 578,
  },
  {
    name: "Read prompt 09:46 · 1×",
    playbackRate: 1,
    sourceEndInSeconds: 588,
    sourceStartInSeconds: 586,
  },
  {
    name: "Agent work 09:48 · 10×",
    playbackRate: 10,
    sourceEndInSeconds: 673,
    sourceStartInSeconds: 588,
  },
  {
    name: "Visible interaction 11:13 · 6×",
    playbackRate: 6,
    sourceEndInSeconds: 724,
    sourceStartInSeconds: 673,
  },
  {
    name: "Agent work 13:43 · 6×",
    playbackRate: 6,
    sourceEndInSeconds: 829,
    sourceStartInSeconds: 823,
  },
  {
    name: "Typing 13:49 · 3×",
    playbackRate: 3,
    sourceEndInSeconds: 834,
    sourceStartInSeconds: 829,
  },
  {
    name: "Read prompt 13:54 · 1×",
    playbackRate: 1,
    sourceEndInSeconds: 836,
    sourceStartInSeconds: 834,
  },
  {
    name: "Agent work 13:56 · 6×",
    playbackRate: 6,
    sourceEndInSeconds: 923,
    sourceStartInSeconds: 836,
  },
  {
    name: "Typing 15:23 · 3×",
    playbackRate: 3,
    sourceEndInSeconds: 925,
    sourceStartInSeconds: 923,
  },
  {
    name: "Read prompt 15:25 · 1×",
    playbackRate: 1,
    sourceEndInSeconds: 927,
    sourceStartInSeconds: 925,
  },
  {
    name: "Agent work 15:27 · 6×",
    playbackRate: 6,
    sourceEndInSeconds: 951,
    sourceStartInSeconds: 927,
  },
  {
    name: "Typing 15:51 · 3×",
    playbackRate: 3,
    sourceEndInSeconds: 956,
    sourceStartInSeconds: 951,
  },
  {
    name: "Read prompt 15:56 · 1×",
    playbackRate: 1,
    sourceEndInSeconds: 958,
    sourceStartInSeconds: 956,
  },
  {
    chapter: "SHIP",
    name: "Ship work 15:58 · 6×",
    playbackRate: 6,
    sourceEndInSeconds: 989,
    sourceStartInSeconds: 958,
  },
  {
    name: "Deploy wait 17:31 · 10×",
    playbackRate: 10,
    sourceEndInSeconds: 1063,
    sourceStartInSeconds: 1051,
  },
  {
    name: "Visible deploy 17:43 · 6×",
    playbackRate: 6,
    sourceEndInSeconds: 1086,
    sourceStartInSeconds: 1063,
  },
  {
    name: "Production setup 18:38 · 6×",
    playbackRate: 6,
    sourceEndInSeconds: 1138,
    sourceStartInSeconds: 1118,
  },
  {
    chapter: "PLAY",
    name: "Production reveal 18:58 · 1×",
    playbackRate: 1,
    sourceEndInSeconds: 1142,
    sourceStartInSeconds: 1138,
  },
  {
    name: "Typing 19:02 · 3×",
    playbackRate: 3,
    sourceEndInSeconds: 1146,
    sourceStartInSeconds: 1142,
  },
  {
    name: "Read prompt 19:06 · 1×",
    playbackRate: 1,
    sourceEndInSeconds: 1148,
    sourceStartInSeconds: 1146,
  },
  {
    name: "Active wait 19:08 · 6×",
    playbackRate: 6,
    sourceEndInSeconds: 1149,
    sourceStartInSeconds: 1148,
  },
  {
    name: "Active wait 19:16 · 6×",
    playbackRate: 6,
    sourceEndInSeconds: 1187,
    sourceStartInSeconds: 1156.5,
  },
  {
    name: "First turn 20:11 · 1×",
    playbackRate: 1,
    sourceEndInSeconds: 1218,
    sourceStartInSeconds: 1211.5,
  },
  {
    name: "Active wait 20:18 · 6×",
    playbackRate: 6,
    sourceEndInSeconds: 1250.5,
    sourceStartInSeconds: 1218,
  },
  {
    name: "Codex response 21:13 · 1×",
    playbackRate: 1,
    sourceEndInSeconds: 1280,
    sourceStartInSeconds: 1273.5,
  },
  {
    name: "Rotating board 21:20 · 6×",
    playbackRate: 6,
    sourceEndInSeconds: 1295,
    sourceStartInSeconds: 1280,
  },
  {
    name: "Second turn 21:35 · 1×",
    playbackRate: 1,
    sourceEndInSeconds: 1304,
    sourceStartInSeconds: 1295,
  },
  {
    name: "Typing 21:44 · 3×",
    playbackRate: 3,
    sourceEndInSeconds: 1309,
    sourceStartInSeconds: 1304,
  },
  {
    name: "Read prompt 21:49 · 1×",
    playbackRate: 1,
    sourceEndInSeconds: 1311,
    sourceStartInSeconds: 1309,
  },
  {
    name: "Active wait 21:51 · 6×",
    playbackRate: 6,
    sourceEndInSeconds: 1312,
    sourceStartInSeconds: 1311,
  },
  {
    name: "Active wait 22:00 · 6×",
    playbackRate: 6,
    sourceEndInSeconds: 1323,
    sourceStartInSeconds: 1320.5,
  },
  {
    name: "Gameplay 22:17 · 1×",
    playbackRate: 1,
    sourceEndInSeconds: 1380.5,
    sourceStartInSeconds: 1337,
  },
  {
    name: "Gameplay 23:08 · 1×",
    playbackRate: 1,
    sourceEndInSeconds: 1393,
    sourceStartInSeconds: 1388.5,
  },
  {
    name: "Winning sequence 23:17 · 1×",
    playbackRate: 1,
    sourceEndInSeconds: 1424,
    sourceStartInSeconds: 1397.5,
  },
  {
    name: "Typing reaction 23:44 · 3×",
    playbackRate: 3,
    sourceEndInSeconds: 1428,
    sourceStartInSeconds: 1424,
  },
  {
    name: "Read reaction 23:48 · 1×",
    playbackRate: 1,
    sourceEndInSeconds: 1430,
    sourceStartInSeconds: 1428,
  },
  {
    name: "Read Codex response 23:57 · 1×",
    playbackRate: 1,
    sourceEndInSeconds: 1446,
    sourceStartInSeconds: 1437,
  },
  {
    name: "Typing final message 24:06 · 3×",
    playbackRate: 3,
    sourceEndInSeconds: 1449,
    sourceStartInSeconds: 1446,
  },
  {
    name: "Read final message 24:09 · 1×",
    playbackRate: 1,
    sourceEndInSeconds: 1451,
    sourceStartInSeconds: 1449,
  },
  {
    name: "Final Codex response 24:15 · 1×",
    playbackRate: 1,
    sourceEndInSeconds: sourceDurationInFrames / ticTacToeRecordingFps,
    sourceStartInSeconds: 1455,
  },
] satisfies readonly SourceSegment[];

const toSourceFrame = (seconds: number) => {
  const frame = seconds * ticTacToeRecordingFps;
  const roundedFrame = Math.round(frame);

  if (Math.abs(frame - roundedFrame) > 0.000001) {
    throw new Error(`Source time ${seconds} does not land on a frame`);
  }

  return roundedFrame;
};

export const ticTacToeEditSegments = sourceSegments.reduce<TicTacToeEditSegment[]>(
  (segments, segment) => {
    const sourceStartInFrames = toSourceFrame(segment.sourceStartInSeconds);
    const sourceEndInFrames = toSourceFrame(segment.sourceEndInSeconds);
    const previousSegment = segments[segments.length - 1];

    if (sourceStartInFrames >= sourceEndInFrames) {
      throw new Error(`${segment.name} must have a positive source duration`);
    }

    if (previousSegment && sourceStartInFrames < previousSegment.sourceEndInFrames) {
      throw new Error(`${segment.name} overlaps the previous source segment`);
    }

    if (sourceEndInFrames > sourceDurationInFrames) {
      throw new Error(`${segment.name} extends beyond the source recording`);
    }

    const durationInFrames = Math.ceil(
      (sourceEndInFrames - sourceStartInFrames) / segment.playbackRate,
    );
    const editStartInFrames = previousSegment?.editEndInFrames ?? 0;
    const editEndInFrames = editStartInFrames + durationInFrames;

    return [
      ...segments,
      {
        ...segment,
        durationInFrames,
        editEndInFrames,
        editStartInFrames,
        sourceEndInFrames,
        sourceStartInFrames,
      },
    ];
  },
  [],
);

const lastEditSegment = ticTacToeEditSegments[ticTacToeEditSegments.length - 1];

if (!lastEditSegment) {
  throw new Error("The tic-tac-toe edit must contain at least one segment");
}

export const ticTacToeEditDurationInFrames = lastEditSegment.editEndInFrames;

export const getTicTacToeEditSegment = (editFrame: number) => {
  const clampedFrame = Math.min(
    Math.max(Math.floor(editFrame), 0),
    ticTacToeEditDurationInFrames - 1,
  );
  const segment = ticTacToeEditSegments.find(
    ({ editEndInFrames, editStartInFrames }) =>
      clampedFrame >= editStartInFrames && clampedFrame < editEndInFrames,
  );

  if (!segment) {
    throw new Error(`No edit segment contains frame ${clampedFrame}`);
  }

  return segment;
};

export const getTicTacToeSourceFrame = (editFrame: number) => {
  const segment = getTicTacToeEditSegment(editFrame);
  const localFrame = Math.max(0, Math.floor(editFrame) - segment.editStartInFrames);

  return Math.min(
    segment.sourceEndInFrames - 1,
    segment.sourceStartInFrames + localFrame * segment.playbackRate,
  );
};
