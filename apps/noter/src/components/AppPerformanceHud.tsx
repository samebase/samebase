import { useEffect, useMemo, useRef, useState } from "react";
import { onCLS, onINP, onLCP, type Metric } from "web-vitals";

const APP_PERFORMANCE_HUD_SAMPLE_LIMIT = 24;
const APP_PERFORMANCE_HUD_FRAME_BUCKET_MS = 500;
const APP_PERFORMANCE_HUD_LONG_TASK_WINDOW_MS = 30_000;
const APP_PERFORMANCE_HUD_GOOD_FRAME_MS = 18;
const APP_PERFORMANCE_HUD_WARN_FRAME_MS = 32;
const APP_PERFORMANCE_HUD_MAX_BAR_HEIGHT_PX = 18;
const APP_PERFORMANCE_HUD_MIN_BAR_HEIGHT_PX = 5;

export const APP_PERFORMANCE_HUD_TEST_ID = "app-performance-hud";

type VitalName = "CLS" | "INP" | "LCP";
type MetricRating = Metric["rating"];
type VitalRating = MetricRating | "pending";

type VitalSnapshot = {
  label: VitalName;
  rating: VitalRating;
  value: number | null;
};

type PerformanceHudSnapshot = {
  averageFrameMs: number | null;
  fps: number | null;
  longTaskCount: number;
  sparklineFrameMs: readonly number[];
  vitals: {
    CLS: VitalSnapshot;
    INP: VitalSnapshot;
    LCP: VitalSnapshot;
  };
};

type TrackedVital = Pick<Metric, "rating" | "value">;

function createPendingVital(label: VitalName): VitalSnapshot {
  return {
    label,
    rating: "pending",
    value: null,
  };
}

function createPendingVitals(): PerformanceHudSnapshot["vitals"] {
  return {
    CLS: createPendingVital("CLS"),
    INP: createPendingVital("INP"),
    LCP: createPendingVital("LCP"),
  };
}

