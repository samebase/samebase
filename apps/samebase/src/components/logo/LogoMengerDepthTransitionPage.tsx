import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import { MengerDepthTransitionScene } from "@/components/logo/MengerDepthTransitionScene";
import { MengerHoverScene } from "@/components/logo/MengerHoverScene";
import { readLogoRouteRenderState } from "@/components/logo/logoRouteRenderState";
import { type LogoViewState } from "@/components/logo/logoViewDrag";
import { Button } from "@/components/ui/button";
import { useResolvedAppThemeColorState } from "@/lib/appThemeColorSearch";
import {
  buildLogoMengerHoverRouteSearch,
  buildLogoRouteSearch,
  preserveLogoRouteDevModeSearch,
  type LogoRouteSearch,
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

export function LogoMengerDepthTransitionPage({
  mode = "transition",
  replaceRouteSearch,
  routeSearch,
}: {
  mode?: MengerResearchMode;
  replaceRouteSearch: (nextSearch: LogoRouteSearch) => void;
  routeSearch: LogoRouteSearch;
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
  const [progress, setProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackVersion, setPlaybackVersion] = useState(0);
  const [staggerGroupCount, setStaggerGroupCount] = useState(
    MENGER_DEPTH_TRANSITION_DEFAULT_STAGGER_GROUP_COUNT,
  );
  const [hoverRevealRadius, setHoverRevealRadius] = useState(MENGER_HOVER_DEFAULT_REVEAL_RADIUS);
  const [hoverMaximumDepth, setHoverMaximumDepth] = useState(searchHoverMaximumDepth);
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
  const commitHoverMaximumDepth = useCallback(() => {
    replaceRouteSearch(
      preserveLogoRouteDevModeSearch(
        buildLogoMengerHoverRouteSearch({
          ...routeState,
          elevationDegrees: view.elevationDegrees,
          mengerHoverDepth: hoverMaximumDepth,
          rotationDegrees: view.rotationDegrees,
          themeModeSearch: routeSearch,
        }),
        routeSearch,
      ),
    );
  }, [hoverMaximumDepth, replaceRouteSearch, routeSearch, routeState, view]);
  const commitView = useCallback(
    (finalView: LogoViewState) => {
      const nextSearch =
        mode === "hover"
          ? buildLogoMengerHoverRouteSearch({
              ...routeState,
              elevationDegrees: finalView.elevationDegrees,
              mengerHoverDepth: hoverMaximumDepth,
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
    [hoverMaximumDepth, mode, replaceRouteSearch, routeSearch, routeState],
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
            onBlur={commitHoverMaximumDepth}
            onChange={updateHoverMaximumDepth}
            onKeyUp={commitHoverMaximumDepth}
            onPointerUp={commitHoverMaximumDepth}
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

        <div className="grid gap-1 border-t pt-3 font-mono text-xs text-muted-foreground">
          <div>Depth 1 at rest</div>
          <div>
            {hoverMaximumDepth === 1
              ? "Pointer reveal disabled"
              : `Pointer reveals through depth ${hoverMaximumDepth}`}
          </div>
          <div>2 non-overlapping cover pieces per face</div>
        </div>
      </div>
    ),
    [
      commitHoverMaximumDepth,
      hoverMaximumDepth,
      hoverRevealRadius,
      updateHoverMaximumDepth,
      updateHoverRevealRadius,
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
        data-phase={phase}
        data-testid={
          mode === "hover" ? "logo-menger-hover-page" : "logo-menger-depth-transition-page"
        }
        style={{ backgroundColor }}
      >
        {mode === "hover" ? (
          <MengerHoverScene
            elevationDegrees={view.elevationDegrees}
            faceColors={faceColors}
            maximumDepth={hoverMaximumDepth}
            onInteractionEnd={commitView}
            onViewChange={setView}
            revealRadius={hoverRevealRadius}
            rotationDegrees={view.rotationDegrees}
            viewSnapEnabled={routeState.viewSnapEnabled}
          />
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
