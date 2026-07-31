export const MENGER_AUTOMATIC_PROBE_PATHS = [
  "vertical-8",
  "horizontal-8",
  "orbit",
  "diagonal-sweep",
] as const;

export type MengerAutomaticProbePath = (typeof MENGER_AUTOMATIC_PROBE_PATHS)[number];

export const MENGER_AUTOMATIC_PROBE_DEFAULT_PATH = "vertical-8";
export const MENGER_AUTOMATIC_PROBE_DEFAULT_WIDTH = 0.3;
export const MENGER_AUTOMATIC_PROBE_DEFAULT_HEIGHT = 0.55;
export const MENGER_AUTOMATIC_PROBE_DEFAULT_LOOP_DURATION_SECONDS = 5.5;
export const MENGER_AUTOMATIC_PROBE_DEFAULT_REST_DURATION_SECONDS = 1.5;
export const MENGER_AUTOMATIC_PROBE_DEFAULT_START_PROGRESS = 0.25;

export type MengerAutomaticProbeMotionSettings = {
  enabled: boolean;
  height: number;
  loopDurationSeconds: number;
  path: MengerAutomaticProbePath;
  restDurationSeconds: number;
  startProgress: number;
  width: number;
};

export type MengerAutomaticProbeSettings = MengerAutomaticProbeMotionSettings & {
  landingSize: boolean;
  showPath: boolean;
};

export const MENGER_AUTOMATIC_PROBE_DEFAULT_SETTINGS = {
  enabled: false,
  height: MENGER_AUTOMATIC_PROBE_DEFAULT_HEIGHT,
  landingSize: false,
  loopDurationSeconds: MENGER_AUTOMATIC_PROBE_DEFAULT_LOOP_DURATION_SECONDS,
  path: MENGER_AUTOMATIC_PROBE_DEFAULT_PATH,
  restDurationSeconds: MENGER_AUTOMATIC_PROBE_DEFAULT_REST_DURATION_SECONDS,
  showPath: false,
  startProgress: MENGER_AUTOMATIC_PROBE_DEFAULT_START_PROGRESS,
  width: MENGER_AUTOMATIC_PROBE_DEFAULT_WIDTH,
} as const satisfies MengerAutomaticProbeSettings;

export type MengerAutomaticProbePoint = {
  x: number;
  y: number;
};

export function normalizeMengerAutomaticProbeExtent(value: number): number {
  return Number.isFinite(value) ? Math.max(value, 0) : 0;
}

export function normalizeMengerAutomaticProbeLoopDurationSeconds(value: number): number {
  return Number.isFinite(value) ? Math.max(value, 0.1) : 0.1;
}

export function normalizeMengerAutomaticProbeRestDurationSeconds(value: number): number {
  return Number.isFinite(value) ? Math.max(value, 0) : 0;
}

export function normalizeMengerAutomaticProbeStartProgress(value: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0;
}

export function readMengerAutomaticProbePoint(
  path: MengerAutomaticProbePath,
  progress: number,
  width: number,
  height: number,
  startProgress = MENGER_AUTOMATIC_PROBE_DEFAULT_START_PROGRESS,
): MengerAutomaticProbePoint {
  const angle =
    (normalizeMengerAutomaticProbeStartProgress(startProgress) + progress) * Math.PI * 2;
  const halfWidth = normalizeMengerAutomaticProbeExtent(width) / 2;
  const halfHeight = normalizeMengerAutomaticProbeExtent(height) / 2;

  switch (path) {
    case "vertical-8":
      return {
        x: 0.5 + Math.sin(angle * 2) * halfWidth,
        y: 0.5 - Math.sin(angle) * halfHeight,
      };
    case "horizontal-8":
      return {
        x: 0.5 + Math.sin(angle) * halfWidth,
        y: 0.5 - Math.sin(angle * 2) * halfHeight,
      };
    case "orbit":
      return {
        x: 0.5 + Math.sin(angle) * halfWidth,
        y: 0.5 - Math.cos(angle) * halfHeight,
      };
    case "diagonal-sweep":
      return {
        x: 0.5 + Math.sin(angle) * halfWidth,
        y: 0.5 - Math.sin(angle) * halfHeight,
      };
    default:
      path satisfies never;
      return { x: 0.5, y: 0.5 };
  }
}
