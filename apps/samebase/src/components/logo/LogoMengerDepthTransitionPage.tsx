import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import { AppSelectContent, AppSelectItem } from "@/components/AppSelect";
import { MengerDepthTransitionScene } from "@/components/logo/MengerDepthTransitionScene";
import { MengerHoverScene } from "@/components/logo/MengerHoverScene";
import {
  LOGO_PRESENTATION_TILT_DEFAULT_RADIUS_SCALE,
  LOGO_PRESENTATION_TILT_DEFAULT_STRENGTH_SCALE,
  LOGO_PRESENTATION_TILT_RADIUS_SCALE_SLIDER_MAX,
  LOGO_PRESENTATION_TILT_RADIUS_SCALE_SLIDER_MIN,
  LOGO_PRESENTATION_TILT_STRENGTH_SCALE_SLIDER_MAX,
  LOGO_PRESENTATION_TILT_STRENGTH_SCALE_SLIDER_MIN,
  normalizeLogoPresentationTiltRadiusScale,
  normalizeLogoPresentationTiltStrengthScale,
} from "@/components/logo/logoPresentationTilt";
import { readLogoRouteRenderState } from "@/components/logo/logoRouteRenderState";
import { type LogoViewState } from "@/components/logo/logoViewDrag";
import {
  MENGER_AUTOMATIC_PROBE_DEFAULT_HEIGHT,
  MENGER_AUTOMATIC_PROBE_DEFAULT_LOOP_DURATION_SECONDS,
  MENGER_AUTOMATIC_PROBE_DEFAULT_PATH,
  MENGER_AUTOMATIC_PROBE_DEFAULT_REST_DURATION_SECONDS,
  MENGER_AUTOMATIC_PROBE_DEFAULT_WIDTH,
  MENGER_AUTOMATIC_PROBE_PATHS,
  readMengerAutomaticProbePoint,
  type MengerAutomaticProbeMotionSettings,
  type MengerAutomaticProbeSettings,
} from "@/components/logo/mengerAutomaticProbe";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger } from "@/components/ui/select";
import { useResolvedAppThemeColorState } from "@/lib/appThemeColorSearch";
import {
  buildLogoMengerHoverRouteSearch,
  buildLogoRouteSearch,
  preserveLogoRouteDevModeSearch,
  type LogoMengerHoverRouteSearch,
} from "@/routeSearch/logo";
import {
  MENGER_DEPTH_TRANSITION_DEFAULT_STAGGER_GROUP_COUNT,
  MENGER_DEPTH_TRANSITION_MAX_STAGGER_GROUP_COUNT,
  createMengerDepthTransitionModel,
  readMengerDepthTransitionStage,
} from "@samebase/logo-model/menger-depth-transition";
import {
  MENGER_HOVER_DEFAULT_DEPTH,
  MENGER_HOVER_DEFAULT_REVEAL_RADIUS,
  MENGER_HOVER_MAX_DEPTH,
  MENGER_HOVER_MAX_REVEAL_RADIUS,
  MENGER_HOVER_MIN_DEPTH,
  MENGER_HOVER_MIN_REVEAL_RADIUS,
  normalizeMengerHoverRevealRadius,
} from "@samebase/logo-model/menger-hover";
import { Link } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

const TRANSITION_PROGRESS_STEPS = 1_000;

type TransitionPhase = `depth-${number}` | "transition";
type MengerResearchMode = "hover" | "transition";

function formatMengerAutomaticProbeExtentPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return "0%";
  }

  const percent = value * 100;
  if (Number.isFinite(percent)) {
    return `${Math.round(percent)}%`;
  }

  const exponential = value.toExponential();
  const separatorIndex = exponential.indexOf("e");
  const coefficient = exponential.slice(0, separatorIndex);
  const exponent = Number(exponential.slice(separatorIndex + 1)) + 2;
  return `${coefficient}e${exponent >= 0 ? "+" : ""}${exponent}%`;
}

/**
 * SSG emits one research-route document without query-derived optional nodes.
 * Wait until hydration completes before the path overlay can add an SVG child.
 */
function useHasHydrated() {
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  return hasHydrated;
}

