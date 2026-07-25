import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import { Button } from "@/components/ui/button";
import { getTailwindColorHex } from "@/components/logo/logoTailwindColors";
import { readLogoRouteRenderState } from "@/components/logo/logoRouteRenderState";
import { useResolvedAppThemeColorState } from "@/lib/appThemeColorSearch";
import {
  buildLogoCarpetHoverRouteSearch,
  preserveLogoRouteDevModeSearch,
  type LogoCarpetHoverRouteSearch,
} from "@/routeSearch/logo";
import {
  SIERPINSKI_CARPET_HOVER_DEFAULT_DEPTH,
  SIERPINSKI_CARPET_HOVER_DEFAULT_FALLOFF,
  SIERPINSKI_CARPET_HOVER_DEFAULT_MECHANIC,
  SIERPINSKI_CARPET_HOVER_DEFAULT_REVEAL_RADIUS,
  SIERPINSKI_CARPET_HOVER_DEPTHS,
  SIERPINSKI_CARPET_HOVER_HOLES,
  SIERPINSKI_CARPET_HOVER_MAX_DEPTH,
  SIERPINSKI_CARPET_HOVER_MAX_REVEAL_RADIUS,
  SIERPINSKI_CARPET_HOVER_MIN_REVEAL_RADIUS,
  normalizeSierpinskiCarpetHoverRevealRadius,
  readSierpinskiCarpetHoleOpenness,
  readSierpinskiCarpetHoleRevealedRect,
  readSierpinskiCarpetHoverDepth,
  type SierpinskiCarpetHoverConfig,
  type SierpinskiCarpetHoverDepth,
  type SierpinskiCarpetHoverFalloff,
  type SierpinskiCarpetHoverMechanic,
  type SierpinskiCarpetHoverPointer,
} from "@samebase/logo-model/sierpinski-carpet-hover";
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

const CARPET_FRAME_PADDING = 1.12;
const RENDER_PIXEL_RATIO_MAX = 2;
const OPENNESS_LERP_PER_FRAME = 0.25;
const OPENNESS_SETTLE_EPSILON = 0.001;
const REVEAL_RADIUS_SLIDER_STEPS = 100;

const HOLE_COUNTS_BY_DEPTH = SIERPINSKI_CARPET_HOVER_DEPTHS.map((depth) => ({
  count: SIERPINSKI_CARPET_HOVER_HOLES.filter((hole) => hole.depth === depth).length,
  depth,
}));

/**
The carpet is the largest centered square that keeps the same breathing room
the menger scene gives its frustum. Pointer math and painting must share this
frame so unit coordinates line up with drawn pixels.
*/
function readCarpetFrame(width: number, height: number) {
  const side = Math.min(width, height) / CARPET_FRAME_PADDING;

  return {
    originX: (width - side) / 2,
    originY: (height - side) / 2,
    side,
  };
}

