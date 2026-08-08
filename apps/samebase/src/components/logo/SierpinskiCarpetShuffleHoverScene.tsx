import {
  readSierpinskiCarpetHoleOpenness,
  readSierpinskiCarpetHoleRevealedRect,
  readSierpinskiCarpetHoverDepth,
  type SierpinskiCarpetHoverConfig,
  type SierpinskiCarpetHoverHole,
  type SierpinskiCarpetHoverMechanic,
  type SierpinskiCarpetHoverPointer,
} from "@samebase/logo-model/sierpinski-carpet-hover";
import {
  easeLogoShuffleProgress,
  LOGO_SHUFFLE_MOVE_DURATION_MS,
} from "@samebase/logo-model/shuffle";
import { useCallback, useEffect, useRef, useState } from "react";

const CARPET_FRAME_PADDING = 1.12;
const RENDER_PIXEL_RATIO_MAX = 2;
const OPENNESS_SMOOTHING_TAU_MS = 58;
const OPENNESS_SETTLE_EPSILON = 0.001;
const FRAME_ELAPSED_MAX_MS = 100;
const FRAME_ELAPSED_RESTART_MS = 1000 / 60;
const SHUFFLE_INITIAL_DELAY_MS = 700;
const SHUFFLE_REST_MS = 500;

export const SIERPINSKI_CARPET_SHUFFLE_HOVER_MAX_DEPTH = 3;

const CARPET_TILES = [
  { column: 0, id: "top-left", row: 0 },
  { column: 1, id: "top", row: 0 },
  { column: 2, id: "top-right", row: 0 },
  { column: 0, id: "left", row: 1 },
  { column: 2, id: "right", row: 1 },
  { column: 0, id: "bottom-left", row: 2 },
  { column: 1, id: "bottom", row: 2 },
  { column: 2, id: "bottom-right", row: 2 },
] as const;

type CarpetTileId = (typeof CARPET_TILES)[number]["id"];

type CarpetCell = {
  column: number;
  row: number;
};

type CarpetShuffleMove = {
  from: CarpetCell;
  startTimeMs: number;
  tileId: CarpetTileId;
  to: CarpetCell;
};

type ClientPoint = {
  x: number;
  y: number;
};

type CarpetFrame = {
  originX: number;
  originY: number;
  side: number;
};

export type SierpinskiCarpetShuffleHoverSceneConfig = SierpinskiCarpetHoverConfig & {
  mechanic: SierpinskiCarpetHoverMechanic;
};

function readCarpetFrame(width: number, height: number): CarpetFrame {
  const side = Math.min(width, height) / CARPET_FRAME_PADDING;

  return {
    originX: (width - side) / 2,
    originY: (height - side) / 2,
    side,
  };
}

function createInitialTilePositions(): Map<CarpetTileId, CarpetCell> {
  const positions = new Map<CarpetTileId, CarpetCell>();
  for (const tile of CARPET_TILES) {
    positions.set(tile.id, { column: tile.column, row: tile.row });
  }
  return positions;
}

function readCellKey(cell: CarpetCell): string {
  return `${cell.column},${cell.row}`;
}

function readMoveProgress(move: CarpetShuffleMove, timestampMs: number): number {
  return Math.min(Math.max((timestampMs - move.startTimeMs) / LOGO_SHUFFLE_MOVE_DURATION_MS, 0), 1);
}

function readTilePosition(
  tileId: CarpetTileId,
  positions: Map<CarpetTileId, CarpetCell>,
  move: CarpetShuffleMove | null,
  progress: number,
): CarpetCell {
  const position = positions.get(tileId);
  if (!position) {
    throw new Error("Every carpet tile must keep one current cell.");
  }
  if (!move || move.tileId !== tileId) {
    return position;
  }

  const travelProgress = easeLogoShuffleProgress(progress);
  return {
    column: move.from.column + (move.to.column - move.from.column) * travelProgress,
    row: move.from.row + (move.to.row - move.from.row) * travelProgress,
  };
}

