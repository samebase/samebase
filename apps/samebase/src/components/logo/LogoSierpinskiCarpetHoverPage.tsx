import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import { Button } from "@/components/ui/button";
import { getTailwindColorHex } from "@/components/logo/logoTailwindColors";
import { readLogoRouteRenderState } from "@/components/logo/logoRouteRenderState";
import { SierpinskiCarpetHoverScene } from "@/components/logo/SierpinskiCarpetHoverScene";
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
  readSierpinskiCarpetHoverDepth,
  type SierpinskiCarpetHoverDepth,
  type SierpinskiCarpetHoverFalloff,
  type SierpinskiCarpetHoverMechanic,
} from "@samebase/logo-model/sierpinski-carpet-hover";
import { Link } from "@tanstack/react-router";
import { useCallback, useLayoutEffect, useMemo, useState, type ChangeEvent } from "react";

const HOLE_COUNTS_BY_DEPTH = SIERPINSKI_CARPET_HOVER_DEPTHS.map((depth) => ({
  count: SIERPINSKI_CARPET_HOVER_HOLES.filter((hole) => hole.depth === depth).length,
  depth,
}));

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
  // step="any" keeps the input's own value honest for URL-typed radii like
  // 0.055 (a step grid would snap them); slider emissions round to
  // hundredths here so dragging still produces tidy shareable values.
  const updateRevealRadius = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setRevealRadius(
      normalizeSierpinskiCarpetHoverRevealRadius(
        Math.round(Number(event.target.value) * 100) / 100,
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
              {String(revealRadius)}
            </output>
          </div>
          <input
            id="carpet-hover-reveal-radius"
            aria-label="Reveal radius"
            className="h-2 w-full cursor-pointer accent-foreground"
            max={SIERPINSKI_CARPET_HOVER_MAX_REVEAL_RADIUS}
            min={SIERPINSKI_CARPET_HOVER_MIN_REVEAL_RADIUS}
            onBlur={commitDraftSettings}
            onChange={updateRevealRadius}
            onKeyUp={commitDraftSettings}
            onPointerUp={commitDraftSettings}
            step="any"
            type="range"
            value={revealRadius}
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
        data-reveal-radius={String(revealRadius)}
        data-testid="logo-carpet-hover-page"
        style={{ backgroundColor }}
      >
        <SierpinskiCarpetHoverScene carpetColor={carpetColor} config={config} touchReveal />
      </div>
    </AppWorkspaceRouteChrome>
  );
}