function SierpinskiCarpetHoverScene({
  carpetColor,
  config,
}: {
  carpetColor: string;
  config: SierpinskiCarpetHoverConfig & { mechanic: SierpinskiCarpetHoverMechanic };
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const carpetColorRef = useRef(carpetColor);
  const configRef = useRef(config);
  const pointerRef = useRef<SierpinskiCarpetHoverPointer | null>(null);
  // Slide direction outlives the hover so healing wipes keep their anchor
  // edge after the pointer leaves the page.
  const lastPointerRef = useRef<SierpinskiCarpetHoverPointer | null>(null);
  const opennessRef = useRef(new Float64Array(SIERPINSKI_CARPET_HOVER_HOLES.length));
  const frameRef = useRef(0);
  const prefersReducedMotionRef = useRef(false);
  const drawRef = useRef<() => void>(() => {});

  const scheduleFrame = useCallback(() => {
    if (frameRef.current !== 0) {
      return;
    }

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = 0;
      drawRef.current();
    });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!container || !canvas || !context) {
      return;
    }

    const draw = () => {
      const pixelRatio = Math.min(window.devicePixelRatio, RENDER_PIXEL_RATIO_MAX);
      const width = canvas.width / pixelRatio;
      const height = canvas.height / pixelRatio;
      const frame = readCarpetFrame(width, height);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);
      context.fillStyle = carpetColorRef.current;
      context.fillRect(frame.originX, frame.originY, frame.side, frame.side);

      const openness = opennessRef.current;
      let settled = true;
      for (const [index, hole] of SIERPINSKI_CARPET_HOVER_HOLES.entries()) {
        const target = readSierpinskiCarpetHoleOpenness(
          hole,
          pointerRef.current,
          configRef.current,
        );
        const current = openness[index] ?? 0;
        let next = prefersReducedMotionRef.current
          ? target
          : current + (target - current) * OPENNESS_LERP_PER_FRAME;
        if (Math.abs(next - target) < OPENNESS_SETTLE_EPSILON) {
          next = target;
        } else {
          settled = false;
        }
        openness[index] = next;

        const revealedRect = readSierpinskiCarpetHoleRevealedRect(
          hole,
          next,
          configRef.current.mechanic,
          pointerRef.current ?? lastPointerRef.current,
        );
        if (revealedRect) {
          context.clearRect(
            frame.originX + revealedRect.x * frame.side,
            frame.originY + revealedRect.y * frame.side,
            revealedRect.width * frame.side,
            revealedRect.height * frame.side,
          );
        }
      }

      container.dataset.carpetSettled = settled ? "true" : "false";
      if (!settled) {
        scheduleFrame();
      }
    };

    const resizeCanvas = () => {
      const pixelRatio = Math.min(window.devicePixelRatio, RENDER_PIXEL_RATIO_MAX);
      canvas.width = Math.max(Math.round(container.clientWidth * pixelRatio), 1);
      canvas.height = Math.max(Math.round(container.clientHeight * pixelRatio), 1);
      draw();
    };

    const readUnitPointer = (event: PointerEvent): SierpinskiCarpetHoverPointer | null => {
      const bounds = container.getBoundingClientRect();
      const frame = readCarpetFrame(bounds.width, bounds.height);
      if (frame.side <= 0) {
        return null;
      }

      return {
        x: (event.clientX - bounds.left - frame.originX) / frame.side,
        y: (event.clientY - bounds.top - frame.originY) / frame.side,
      };
    };
    // The reveal tracks the pointer across the whole page, not only the
    // canvas, so nearby holes keep reacting while the mouse is over the
    // chrome. Healing starts when the pointer leaves the page or a touch or
    // pen lifts; a released mouse keeps hovering.
    const onWindowPointerMove = (event: PointerEvent) => {
      if (!event.isPrimary) {
        return;
      }

      pointerRef.current = readUnitPointer(event);
      lastPointerRef.current = pointerRef.current ?? lastPointerRef.current;
      scheduleFrame();
    };
    const onWindowPointerEnd = (event: PointerEvent) => {
      if (!event.isPrimary || event.pointerType === "mouse") {
        return;
      }

      pointerRef.current = null;
      scheduleFrame();
    };
    const onPagePointerLeave = () => {
      pointerRef.current = null;
      scheduleFrame();
    };
    window.addEventListener("pointermove", onWindowPointerMove);
    window.addEventListener("pointerup", onWindowPointerEnd);
    window.addEventListener("pointercancel", onWindowPointerEnd);
    document.documentElement.addEventListener("pointerleave", onPagePointerLeave);

    drawRef.current = draw;
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    prefersReducedMotionRef.current = reducedMotionQuery.matches;
    const onReducedMotionChange = (event: MediaQueryListEvent) => {
      prefersReducedMotionRef.current = event.matches;
      scheduleFrame();
    };
    reducedMotionQuery.addEventListener("change", onReducedMotionChange);
    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(container);
    resizeCanvas();

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", onWindowPointerMove);
      window.removeEventListener("pointerup", onWindowPointerEnd);
      window.removeEventListener("pointercancel", onWindowPointerEnd);
      document.documentElement.removeEventListener("pointerleave", onPagePointerLeave);
      reducedMotionQuery.removeEventListener("change", onReducedMotionChange);
      drawRef.current = () => {};
      if (frameRef.current !== 0) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = 0;
      }
    };
  }, [scheduleFrame]);

  useEffect(() => {
    configRef.current = config;
    carpetColorRef.current = carpetColor;
    drawRef.current();
  }, [carpetColor, config]);

  return (
    <div
      ref={containerRef}
      aria-label="Sierpinski carpet hover reveal"
      className="h-full min-h-0 w-full cursor-crosshair touch-none select-none"
      data-testid="logo-carpet-hover-scene"
      role="img"
    >
      <canvas ref={canvasRef} aria-hidden="true" className="block h-full w-full" />
    </div>
  );
}