function createInitialSnapshot(): PerformanceHudSnapshot {
  return {
    averageFrameMs: null,
    fps: null,
    longTaskCount: 0,
    sparklineFrameMs: [],
    vitals: createPendingVitals(),
  };
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function trimTrailingSamples(values: readonly number[]): number[] {
  if (values.length <= APP_PERFORMANCE_HUD_SAMPLE_LIMIT) {
    return [...values];
  }

  return values.slice(values.length - APP_PERFORMANCE_HUD_SAMPLE_LIMIT);
}

function getFrameRating(frameMs: number | null): VitalRating {
  if (frameMs === null) {
    return "pending";
  }

  if (frameMs <= APP_PERFORMANCE_HUD_GOOD_FRAME_MS) {
    return "good";
  }

  if (frameMs <= APP_PERFORMANCE_HUD_WARN_FRAME_MS) {
    return "needs-improvement";
  }

  return "poor";
}

function getHudToneClassName(rating: VitalRating): string {
  if (rating === "good") {
    return "text-emerald-600 dark:text-emerald-400";
  }

  if (rating === "needs-improvement") {
    return "text-amber-600 dark:text-amber-400";
  }

  if (rating === "poor") {
    return "text-rose-600 dark:text-rose-400";
  }

  return "text-muted-foreground";
}

function getBarToneClassName(frameMs: number): string {
  const rating = getFrameRating(frameMs);

  if (rating === "good") {
    return "bg-emerald-500";
  }

  if (rating === "needs-improvement") {
    return "bg-amber-500";
  }

  return "bg-rose-500";
}

function getBarClassName(frameMs: number): string {
  const toneClassName = getBarToneClassName(frameMs);

  if (toneClassName === "bg-emerald-500") {
    return "block w-[3px] bg-emerald-500";
  }

  if (toneClassName === "bg-amber-500") {
    return "block w-[3px] bg-amber-500";
  }

  return "block w-[3px] bg-rose-500";
}

function formatVitalValue(vital: VitalSnapshot): string {
  if (vital.value === null) {
    return "pending";
  }

  if (vital.label === "CLS") {
    return vital.value.toFixed(3);
  }

  if (vital.label === "LCP") {
    return `${(vital.value / 1000).toFixed(1)}s`;
  }

  return `${Math.round(vital.value)}ms`;
}

function getBarHeightPx(frameMs: number): number {
  const clampedFrameMs = Math.min(
    Math.max(frameMs, APP_PERFORMANCE_HUD_GOOD_FRAME_MS),
    APP_PERFORMANCE_HUD_WARN_FRAME_MS * 2,
  );
  const normalizedFrameMs =
    (clampedFrameMs - APP_PERFORMANCE_HUD_GOOD_FRAME_MS) /
    (APP_PERFORMANCE_HUD_WARN_FRAME_MS * 2 - APP_PERFORMANCE_HUD_GOOD_FRAME_MS);

  return Math.round(
    APP_PERFORMANCE_HUD_MIN_BAR_HEIGHT_PX +
      normalizedFrameMs *
        (APP_PERFORMANCE_HUD_MAX_BAR_HEIGHT_PX -
          APP_PERFORMANCE_HUD_MIN_BAR_HEIGHT_PX),
  );
}

function formatCompactMetricSummary(snapshot: PerformanceHudSnapshot): string {
  return [
    snapshot.fps === null
      ? "fps pending"
      : `${Math.max(1, Math.round(snapshot.fps))}fps`,
    snapshot.vitals.LCP.value === null
      ? "LCP pending"
      : `LCP ${formatVitalValue(snapshot.vitals.LCP)}`,
    snapshot.vitals.INP.value === null
      ? "INP pending"
      : `INP ${formatVitalValue(snapshot.vitals.INP)}`,
    snapshot.vitals.CLS.value === null
      ? "CLS pending"
      : `CLS ${formatVitalValue(snapshot.vitals.CLS)}`,
    `${snapshot.longTaskCount} long tasks in 30s`,
  ].join(" • ");
}

function buildSnapshot(args: {
  longTaskMarksMs: readonly number[];
  sparklineFrameMs: readonly number[];
  trackedVitals: {
    CLS: TrackedVital | null;
    INP: TrackedVital | null;
    LCP: TrackedVital | null;
  };
  nowMs: number;
}): PerformanceHudSnapshot {
  const longTaskCount = args.longTaskMarksMs.filter(
    (markMs) => args.nowMs - markMs <= APP_PERFORMANCE_HUD_LONG_TASK_WINDOW_MS,
  ).length;
  const averageFrameMs = average(args.sparklineFrameMs);

  return {
    averageFrameMs,
    fps:
      averageFrameMs === null || averageFrameMs <= 0
        ? null
        : 1000 / averageFrameMs,
    longTaskCount,
    sparklineFrameMs: args.sparklineFrameMs,
    vitals: {
      CLS:
        args.trackedVitals.CLS === null
          ? createPendingVital("CLS")
          : {
              label: "CLS",
              rating: args.trackedVitals.CLS.rating,
              value: args.trackedVitals.CLS.value,
            },
      INP:
        args.trackedVitals.INP === null
          ? createPendingVital("INP")
          : {
              label: "INP",
              rating: args.trackedVitals.INP.rating,
              value: args.trackedVitals.INP.value,
            },
      LCP:
        args.trackedVitals.LCP === null
          ? createPendingVital("LCP")
          : {
              label: "LCP",
              rating: args.trackedVitals.LCP.rating,
              value: args.trackedVitals.LCP.value,
            },
    },
  };
}

function PerformanceHudGraphic({
  snapshot,
}: {
  snapshot: PerformanceHudSnapshot;
}) {
  const overallRating = getFrameRating(snapshot.averageFrameMs);
  const fpsLabel =
    snapshot.fps === null ? "…" : `${Math.max(1, Math.round(snapshot.fps))}`;

  return (
    <div
      data-testid={APP_PERFORMANCE_HUD_TEST_ID}
      aria-label={formatCompactMetricSummary(snapshot)}
      className="inline-flex h-full items-center gap-2 px-1 tabular-nums"
    >
      <span className={getHudToneClassName(overallRating)}>{fpsLabel}fps</span>
      <div className="flex h-[12px] items-end gap-px" aria-hidden="true">
        {snapshot.sparklineFrameMs.map((frameMs, index) => (
          <span
            key={`${index}-${Math.round(frameMs)}`}
            className={getBarClassName(frameMs)}
            style={{ height: `${Math.min(getBarHeightPx(frameMs), 12)}px` }}
          />
        ))}
        {snapshot.sparklineFrameMs.length === 0 ? (
          <span className="block h-[8px] w-[18px] bg-muted" />
        ) : null}
      </div>
    </div>
  );
}

function usePerformanceHudSnapshot(): PerformanceHudSnapshot {
  const [snapshot, setSnapshot] = useState<PerformanceHudSnapshot>(() =>
    createInitialSnapshot(),
  );

  const longTaskMarksMsRef = useRef<number[]>([]);
  const sparklineFrameMsRef = useRef<number[]>([]);
  const pendingFrameBucketRef = useRef<number[]>([]);
  const trackedVitalsRef = useRef<{
    CLS: TrackedVital | null;
    INP: TrackedVital | null;
    LCP: TrackedVital | null;
  }>({
    CLS: null,
    INP: null,
    LCP: null,
  });
  const lastAnimationFrameMsRef = useRef<number | null>(null);
  const lastBucketCommitMsRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    let animationFrameId = 0;

    const publishSnapshot = (nowMs: number) => {
      if (!active) {
        return;
      }

      longTaskMarksMsRef.current = longTaskMarksMsRef.current.filter(
        (markMs) => nowMs - markMs <= APP_PERFORMANCE_HUD_LONG_TASK_WINDOW_MS,
      );

      setSnapshot(
        buildSnapshot({
          longTaskMarksMs: longTaskMarksMsRef.current,
          nowMs,
          sparklineFrameMs: sparklineFrameMsRef.current,
          trackedVitals: trackedVitalsRef.current,
        }),
      );
    };

    const commitFrameBucket = (nowMs: number) => {
      if (pendingFrameBucketRef.current.length === 0) {
        return;
      }

      const nextBucketAverage = average(pendingFrameBucketRef.current);
      pendingFrameBucketRef.current = [];

      if (nextBucketAverage === null) {
        return;
      }

      sparklineFrameMsRef.current = trimTrailingSamples([
        ...sparklineFrameMsRef.current,
        nextBucketAverage,
      ]);
      publishSnapshot(nowMs);
    };

    const handleAnimationFrame = (timestampMs: number) => {
      const previousAnimationFrameMs = lastAnimationFrameMsRef.current;
      lastAnimationFrameMsRef.current = timestampMs;

      if (previousAnimationFrameMs !== null) {
        pendingFrameBucketRef.current.push(
          timestampMs - previousAnimationFrameMs,
        );
      }

      const lastBucketCommitMs = lastBucketCommitMsRef.current;
      if (
        lastBucketCommitMs === null ||
        timestampMs - lastBucketCommitMs >= APP_PERFORMANCE_HUD_FRAME_BUCKET_MS
      ) {
        lastBucketCommitMsRef.current = timestampMs;
        commitFrameBucket(timestampMs);
      }

      animationFrameId = window.requestAnimationFrame(handleAnimationFrame);
    };

    const updateTrackedVital = (label: VitalName, metric: TrackedVital) => {
      trackedVitalsRef.current = {
        ...trackedVitalsRef.current,
        [label]: metric,
      };
      publishSnapshot(performance.now());
    };

    animationFrameId = window.requestAnimationFrame(handleAnimationFrame);

    let longTaskObserver: PerformanceObserver | null = null;
    if (
      "PerformanceObserver" in window &&
      PerformanceObserver.supportedEntryTypes.includes("longtask")
    ) {
      longTaskObserver = new PerformanceObserver((entryList) => {
        const nextLongTaskMarks = entryList
          .getEntries()
          .map((entry) => entry.startTime + entry.duration);
        longTaskMarksMsRef.current = [
          ...longTaskMarksMsRef.current,
          ...nextLongTaskMarks,
        ];
        publishSnapshot(performance.now());
      });
      longTaskObserver.observe({
        buffered: true,
        type: "longtask",
      });
    }

    onCLS(
      (metric) => {
        updateTrackedVital("CLS", {
          rating: metric.rating,
          value: metric.value,
        });
      },
      { reportAllChanges: true },
    );
    onINP(
      (metric) => {
        updateTrackedVital("INP", {
          rating: metric.rating,
          value: metric.value,
        });
      },
      { reportAllChanges: true },
    );
    onLCP(
      (metric) => {
        updateTrackedVital("LCP", {
          rating: metric.rating,
          value: metric.value,
        });
      },
      { reportAllChanges: true },
    );

    return () => {
      active = false;
      window.cancelAnimationFrame(animationFrameId);
      longTaskObserver?.disconnect();
    };
  }, []);

  return snapshot;
}

export function AppPerformanceHud() {
  const snapshot = usePerformanceHudSnapshot();
  return <PerformanceHudGraphic snapshot={snapshot} />;
}

export function AppPerformanceHudFixture() {
  const fixtureSnapshot = useMemo<PerformanceHudSnapshot>(
    () => ({
      averageFrameMs: 21,
      fps: 48,
      longTaskCount: 2,
      sparklineFrameMs: [
        16, 17, 18, 17, 18, 22, 24, 26, 21, 19, 18, 17, 18, 19, 33, 36, 28, 24,
        22, 19, 18, 19, 21, 23,
      ],
      vitals: {
        CLS: {
          label: "CLS",
          rating: "good",
          value: 0.02,
        },
        INP: {
          label: "INP",
          rating: "needs-improvement",
          value: 280,
        },
        LCP: {
          label: "LCP",
          rating: "good",
          value: 1800,
        },
      },
    }),
    [],
  );

  return <PerformanceHudGraphic snapshot={fixtureSnapshot} />;
}