export function LogoMengerDepthTransitionPage({
  mode = "transition",
  replaceRouteSearch,
  routeSearch,
}: {
  mode?: MengerResearchMode;
  replaceRouteSearch: (nextSearch: LogoMengerHoverRouteSearch) => void;
  routeSearch: LogoMengerHoverRouteSearch;
}) {
  const routeState = useMemo(
    () =>
      readLogoRouteRenderState({
        renderMode: "three",
        routeSearch,
      }),
    [routeSearch],
  );
  const { backgroundColor, faceColors } = useResolvedAppThemeColorState(routeState.themeColors);
  const searchHoverMaximumDepth = routeSearch.depth ?? MENGER_HOVER_DEFAULT_DEPTH;
  const pointerTiltEnabled = routeSearch.tilt === true;
  const searchPointerTiltRadiusScale = normalizeLogoPresentationTiltRadiusScale(
    routeSearch.tiltRadius ?? LOGO_PRESENTATION_TILT_DEFAULT_RADIUS_SCALE,
  );
  const searchPointerTiltStrengthScale = normalizeLogoPresentationTiltStrengthScale(
    routeSearch.tiltStrength ?? LOGO_PRESENTATION_TILT_DEFAULT_STRENGTH_SCALE,
  );
  const automaticProbe = useMemo<MengerAutomaticProbeSettings>(
    () => ({
      enabled: routeSearch.probe === true,
      height: routeSearch.probeHeight ?? MENGER_AUTOMATIC_PROBE_DEFAULT_HEIGHT,
      landingSize: routeSearch.probeLanding === true,
      loopDurationSeconds:
        routeSearch.probeLoop ?? MENGER_AUTOMATIC_PROBE_DEFAULT_LOOP_DURATION_SECONDS,
      path: routeSearch.probePath ?? MENGER_AUTOMATIC_PROBE_DEFAULT_PATH,
      restDurationSeconds:
        routeSearch.probeRest ?? MENGER_AUTOMATIC_PROBE_DEFAULT_REST_DURATION_SECONDS,
      showPath: routeSearch.probePathVisible === true,
      width: routeSearch.probeWidth ?? MENGER_AUTOMATIC_PROBE_DEFAULT_WIDTH,
    }),
    [
      routeSearch.probe,
      routeSearch.probeHeight,
      routeSearch.probeLanding,
      routeSearch.probeLoop,
      routeSearch.probePath,
      routeSearch.probePathVisible,
      routeSearch.probeRest,
      routeSearch.probeWidth,
    ],
  );
  const [progress, setProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackVersion, setPlaybackVersion] = useState(0);
  const [staggerGroupCount, setStaggerGroupCount] = useState(
    MENGER_DEPTH_TRANSITION_DEFAULT_STAGGER_GROUP_COUNT,
  );
  const [hoverRevealRadius, setHoverRevealRadius] = useState(MENGER_HOVER_DEFAULT_REVEAL_RADIUS);
  const [hoverMaximumDepth, setHoverMaximumDepth] = useState(searchHoverMaximumDepth);
  const [pointerTiltRadiusScale, setPointerTiltRadiusScale] = useState(
    searchPointerTiltRadiusScale,
  );
  const [pointerTiltStrengthScale, setPointerTiltStrengthScale] = useState(
    searchPointerTiltStrengthScale,
  );
  const [automaticProbeDraft, setAutomaticProbeDraft] = useState(automaticProbe);
  const hasHydrated = useHasHydrated();
  const automaticProbeMotion = useMemo<MengerAutomaticProbeMotionSettings>(
    () => ({
      enabled: automaticProbeDraft.enabled,
      height: automaticProbeDraft.height,
      loopDurationSeconds: automaticProbeDraft.loopDurationSeconds,
      path: automaticProbeDraft.path,
      restDurationSeconds: automaticProbeDraft.restDurationSeconds,
      width: automaticProbeDraft.width,
    }),
    [
      automaticProbeDraft.enabled,
      automaticProbeDraft.height,
      automaticProbeDraft.loopDurationSeconds,
      automaticProbeDraft.path,
      automaticProbeDraft.restDurationSeconds,
      automaticProbeDraft.width,
    ],
  );
  const [view, setView] = useState<LogoViewState>({
    elevationDegrees: routeState.elevationDegrees,
    rotationDegrees: routeState.rotationDegrees,
  });
  const playbackStartProgressRef = useRef(0);
  const prefersReducedMotionRef = useRef(false);
  const progressInputRef = useRef<HTMLInputElement | null>(null);
  const transitionModel = useMemo(
    () =>
      createMengerDepthTransitionModel({
        maximumDepth: 3,
        retainFinalSettledVoxels: true,
        staggerGroupCount,
      }),
    [staggerGroupCount],
  );

  useLayoutEffect(() => {
    const nextView = {
      elevationDegrees: routeState.elevationDegrees,
      rotationDegrees: routeState.rotationDegrees,
    };

    setView((currentView) =>
      currentView.elevationDegrees === nextView.elevationDegrees &&
      currentView.rotationDegrees === nextView.rotationDegrees
        ? currentView
        : nextView,
    );
  }, [routeState.elevationDegrees, routeState.rotationDegrees]);

  useLayoutEffect(() => {
    setHoverMaximumDepth(searchHoverMaximumDepth);
  }, [searchHoverMaximumDepth]);

  useLayoutEffect(() => {
    setPointerTiltRadiusScale(searchPointerTiltRadiusScale);
  }, [searchPointerTiltRadiusScale]);

  useLayoutEffect(() => {
    setPointerTiltStrengthScale(searchPointerTiltStrengthScale);
  }, [searchPointerTiltStrengthScale]);

  useLayoutEffect(() => {
    setAutomaticProbeDraft(automaticProbe);
  }, [automaticProbe]);

  useEffect(() => {
    if (mode === "hover") {
      setIsPlaying(false);
      setProgress(0);
      return;
    }

    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const applyReducedMotionPreference = (prefersReducedMotion: boolean) => {
      prefersReducedMotionRef.current = prefersReducedMotion;
      if (prefersReducedMotion) {
        setIsPlaying(false);
        setProgress(1);
        return;
      }

      playbackStartProgressRef.current = 0;
      setProgress(0);
      setPlaybackVersion((currentVersion) => currentVersion + 1);
      setIsPlaying(true);
    };

    applyReducedMotionPreference(reducedMotionQuery.matches);
    const onReducedMotionChange = (event: MediaQueryListEvent) => {
      applyReducedMotionPreference(event.matches);
    };
    reducedMotionQuery.addEventListener("change", onReducedMotionChange);

    return () => {
      reducedMotionQuery.removeEventListener("change", onReducedMotionChange);
    };
  }, [mode]);

  useEffect(() => {
    if (mode === "hover" || !isPlaying) {
      return;
    }

    const startedAtMs =
      performance.now() - playbackStartProgressRef.current * transitionModel.totalDurationMs;
    let animationFrameId = 0;

    const animate = (timestampMs: number) => {
      const nextProgress = Math.min(
        (timestampMs - startedAtMs) / transitionModel.totalDurationMs,
        1,
      );
      setProgress(nextProgress);

      if (nextProgress < 1) {
        animationFrameId = window.requestAnimationFrame(animate);
        return;
      }

      setIsPlaying(false);
    };

    animationFrameId = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [isPlaying, mode, playbackVersion, transitionModel.totalDurationMs]);

  useEffect(() => {
    if (progressInputRef.current) {
      progressInputRef.current.value = String(Math.round(progress * TRANSITION_PROGRESS_STEPS));
    }
  }, [progress]);

  const elapsedMs = progress * transitionModel.totalDurationMs;
  const activeStage = readMengerDepthTransitionStage(transitionModel, elapsedMs);
  const finalStage = transitionModel.stages[transitionModel.stages.length - 1];
  let phase: TransitionPhase;
  let phaseLabel: string;
  if (progress >= 1) {
    phase = `depth-${finalStage.depth}`;
    phaseLabel = `Depth ${finalStage.depth}`;
  } else if (activeStage && elapsedMs >= activeStage.endTimeMs) {
    phase = `depth-${activeStage.depth}`;
    phaseLabel = `Depth ${activeStage.depth}`;
  } else if (activeStage) {
    phase = "transition";
    phaseLabel = `Depth ${activeStage.depth - 1} to ${activeStage.depth}`;
  } else if (progress > 0 || isPlaying) {
    phase = "transition";
    phaseLabel = "Depth 1 to 2";
  } else {
    phase = "depth-1";
    phaseLabel = "Depth 1";
  }

  const replayTransition = useCallback(() => {
    if (prefersReducedMotionRef.current) {
      setIsPlaying(false);
      setProgress(1);
      return;
    }

    playbackStartProgressRef.current = 0;
    setProgress(0);
    setPlaybackVersion((currentVersion) => currentVersion + 1);
    setIsPlaying(true);
  }, []);
  const updateProgress = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setIsPlaying(false);
    setProgress(Number(event.target.value) / TRANSITION_PROGRESS_STEPS);
  }, []);
  const updateStaggerGroupCount = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setStaggerGroupCount(Number(event.target.value));
    playbackStartProgressRef.current = 0;
    setProgress(prefersReducedMotionRef.current ? 1 : 0);
    setPlaybackVersion((currentVersion) => currentVersion + 1);
    setIsPlaying(!prefersReducedMotionRef.current);
  }, []);
  const updateHoverRevealRadius = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setHoverRevealRadius(normalizeMengerHoverRevealRadius(Number(event.target.value)));
  }, []);
  const updateHoverMaximumDepth = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setHoverMaximumDepth(Number(event.target.value));
  }, []);
  const updatePointerTiltRadiusScale = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setPointerTiltRadiusScale(
      normalizeLogoPresentationTiltRadiusScale(Math.round(Number(event.target.value) * 100) / 100),
    );
  }, []);
  const updatePointerTiltStrengthScale = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setPointerTiltStrengthScale(
      normalizeLogoPresentationTiltStrengthScale(
        Math.round(Number(event.target.value) * 100) / 100,
      ),
    );
  }, []);
  const commitHoverDraftSettings = useCallback(() => {
    replaceRouteSearch(
      preserveLogoRouteDevModeSearch(
        buildLogoMengerHoverRouteSearch({
          ...routeState,
          elevationDegrees: view.elevationDegrees,
          mengerAutomaticProbe: automaticProbe,
          mengerHoverDepth: hoverMaximumDepth,
          mengerHoverTiltEnabled: pointerTiltEnabled,
          mengerHoverTiltRadiusScale: pointerTiltRadiusScale,
          mengerHoverTiltStrengthScale: pointerTiltStrengthScale,
          rotationDegrees: view.rotationDegrees,
          themeModeSearch: routeSearch,
        }),
        routeSearch,
      ),
    );
  }, [
    automaticProbe,
    hoverMaximumDepth,
    pointerTiltEnabled,
    pointerTiltRadiusScale,
    pointerTiltStrengthScale,
    replaceRouteSearch,
    routeSearch,
    routeState,
    view,
  ]);
  const updatePointerTiltEnabled = useCallback(
    (enabled: boolean) => {
      replaceRouteSearch(
        preserveLogoRouteDevModeSearch(
          buildLogoMengerHoverRouteSearch({
            ...routeState,
            elevationDegrees: view.elevationDegrees,
            mengerAutomaticProbe: automaticProbe,
            mengerHoverDepth: hoverMaximumDepth,
            mengerHoverTiltEnabled: enabled,
            mengerHoverTiltRadiusScale: pointerTiltRadiusScale,
            mengerHoverTiltStrengthScale: pointerTiltStrengthScale,
            rotationDegrees: view.rotationDegrees,
            themeModeSearch: routeSearch,
          }),
          routeSearch,
        ),
      );
    },
    [
      automaticProbe,
      hoverMaximumDepth,
      pointerTiltRadiusScale,
      pointerTiltStrengthScale,
      replaceRouteSearch,
      routeSearch,
      routeState,
      view,
    ],
  );
  const commitView = useCallback(
    (finalView: LogoViewState) => {
      const nextSearch =
        mode === "hover"
          ? buildLogoMengerHoverRouteSearch({
              ...routeState,
              elevationDegrees: finalView.elevationDegrees,
              mengerAutomaticProbe: automaticProbe,
              mengerHoverDepth: hoverMaximumDepth,
              mengerHoverTiltEnabled: pointerTiltEnabled,
              mengerHoverTiltRadiusScale: pointerTiltRadiusScale,
              mengerHoverTiltStrengthScale: pointerTiltStrengthScale,
              rotationDegrees: finalView.rotationDegrees,
              themeModeSearch: routeSearch,
            })
          : buildLogoRouteSearch({
              ...routeState,
              elevationDegrees: finalView.elevationDegrees,
              rotationDegrees: finalView.rotationDegrees,
              themeModeSearch: routeSearch,
            });
      replaceRouteSearch(preserveLogoRouteDevModeSearch(nextSearch, routeSearch));
    },
    [
      automaticProbe,
      hoverMaximumDepth,
      mode,
      pointerTiltEnabled,
      pointerTiltRadiusScale,
      pointerTiltStrengthScale,
      replaceRouteSearch,
      routeSearch,
      routeState,
    ],
  );
  const updateAutomaticProbe = useCallback(
    (nextAutomaticProbe: MengerAutomaticProbeSettings) => {
      setAutomaticProbeDraft(nextAutomaticProbe);
      replaceRouteSearch(
        preserveLogoRouteDevModeSearch(
          buildLogoMengerHoverRouteSearch({
            ...routeState,
            elevationDegrees: view.elevationDegrees,
            mengerAutomaticProbe: nextAutomaticProbe,
            mengerHoverDepth: hoverMaximumDepth,
            mengerHoverTiltEnabled: pointerTiltEnabled,
            mengerHoverTiltRadiusScale: pointerTiltRadiusScale,
            mengerHoverTiltStrengthScale: pointerTiltStrengthScale,
            rotationDegrees: view.rotationDegrees,
            themeModeSearch: routeSearch,
          }),
          routeSearch,
        ),
      );
    },
    [
      hoverMaximumDepth,
      pointerTiltEnabled,
      pointerTiltRadiusScale,
      pointerTiltStrengthScale,
      replaceRouteSearch,
      routeSearch,
      routeState,
      view,
    ],
  );
  const commitAutomaticProbeDraft = useCallback(() => {
    updateAutomaticProbe(automaticProbeDraft);
  }, [automaticProbeDraft, updateAutomaticProbe]);
  const automaticProbePathPoints = useMemo(
    () =>
      Array.from({ length: 65 }, (_, index) => {
        const point = readMengerAutomaticProbePoint(
          automaticProbeDraft.path,
          index / 64,
          automaticProbeDraft.width,
          automaticProbeDraft.height,
        );
        return `${point.x},${point.y}`;
      }).join(" "),
    [automaticProbeDraft.height, automaticProbeDraft.path, automaticProbeDraft.width],
  );
  const hoverControlsContent = useMemo(
    () => (
      <div className="grid content-start gap-4 p-3" data-testid="logo-menger-hover-controls">
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild className="rounded-none" size="sm" variant="outline">
            <Link to="/logo">3D</Link>
          </Button>
          <Button asChild className="rounded-none" size="sm" variant="outline">
            <Link to="/logo/transition/menger">Menger transition</Link>
          </Button>
          <div
            aria-current="page"
            className="inline-flex h-8 items-center border border-foreground bg-foreground px-3 text-sm font-medium text-background"
          >
            Menger hover
          </div>
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="menger-hover-maximum-depth">Reveal depth</label>
            <output
              className="font-mono text-xs text-muted-foreground"
              htmlFor="menger-hover-maximum-depth"
            >
              {hoverMaximumDepth}
            </output>
          </div>
          <input
            id="menger-hover-maximum-depth"
            aria-label="Reveal depth"
            className="h-2 w-full cursor-pointer accent-foreground"
            max={MENGER_HOVER_MAX_DEPTH}
            min={MENGER_HOVER_MIN_DEPTH}
            onBlur={commitHoverDraftSettings}
            onChange={updateHoverMaximumDepth}
            onKeyUp={commitHoverDraftSettings}
            onPointerUp={commitHoverDraftSettings}
            step="1"
            type="range"
            value={hoverMaximumDepth}
          />
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="menger-hover-reveal-radius">Reveal radius</label>
            <output
              className="font-mono text-xs text-muted-foreground"
              htmlFor="menger-hover-reveal-radius"
            >
              {hoverRevealRadius.toFixed(2)}
            </output>
          </div>
          <input
            id="menger-hover-reveal-radius"
            aria-label="Reveal radius"
            className="h-2 w-full cursor-pointer accent-foreground"
            max={MENGER_HOVER_MAX_REVEAL_RADIUS}
            min={MENGER_HOVER_MIN_REVEAL_RADIUS}
            onChange={updateHoverRevealRadius}
            step="0.01"
            type="range"
            value={hoverRevealRadius}
          />
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="menger-hover-pointer-tilt"
            checked={pointerTiltEnabled}
            onCheckedChange={(checked) => {
              updatePointerTiltEnabled(checked === true);
            }}
          />
          <label className="text-xs" htmlFor="menger-hover-pointer-tilt">
            Landing tilt
          </label>
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="menger-hover-pointer-tilt-radius">Tilt radius</label>
            <output
              className="font-mono text-xs text-muted-foreground"
              htmlFor="menger-hover-pointer-tilt-radius"
            >
              {pointerTiltRadiusScale.toFixed(2)}×
            </output>
          </div>
          <input
            id="menger-hover-pointer-tilt-radius"
            aria-label="Tilt radius"
            className="h-2 w-full cursor-pointer accent-foreground"
            max={Math.max(
              LOGO_PRESENTATION_TILT_RADIUS_SCALE_SLIDER_MAX,
              searchPointerTiltRadiusScale,
            )}
            min={LOGO_PRESENTATION_TILT_RADIUS_SCALE_SLIDER_MIN}
            onBlur={commitHoverDraftSettings}
            onChange={updatePointerTiltRadiusScale}
            onKeyUp={commitHoverDraftSettings}
            onPointerUp={commitHoverDraftSettings}
            step="any"
            type="range"
            value={pointerTiltRadiusScale}
          />
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="menger-hover-pointer-tilt-strength">Tilt strength</label>
            <output
              className="font-mono text-xs text-muted-foreground"
              htmlFor="menger-hover-pointer-tilt-strength"
            >
              {pointerTiltStrengthScale.toFixed(2)}×
            </output>
          </div>
          <input
            id="menger-hover-pointer-tilt-strength"
            aria-label="Tilt strength"
            className="h-2 w-full cursor-pointer accent-foreground"
            max={Math.max(
              LOGO_PRESENTATION_TILT_STRENGTH_SCALE_SLIDER_MAX,
              searchPointerTiltStrengthScale,
            )}
            min={LOGO_PRESENTATION_TILT_STRENGTH_SCALE_SLIDER_MIN}
            onBlur={commitHoverDraftSettings}
            onChange={updatePointerTiltStrengthScale}
            onKeyUp={commitHoverDraftSettings}
            onPointerUp={commitHoverDraftSettings}
            step="any"
            type="range"
            value={pointerTiltStrengthScale}
          />
        </div>

        <div className="grid gap-4 border-t pt-3">
          <div className="text-xs font-medium">Automatic probe</div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="menger-hover-automatic-probe"
              checked={automaticProbeDraft.enabled}
              onCheckedChange={(checked) => {
                updateAutomaticProbe({
                  ...automaticProbeDraft,
                  enabled: checked === true,
                });
              }}
            />
            <label className="text-xs" htmlFor="menger-hover-automatic-probe">
              Play
            </label>
          </div>

          <div className="grid gap-2">
            <label className="text-xs" htmlFor="menger-hover-automatic-probe-path">
              Path
            </label>
            <Select
              value={automaticProbeDraft.path}
              onValueChange={(value) => {
                const path = MENGER_AUTOMATIC_PROBE_PATHS.find((candidate) => candidate === value);
                if (path) {
                  updateAutomaticProbe({ ...automaticProbeDraft, path });
                }
              }}
            >
              <SelectTrigger
                id="menger-hover-automatic-probe-path"
                aria-label="Automatic probe path"
                className="h-8 w-full rounded-none border-border bg-background px-2 text-sm shadow-none"
              >
                {
                  {
                    "vertical-8": "Vertical 8",
                    "horizontal-8": "Horizontal 8",
                    orbit: "Orbit",
                    "diagonal-sweep": "Diagonal sweep",
                  }[automaticProbeDraft.path]
                }
              </SelectTrigger>
              <AppSelectContent className="rounded-none border-border">
                <AppSelectItem className="rounded-none" value="vertical-8">
                  Vertical 8
                </AppSelectItem>
                <AppSelectItem className="rounded-none" value="horizontal-8">
                  Horizontal 8
                </AppSelectItem>
                <AppSelectItem className="rounded-none" value="orbit">
                  Orbit
                </AppSelectItem>
                <AppSelectItem className="rounded-none" value="diagonal-sweep">
                  Diagonal sweep
                </AppSelectItem>
              </AppSelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="menger-hover-automatic-probe-width">Path width</label>
              <output
                className="font-mono text-xs text-muted-foreground"
                htmlFor="menger-hover-automatic-probe-width"
              >
                {formatMengerAutomaticProbeExtentPercent(automaticProbeDraft.width)}
              </output>
            </div>
            <input
              id="menger-hover-automatic-probe-width"
              aria-label="Automatic probe path width"
              className="h-2 w-full cursor-pointer accent-foreground"
              max={Math.max(1, automaticProbeDraft.width)}
              min="0"
              onBlur={commitAutomaticProbeDraft}
              onChange={(event) => {
                setAutomaticProbeDraft({
                  ...automaticProbeDraft,
                  width: Number(event.target.value),
                });
              }}
              onKeyUp={commitAutomaticProbeDraft}
              onPointerUp={commitAutomaticProbeDraft}
              step="0.05"
              type="range"
              value={automaticProbeDraft.width}
            />
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="menger-hover-automatic-probe-height">Path height</label>
              <output
                className="font-mono text-xs text-muted-foreground"
                htmlFor="menger-hover-automatic-probe-height"
              >
                {formatMengerAutomaticProbeExtentPercent(automaticProbeDraft.height)}
              </output>
            </div>
            <input
              id="menger-hover-automatic-probe-height"
              aria-label="Automatic probe path height"
              className="h-2 w-full cursor-pointer accent-foreground"
              max={Math.max(1, automaticProbeDraft.height)}
              min="0"
              onBlur={commitAutomaticProbeDraft}
              onChange={(event) => {
                setAutomaticProbeDraft({
                  ...automaticProbeDraft,
                  height: Number(event.target.value),
                });
              }}
              onKeyUp={commitAutomaticProbeDraft}
              onPointerUp={commitAutomaticProbeDraft}
              step="0.05"
              type="range"
              value={automaticProbeDraft.height}
            />
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="menger-hover-automatic-probe-loop">Loop duration</label>
              <output
                className="font-mono text-xs text-muted-foreground"
                htmlFor="menger-hover-automatic-probe-loop"
              >
                {automaticProbeDraft.loopDurationSeconds.toFixed(1)} s
              </output>
            </div>
            <input
              id="menger-hover-automatic-probe-loop"
              aria-label="Automatic probe loop duration"
              className="h-2 w-full cursor-pointer accent-foreground"
              max={Math.max(12, automaticProbeDraft.loopDurationSeconds)}
              min={Math.min(2, automaticProbeDraft.loopDurationSeconds)}
              onBlur={commitAutomaticProbeDraft}
              onChange={(event) => {
                setAutomaticProbeDraft({
                  ...automaticProbeDraft,
                  loopDurationSeconds: Number(event.target.value),
                });
              }}
              onKeyUp={commitAutomaticProbeDraft}
              onPointerUp={commitAutomaticProbeDraft}
              step="0.5"
              type="range"
              value={automaticProbeDraft.loopDurationSeconds}
            />
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="menger-hover-automatic-probe-rest">Rest duration</label>
              <output
                className="font-mono text-xs text-muted-foreground"
                htmlFor="menger-hover-automatic-probe-rest"
              >
                {automaticProbeDraft.restDurationSeconds.toFixed(1)} s
              </output>
            </div>
            <input
              id="menger-hover-automatic-probe-rest"
              aria-label="Automatic probe rest duration"
              className="h-2 w-full cursor-pointer accent-foreground"
              max={Math.max(5, automaticProbeDraft.restDurationSeconds)}
              min="0"
              onBlur={commitAutomaticProbeDraft}
              onChange={(event) => {
                setAutomaticProbeDraft({
                  ...automaticProbeDraft,
                  restDurationSeconds: Number(event.target.value),
                });
              }}
              onKeyUp={commitAutomaticProbeDraft}
              onPointerUp={commitAutomaticProbeDraft}
              step="0.5"
              type="range"
              value={automaticProbeDraft.restDurationSeconds}
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="menger-hover-automatic-probe-landing-size"
              checked={automaticProbeDraft.landingSize}
              onCheckedChange={(checked) => {
                updateAutomaticProbe({
                  ...automaticProbeDraft,
                  landingSize: checked === true,
                });
              }}
            />
            <label className="text-xs" htmlFor="menger-hover-automatic-probe-landing-size">
              Landing-size preview
            </label>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="menger-hover-automatic-probe-show-path"
              checked={automaticProbeDraft.showPath}
              onCheckedChange={(checked) => {
                updateAutomaticProbe({
                  ...automaticProbeDraft,
                  showPath: checked === true,
                });
              }}
            />
            <label className="text-xs" htmlFor="menger-hover-automatic-probe-show-path">
              Show path
            </label>
          </div>
        </div>

        <div className="grid gap-1 border-t pt-3 font-mono text-xs text-muted-foreground">
          <div>Depth 1 at rest</div>
          <div>
            {hoverMaximumDepth === 1
              ? "Pointer reveal disabled"
              : `Pointer reveals through depth ${hoverMaximumDepth}`}
          </div>
          <div>4 non-overlapping cover slabs per hole</div>
        </div>
      </div>
    ),
    [
      automaticProbeDraft,
      commitAutomaticProbeDraft,
      commitHoverDraftSettings,
      hoverMaximumDepth,
      hoverRevealRadius,
      pointerTiltEnabled,
      pointerTiltRadiusScale,
      pointerTiltStrengthScale,
      searchPointerTiltRadiusScale,
      searchPointerTiltStrengthScale,
      updateHoverMaximumDepth,
      updateHoverRevealRadius,
      updateAutomaticProbe,
      updatePointerTiltEnabled,
      updatePointerTiltRadiusScale,
      updatePointerTiltStrengthScale,
    ],
  );
  const transitionControlsContent = useMemo(
    () => (
      <div
        className="grid content-start gap-4 p-3"
        data-testid="logo-menger-depth-transition-controls"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild className="rounded-none" size="sm" variant="outline">
            <Link to="/logo">3D</Link>
          </Button>
          <div
            aria-current="page"
            className="inline-flex h-8 items-center border border-foreground bg-foreground px-3 text-sm font-medium text-background"
          >
            Menger transition
          </div>
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="menger-depth-transition-stagger-groups">Stagger groups</label>
            <output
              className="font-mono text-xs text-muted-foreground"
              htmlFor="menger-depth-transition-stagger-groups"
            >
              {staggerGroupCount}
            </output>
          </div>
          <input
            id="menger-depth-transition-stagger-groups"
            aria-label="Stagger groups"
            className="h-2 w-full cursor-pointer accent-foreground"
            max={MENGER_DEPTH_TRANSITION_MAX_STAGGER_GROUP_COUNT}
            min="1"
            onChange={updateStaggerGroupCount}
            step="1"
            type="range"
            value={staggerGroupCount}
          />
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="menger-depth-transition-progress">Depth</label>
            <div aria-live="polite" className="font-mono text-xs text-muted-foreground">
              {phaseLabel}
            </div>
          </div>
          <input
            ref={progressInputRef}
            id="menger-depth-transition-progress"
            aria-label="Transition progress"
            className="h-2 w-full cursor-pointer accent-foreground"
            defaultValue="0"
            max={TRANSITION_PROGRESS_STEPS}
            min="0"
            onChange={updateProgress}
            step="1"
            type="range"
          />
        </div>

        <Button className="rounded-none" onClick={replayTransition} type="button">
          Replay transition
        </Button>

        <div className="grid gap-1 border-t pt-3 font-mono text-xs text-muted-foreground">
          <div>20 large cubes</div>
          <div>120 absorbed for depth 2</div>
          <div>400 depth 2 cubes</div>
          <div>2,400 absorbed for depth 3</div>
          <div>8,000 final cubes</div>
        </div>
      </div>
    ),
    [phaseLabel, replayTransition, staggerGroupCount, updateProgress, updateStaggerGroupCount],
  );
  const controlsContent = mode === "hover" ? hoverControlsContent : transitionControlsContent;
  const leftPane = useMemo(() => ({ content: controlsContent }), [controlsContent]);

  return (
    <AppWorkspaceRouteChrome left={leftPane}>
      <div
        className="h-full min-h-0 w-full"
        data-menger-research-mode={mode}
        data-menger-pointer-tilt={pointerTiltEnabled ? "landing" : "off"}
        data-menger-pointer-tilt-radius-scale={pointerTiltRadiusScale}
        data-menger-pointer-tilt-strength-scale={pointerTiltStrengthScale}
        data-menger-probe={automaticProbeDraft.enabled ? "play" : "off"}
        data-menger-probe-landing-size={automaticProbeDraft.landingSize ? "true" : "false"}
        data-menger-probe-path={automaticProbeDraft.path}
        data-menger-probe-path-visible={automaticProbeDraft.showPath ? "true" : "false"}
        data-phase={phase}
        data-testid={
          mode === "hover" ? "logo-menger-hover-page" : "logo-menger-depth-transition-page"
        }
        style={{ backgroundColor }}
      >
        {mode === "hover" ? (
          <div
            className={
              automaticProbeDraft.landingSize
                ? "flex h-full min-h-0 w-full items-center justify-center"
                : "h-full min-h-0 w-full"
            }
          >
            <div
              className={
                automaticProbeDraft.landingSize
                  ? "relative aspect-square min-h-0 w-full"
                  : "relative h-full min-h-0 w-full"
              }
              data-testid="logo-menger-hover-scene-frame"
              style={
                automaticProbeDraft.landingSize
                  ? { maxWidth: "min(22rem, calc(100svh - 12rem))" }
                  : undefined
              }
            >
              <MengerHoverScene
                automaticProbe={automaticProbeMotion}
                cameraFrustumPadding={1.12}
                elevationDegrees={view.elevationDegrees}
                faceColors={faceColors}
                maximumDepth={hoverMaximumDepth}
                onInteractionEnd={commitView}
                onViewChange={setView}
                pointerTiltEnabled={pointerTiltEnabled}
                pointerTiltRadiusScale={pointerTiltRadiusScale}
                pointerTiltStrengthScale={pointerTiltStrengthScale}
                revealRadius={hoverRevealRadius}
                rotationDegrees={view.rotationDegrees}
                viewSnapEnabled={routeState.viewSnapEnabled}
              />
              {hasHydrated && automaticProbeDraft.showPath ? (
                <svg
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 z-10 h-full w-full text-foreground/40"
                  data-testid="logo-menger-automatic-probe-path"
                  preserveAspectRatio="none"
                  viewBox="0 0 1 1"
                >
                  <polyline
                    fill="none"
                    points={automaticProbePathPoints}
                    stroke="currentColor"
                    strokeDasharray="4 4"
                    strokeLinecap="round"
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              ) : null}
            </div>
          </div>
        ) : (
          <MengerDepthTransitionScene
            elevationDegrees={view.elevationDegrees}
            faceColors={faceColors}
            model={transitionModel}
            onInteractionEnd={commitView}
            onViewChange={setView}
            progress={progress}
            rotationDegrees={view.rotationDegrees}
            viewSnapEnabled={routeState.viewSnapEnabled}
          />
        )}
      </div>
    </AppWorkspaceRouteChrome>
  );
}