export function LogoSierpinskiCarpetHoverPage({
  replaceRouteSearch,
  routeSearch,
}: {
  replaceRouteSearch: (nextSearch: LogoCarpetHoverRouteSearch) => void;
  routeSearch: LogoCarpetHoverRouteSearch;
}) {
  const routeState = useMemo(
    () =>
      readLogoRouteRenderState({
        renderMode: "raster",
        routeSearch,
      }),
    [routeSearch],
  );
  const { backgroundColor, faceColors } = useResolvedAppThemeColorState(routeState.themeColors);
  const carpetColor = getTailwindColorHex(faceColors.right);
  const searchMechanic = routeSearch.mechanic ?? SIERPINSKI_CARPET_HOVER_DEFAULT_MECHANIC;
  const searchFalloff = routeSearch.falloff ?? SIERPINSKI_CARPET_HOVER_DEFAULT_FALLOFF;
  const searchRevealRadius = normalizeSierpinskiCarpetHoverRevealRadius(
    routeSearch.radius ?? SIERPINSKI_CARPET_HOVER_DEFAULT_REVEAL_RADIUS,
  );
  const searchMaxDepth = readSierpinskiCarpetHoverDepth(
    routeSearch.depth ?? SIERPINSKI_CARPET_HOVER_DEFAULT_DEPTH,
  );
  const [mechanic, setMechanic] = useState(searchMechanic);
  const [falloff, setFalloff] = useState(searchFalloff);
  const [revealRadius, setRevealRadius] = useState(searchRevealRadius);
  const [maxDepth, setMaxDepth] = useState(searchMaxDepth);

  // External URL edits (route URL editor, back/forward) override any
  // in-flight local drafts before paint.
  useLayoutEffect(() => {
    setMechanic(searchMechanic);
    setFalloff(searchFalloff);
    setRevealRadius(searchRevealRadius);
    setMaxDepth(searchMaxDepth);
  }, [searchFalloff, searchMaxDepth, searchMechanic, searchRevealRadius]);

  const config = useMemo(
    () => ({ falloff, maxDepth, mechanic, revealRadius }),
    [falloff, maxDepth, mechanic, revealRadius],
  );

  const commitSettings = useCallback(
    (next: {
      falloff: SierpinskiCarpetHoverFalloff;
      maxDepth: SierpinskiCarpetHoverDepth;
      mechanic: SierpinskiCarpetHoverMechanic;
      revealRadius: number;
    }) => {
      replaceRouteSearch(
        preserveLogoRouteDevModeSearch(
          buildLogoCarpetHoverRouteSearch({
            ...routeState,
            carpetFalloff: next.falloff,
            carpetMechanic: next.mechanic,
            carpetRevealDepth: next.maxDepth,
            carpetRevealRadius: next.revealRadius,
            themeModeSearch: routeSearch,
          }),
          routeSearch,
        ),
      );
    },
    [replaceRouteSearch, routeSearch, routeState],
  );
  const updateMechanic = useCallback(
    (nextMechanic: SierpinskiCarpetHoverMechanic) => {
      setMechanic(nextMechanic);
      commitSettings({ falloff, maxDepth, mechanic: nextMechanic, revealRadius });
    },
    [commitSettings, falloff, maxDepth, revealRadius],
  );
  const updateFalloff = useCallback(
    (nextFalloff: SierpinskiCarpetHoverFalloff) => {
      setFalloff(nextFalloff);
      commitSettings({ falloff: nextFalloff, maxDepth, mechanic, revealRadius });
    },
    [commitSettings, maxDepth, mechanic, revealRadius],
  );
  const updateRevealRadius = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setRevealRadius(
      normalizeSierpinskiCarpetHoverRevealRadius(
        Number(event.target.value) / REVEAL_RADIUS_SLIDER_STEPS,
      ),
    );
  }, []);
  const updateMaxDepth = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setMaxDepth(readSierpinskiCarpetHoverDepth(Number(event.target.value)));
  }, []);
  // Sliders render live through local state and publish to the URL when the
  // pointer or keyboard interaction ends, keeping history replaces sparse.
  const commitDraftSettings = useCallback(() => {
    commitSettings({ falloff, maxDepth, mechanic, revealRadius });
  }, [commitSettings, falloff, maxDepth, mechanic, revealRadius]);

  const controlsContent = useMemo(
    () => (
      <div className="grid content-start gap-4 p-3" data-testid="logo-carpet-hover-controls">
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
            Carpet hover
          </div>
        </div>

        <div className="grid gap-2">
          <div className="text-xs">Mechanic</div>
          <div className="flex items-center gap-2">
            <Button
              aria-pressed={mechanic === "grow"}
              className="rounded-none"
              onClick={() => {
                updateMechanic("grow");
              }}
              size="sm"
              variant={mechanic === "grow" ? "default" : "outline"}
            >
              Grow
            </Button>
            <Button
              aria-pressed={mechanic === "slide"}
              className="rounded-none"
              onClick={() => {
                updateMechanic("slide");
              }}
              size="sm"
              variant={mechanic === "slide" ? "default" : "outline"}
            >
              Slide
            </Button>
          </div>
        </div>

        <div className="grid gap-2">
          <div className="text-xs">Falloff</div>
          <div className="flex items-center gap-2">
            <Button
              aria-pressed={falloff === "per-depth"}
              className="rounded-none"
              onClick={() => {
                updateFalloff("per-depth");
              }}
              size="sm"
              variant={falloff === "per-depth" ? "default" : "outline"}
            >
              Per-depth
            </Button>
            <Button
              aria-pressed={falloff === "shared"}
              className="rounded-none"
              onClick={() => {
                updateFalloff("shared");
              }}
              size="sm"
              variant={falloff === "shared" ? "default" : "outline"}
            >
              Shared
            </Button>
          </div>
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="carpet-hover-reveal-radius">Reveal radius</label>
            <output
              className="font-mono text-xs text-muted-foreground"
              htmlFor="carpet-hover-reveal-radius"
            >
              {revealRadius.toFixed(2)}
            </output>
          </div>
          <input
            id="carpet-hover-reveal-radius"
            aria-label="Reveal radius"
            className="h-2 w-full cursor-pointer accent-foreground"
            max={Math.round(SIERPINSKI_CARPET_HOVER_MAX_REVEAL_RADIUS * REVEAL_RADIUS_SLIDER_STEPS)}
            min={Math.round(SIERPINSKI_CARPET_HOVER_MIN_REVEAL_RADIUS * REVEAL_RADIUS_SLIDER_STEPS)}
            onBlur={commitDraftSettings}
            onChange={updateRevealRadius}
            onKeyUp={commitDraftSettings}
            onPointerUp={commitDraftSettings}
            step="1"
            type="range"
            value={Math.round(revealRadius * REVEAL_RADIUS_SLIDER_STEPS)}
          />
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="carpet-hover-max-depth">Reveal depth</label>
            <output
              className="font-mono text-xs text-muted-foreground"
              htmlFor="carpet-hover-max-depth"
            >
              {maxDepth}
            </output>
          </div>
          <input
            id="carpet-hover-max-depth"
            aria-label="Reveal depth"
            className="h-2 w-full cursor-pointer accent-foreground"
            max={SIERPINSKI_CARPET_HOVER_MAX_DEPTH}
            min="1"
            onBlur={commitDraftSettings}
            onChange={updateMaxDepth}
            onKeyUp={commitDraftSettings}
            onPointerUp={commitDraftSettings}
            step="1"
            type="range"
            value={maxDepth}
          />
        </div>

        <div className="grid gap-1 border-t pt-3 font-mono text-xs text-muted-foreground">
          {HOLE_COUNTS_BY_DEPTH.map(({ count, depth }) => (
            <div key={depth}>
              {count} depth-{depth} {count === 1 ? "hole" : "holes"}
            </div>
          ))}
          <div>{SIERPINSKI_CARPET_HOVER_HOLES.length} total</div>
        </div>
      </div>
    ),
    [
      commitDraftSettings,
      falloff,
      maxDepth,
      mechanic,
      revealRadius,
      updateFalloff,
      updateMaxDepth,
      updateMechanic,
      updateRevealRadius,
    ],
  );
  const leftPane = useMemo(() => ({ content: controlsContent }), [controlsContent]);

  return (
    <AppWorkspaceRouteChrome left={leftPane}>
      <div
        className="h-full min-h-0 w-full"
        data-falloff={falloff}
        data-max-depth={maxDepth}
        data-mechanic={mechanic}
        data-reveal-radius={revealRadius.toFixed(2)}
        data-testid="logo-carpet-hover-page"
        style={{ backgroundColor }}
      >
        <SierpinskiCarpetHoverScene carpetColor={carpetColor} config={config} />
      </div>
    </AppWorkspaceRouteChrome>
  );
}