function selectNextMove(
  positions: Map<CarpetTileId, CarpetCell>,
  hole: CarpetCell,
  lastMovedTileId: CarpetTileId | null,
  startTimeMs: number,
): CarpetShuffleMove | null {
  const candidates: { position: CarpetCell; tileId: CarpetTileId }[] = [];
  for (const tile of CARPET_TILES) {
    if (tile.id === lastMovedTileId) {
      continue;
    }
    const position = positions.get(tile.id);
    if (!position) {
      throw new Error("Every carpet tile must keep one current cell.");
    }
    const distance = Math.abs(position.column - hole.column) + Math.abs(position.row - hole.row);
    if (distance === 1) {
      candidates.push({ position, tileId: tile.id });
    }
  }

  const selected = candidates.at(Math.floor(Math.random() * candidates.length));
  if (!selected) {
    return null;
  }

  return {
    from: { ...selected.position },
    startTimeMs,
    tileId: selected.tileId,
    to: { ...hole },
  };
}

/**
The flat shuffle study uses the same live motif at every recursive scale. One
stable tile identity leaves its source, travels to the current hole, and
docks there. At depth one, the moving square leaves a growing opening behind
it and covers the shrinking opening in front of it. Pointer-controlled masks
reveal that same source, mover, and destination layout at deeper scales. Hover
changes the visible recursive layers, not the shuffle state.
*/
export function SierpinskiCarpetShuffleHoverScene({
  carpetColor,
  config,
  touchReveal,
}: {
  carpetColor: string;
  config: SierpinskiCarpetShuffleHoverSceneConfig;
  touchReveal: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const carpetColorRef = useRef(carpetColor);
  const configRef = useRef(config);
  const touchRevealRef = useRef(touchReveal);
  const clientPointerRef = useRef<ClientPoint | null>(null);
  const lastClientPointerRef = useRef<ClientPoint | null>(null);
  const frameRef = useRef(0);
  const lastFrameTimeRef = useRef<number | null>(null);
  const prefersReducedMotionRef = useRef(false);
  const visibleRef = useRef(true);
  const drawRef = useRef<(timestampMs?: number) => void>(() => {});
  const sceneReadyRef = useRef(false);
  const [isSceneReady, setIsSceneReady] = useState(false);
  const [opennessByHole] = useState(() => new Map<string, number>());

  const scheduleFrame = useCallback(() => {
    if (frameRef.current !== 0 || !visibleRef.current) {
      return;
    }

    frameRef.current = window.requestAnimationFrame((timestampMs) => {
      frameRef.current = 0;
      drawRef.current(timestampMs);
    });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!container || !canvas || !context) {
      return;
    }

    const tilePositions = createInitialTilePositions();
    let hole: CarpetCell = { column: 1, row: 1 };
    let activeMove: CarpetShuffleMove | null = null;
    let lastMovedTileId: CarpetTileId | null = null;
    let nextMoveAllowedAtMs = performance.now() + SHUFFLE_INITIAL_DELAY_MS;
    let completedMoveCount = 0;
    let lastCompletedMove: CarpetShuffleMove | null = null;

    const toUnitPointer = (
      clientPoint: ClientPoint | null,
    ): SierpinskiCarpetHoverPointer | null => {
      if (clientPoint === null) {
        return null;
      }

      const bounds = container.getBoundingClientRect();
      const frame = readCarpetFrame(bounds.width, bounds.height);
      if (frame.side <= 0) {
        return null;
      }

      return {
        x: (clientPoint.x - bounds.left - frame.originX) / frame.side,
        y: (clientPoint.y - bounds.top - frame.originY) / frame.side,
      };
    };

    const draw = (timestampMs?: number) => {
      const pixelRatio = Math.min(window.devicePixelRatio, RENDER_PIXEL_RATIO_MAX);
      const width = canvas.width / pixelRatio;
      const height = canvas.height / pixelRatio;
      if (width <= 1 && height <= 1) {
        return;
      }

      const now = timestampMs ?? performance.now();
      if (activeMove) {
        const progress = readMoveProgress(activeMove, now);
        if (progress >= 1) {
          tilePositions.set(activeMove.tileId, { ...activeMove.to });
          hole = { ...activeMove.from };
          lastMovedTileId = activeMove.tileId;
          lastCompletedMove = activeMove;
          activeMove = null;
          completedMoveCount += 1;
          nextMoveAllowedAtMs = now + SHUFFLE_REST_MS;
        }
      }
      if (!activeMove && now >= nextMoveAllowedAtMs) {
        activeMove = selectNextMove(tilePositions, hole, lastMovedTileId, now);
      }

      const move = activeMove;
      const progress = move ? readMoveProgress(move, now) : 0;
      const previousFrameTime = lastFrameTimeRef.current;
      lastFrameTimeRef.current = now;
      const elapsedMs =
        previousFrameTime === null
          ? FRAME_ELAPSED_RESTART_MS
          : Math.min(Math.max(now - previousFrameTime, 0), FRAME_ELAPSED_MAX_MS);
      const smoothing = prefersReducedMotionRef.current
        ? 1
        : 1 - Math.exp(-elapsedMs / OPENNESS_SMOOTHING_TAU_MS);

      const frame = readCarpetFrame(width, height);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);
      context.fillStyle = carpetColorRef.current;

      const pointer = toUnitPointer(clientPointerRef.current);
      const directionPointer = pointer ?? toUnitPointer(lastClientPointerRef.current);
      const maxDepth = readSierpinskiCarpetHoverDepth(
        Math.min(configRef.current.maxDepth, SIERPINSKI_CARPET_SHUFFLE_HOVER_MAX_DEPTH),
      );
      const activeHoleKeys = new Set<string>();
      const unsettledHoleKeys = new Set<string>();
      const visibleDepths = new Set<number>([1]);

      const paintPattern = (
        originX: number,
        originY: number,
        size: number,
        depthNumber: number,
        parentPath: string,
      ) => {
        context.fillRect(
          frame.originX + originX * frame.side,
          frame.originY + originY * frame.side,
          size * frame.side,
          size * frame.side,
        );

        if (depthNumber > maxDepth) {
          return;
        }

        const depth = readSierpinskiCarpetHoverDepth(depthNumber);
        const emptyCells = move ? [move.from, move.to] : [hole];
        for (const emptyCell of emptyCells) {
          const holeSize = size / 3;
          const hoverHole: SierpinskiCarpetHoverHole = {
            centerX: originX + (emptyCell.column + 0.5) * holeSize,
            centerY: originY + (emptyCell.row + 0.5) * holeSize,
            depth,
            size: holeSize,
          };
          const holeKey = `${parentPath}:${readCellKey(emptyCell)}`;
          activeHoleKeys.add(holeKey);
          const target = readSierpinskiCarpetHoleOpenness(hoverHole, pointer, configRef.current);
          const current = opennessByHole.get(holeKey) ?? (depth === 1 ? 1 : 0);
          let next = current + (target - current) * smoothing;
          if (Math.abs(next - target) < OPENNESS_SETTLE_EPSILON) {
            next = target;
          } else {
            unsettledHoleKeys.add(holeKey);
          }
          opennessByHole.set(holeKey, next);
          if (next > OPENNESS_SETTLE_EPSILON) {
            visibleDepths.add(depth);
          }

          const revealedRect = readSierpinskiCarpetHoleRevealedRect(
            hoverHole,
            next,
            configRef.current.mechanic,
            directionPointer,
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

        const childSize = size / 3;
        for (const tile of CARPET_TILES) {
          const tilePosition = readTilePosition(tile.id, tilePositions, move, progress);
          paintPattern(
            originX + tilePosition.column * childSize,
            originY + tilePosition.row * childSize,
            childSize,
            depthNumber + 1,
            `${parentPath}/${tile.id}`,
          );
        }
      };

      paintPattern(0, 0, 1, 1, "root");
      for (const holeKey of opennessByHole.keys()) {
        if (!activeHoleKeys.has(holeKey)) {
          opennessByHole.delete(holeKey);
        }
      }

      container.dataset["carpetSettled"] = unsettledHoleKeys.size === 0 ? "true" : "false";
      container.dataset["carpetShufflePhase"] = move ? "moving" : "resting";
      container.dataset["carpetShuffleCompletedMoveCount"] = String(completedMoveCount);
      container.dataset["carpetShuffleCurrentHole"] = readCellKey(hole);
      container.dataset["carpetHoverVisibleDepths"] = [...visibleDepths]
        .sort((left, right) => left - right)
        .join(",");
      if (move) {
        const tilePosition = readTilePosition(move.tileId, tilePositions, move, progress);
        container.dataset["carpetShuffleMoveFrom"] = readCellKey(move.from);
        container.dataset["carpetShuffleMoveTo"] = readCellKey(move.to);
        container.dataset["carpetShuffleMoveProgress"] = progress.toFixed(6);
        container.dataset["carpetShuffleMoveTravelProgress"] =
          easeLogoShuffleProgress(progress).toFixed(6);
        container.dataset["carpetShuffleMovingTileId"] = move.tileId;
        container.dataset["carpetShuffleMovingTilePosition"] =
          `${tilePosition.column.toFixed(6)},${tilePosition.row.toFixed(6)}`;
      } else {
        delete container.dataset["carpetShuffleMoveFrom"];
        delete container.dataset["carpetShuffleMoveTo"];
        delete container.dataset["carpetShuffleMoveProgress"];
        delete container.dataset["carpetShuffleMoveTravelProgress"];
        delete container.dataset["carpetShuffleMovingTileId"];
        delete container.dataset["carpetShuffleMovingTilePosition"];
      }
      if (lastCompletedMove) {
        container.dataset["carpetShuffleLastCompletedMoveFrom"] = readCellKey(
          lastCompletedMove.from,
        );
        container.dataset["carpetShuffleLastCompletedMoveTo"] = readCellKey(lastCompletedMove.to);
      }

      if (!sceneReadyRef.current) {
        sceneReadyRef.current = true;
        setIsSceneReady(true);
      }
      scheduleFrame();
    };

    const resizeCanvas = () => {
      const pixelRatio = Math.min(window.devicePixelRatio, RENDER_PIXEL_RATIO_MAX);
      canvas.width = Math.max(Math.round(container.clientWidth * pixelRatio), 1);
      canvas.height = Math.max(Math.round(container.clientHeight * pixelRatio), 1);
      if (visibleRef.current) {
        draw();
      }
    };

    const onWindowPointerMove = (event: PointerEvent) => {
      if (!event.isPrimary || (event.pointerType === "touch" && !touchRevealRef.current)) {
        return;
      }
      clientPointerRef.current = { x: event.clientX, y: event.clientY };
      lastClientPointerRef.current = clientPointerRef.current;
      scheduleFrame();
    };
    const onWindowPointerEnd = (event: PointerEvent) => {
      if (!event.isPrimary || event.pointerType === "mouse") {
        return;
      }
      if (event.pointerType === "touch" && !touchRevealRef.current) {
        return;
      }
      clientPointerRef.current = null;
      scheduleFrame();
    };
    const onPagePointerLeave = () => {
      clientPointerRef.current = null;
      scheduleFrame();
    };
    const onAnyScroll = () => {
      scheduleFrame();
    };
    window.addEventListener("pointermove", onWindowPointerMove);
    window.addEventListener("pointerup", onWindowPointerEnd);
    window.addEventListener("pointercancel", onWindowPointerEnd);
    window.addEventListener("scroll", onAnyScroll, { capture: true, passive: true });
    document.documentElement.addEventListener("pointerleave", onPagePointerLeave);

    drawRef.current = draw;
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    prefersReducedMotionRef.current = reducedMotionQuery.matches;
    const onReducedMotionChange = (event: MediaQueryListEvent) => {
      prefersReducedMotionRef.current = event.matches;
      scheduleFrame();
    };
    reducedMotionQuery.addEventListener("change", onReducedMotionChange);
    const intersectionObserver = new IntersectionObserver((entries) => {
      const entry = entries.at(-1);
      if (!entry) {
        return;
      }

      visibleRef.current = entry.isIntersecting;
      if (entry.isIntersecting) {
        lastFrameTimeRef.current = null;
        scheduleFrame();
      }
    });
    intersectionObserver.observe(container);
    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(container);
    resizeCanvas();

    return () => {
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      window.removeEventListener("pointermove", onWindowPointerMove);
      window.removeEventListener("pointerup", onWindowPointerEnd);
      window.removeEventListener("pointercancel", onWindowPointerEnd);
      window.removeEventListener("scroll", onAnyScroll, { capture: true });
      document.documentElement.removeEventListener("pointerleave", onPagePointerLeave);
      reducedMotionQuery.removeEventListener("change", onReducedMotionChange);
      drawRef.current = () => {};
      if (frameRef.current !== 0) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = 0;
      }
    };
  }, [opennessByHole, scheduleFrame]);

  useEffect(() => {
    configRef.current = config;
    carpetColorRef.current = carpetColor;
    touchRevealRef.current = touchReveal;
    if (visibleRef.current) {
      drawRef.current();
    }
  }, [carpetColor, config, touchReveal]);

  return (
    <div
      ref={containerRef}
      aria-label="Sierpinski carpet recursive shuffle hover study"
      className={`relative h-full min-h-0 w-full select-none ${touchReveal ? "touch-none" : ""}`}
      data-carpet-ready={isSceneReady ? "true" : "false"}
      data-carpet-shuffle-study="active"
      data-testid="logo-carpet-hover-scene"
      role="img"
    >
      <canvas ref={canvasRef} aria-hidden="true" className="block h-full w-full" />
    </div>
  );
}
