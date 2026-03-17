import { getShuffleOriginCandidates } from "@/components/logoShuffleRules";
import {
  LOGO_ISOMETRIC_CANVAS_HEIGHT,
  LOGO_ISOMETRIC_CANVAS_WIDTH,
  LOGO_ISOMETRIC_ELEVATION_DEGREES,
  LOGO_ISOMETRIC_ROTATION_DEGREES,
  drawLogoIsometricFrame,
  getIsometricAddCoordinate,
  isPointInsidePolygon,
  type IsometricVisibleFace,
} from "@/components/logoIsometricRenderer";
import { type FaceColors } from "@/components/logoTailwindColors";
import {
  createDefaultFilledVoxelSet,
  parseVoxelState,
  type VoxelCoordinate,
  type VoxelEdit,
  voxelKey,
} from "@/components/logoVoxelState";
import {
  useEffect,
  useRef,
  type MouseEvent,
  type MutableRefObject,
  type PointerEvent,
} from "react";

const CLICK_THRESHOLD_PX = 4;
const SHUFFLE_MOVE_DURATION_MS = 1800;
const SHUFFLE_MOVE_STAGGER_MS = 520;

type LogoShuffleParallelMoves = 1 | 2 | 3;

type LogoShuffleAnimationConfig = {
  enabled: boolean;
  parallelMoves: LogoShuffleParallelMoves;
};

type ActiveCubeMove = {
  durationMs: number;
  from: VoxelCoordinate;
  fromKey: string;
  hasDeparted: boolean;
  startTimeMs: number;
  to: VoxelCoordinate;
  toKey: string;
};

type SceneState = {
  activeCubeMoves: ActiveCubeMove[];
  currentFilledVoxels: Set<string>;
  homeFilledVoxels: Set<string>;
};

type SceneInteraction = {
  button: 0 | 2 | null;
  pointerId: number | null;
  startX: number;
  startY: number;
};

type SceneViewport = {
  faces: readonly IsometricVisibleFace[];
  offsetX: number;
  offsetY: number;
  pixelScale: number;
};

type NLogoIsoSceneProps = {
  backgroundColor: string;
  className?: string;
  faceColors: FaceColors;
  onVoxelEdit: (edit: VoxelEdit) => void;
  shuffleAnimation: LogoShuffleAnimationConfig;
  voxelState: string;
};

function easeInOutCubic(value: number): number {
  if (value < 0.5) {
    return 4 * value * value * value;
  }

  return 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function getCubeMovePosition(
  move: ActiveCubeMove,
  progress: number,
): readonly [number, number, number] {
  const travelProgress = easeInOutCubic(progress);
  return [
    move.from[0] + (move.to[0] - move.from[0]) * travelProgress,
    move.from[1] + (move.to[1] - move.from[1]) * travelProgress,
    move.from[2] + (move.to[2] - move.from[2]) * travelProgress,
  ];
}

function randomValueFrom<T>(values: readonly T[]): T | null {
  if (values.length === 0) {
    return null;
  }

  return values[Math.floor(Math.random() * values.length)] ?? null;
}

function resetShuffleAnimation(
  sceneState: SceneState,
  lastMovedCubeKeyRef: MutableRefObject<string | null>,
) {
  sceneState.activeCubeMoves = [];
  sceneState.currentFilledVoxels = new Set(sceneState.homeFilledVoxels);
  lastMovedCubeKeyRef.current = null;
}

function scheduleNextCubeMove(
  sceneState: SceneState,
  lastMovedCubeKeyRef: MutableRefObject<string | null>,
  startTimeMs: number,
): boolean {
  const blockedKeys = new Set<string>();
  for (const move of sceneState.activeCubeMoves) {
    blockedKeys.add(move.fromKey);
    blockedKeys.add(move.toKey);
  }

  const originCandidates = getShuffleOriginCandidates({
    blockedKeys,
    elevationDegrees: LOGO_ISOMETRIC_ELEVATION_DEGREES,
    filledVoxels: sceneState.currentFilledVoxels,
    lastMovedCubeKey: lastMovedCubeKeyRef.current,
    rotationDegrees: LOGO_ISOMETRIC_ROTATION_DEGREES,
  });

  const nextMove = randomValueFrom(originCandidates);
  if (!nextMove) {
    return false;
  }

  const toCoordinate = randomValueFrom(nextMove.destinations);
  if (!toCoordinate) {
    return false;
  }

  const toKey = voxelKey(toCoordinate[0], toCoordinate[1], toCoordinate[2]);
  sceneState.activeCubeMoves.push({
    durationMs: SHUFFLE_MOVE_DURATION_MS,
    from: nextMove.from,
    fromKey: nextMove.fromKey,
    hasDeparted: false,
    startTimeMs,
    to: toCoordinate,
    toKey,
  });

  return true;
}

function syncCubeShuffleAnimation(
  sceneState: SceneState,
  lastMovedCubeKeyRef: MutableRefObject<string | null>,
  parallelMoves: LogoShuffleParallelMoves,
  timestampMs: number,
) {
  const completedMoves: ActiveCubeMove[] = [];

  for (const move of sceneState.activeCubeMoves) {
    if (!move.hasDeparted && timestampMs >= move.startTimeMs) {
      move.hasDeparted = true;
      sceneState.currentFilledVoxels.delete(move.fromKey);
    }

    if (!move.hasDeparted) {
      continue;
    }

    const progress = Math.min(
      Math.max((timestampMs - move.startTimeMs) / move.durationMs, 0),
      1,
    );

    if (progress >= 1) {
      completedMoves.push(move);
    }
  }

  if (completedMoves.length > 0) {
    const completedMoveSet = new Set(completedMoves);
    sceneState.activeCubeMoves = sceneState.activeCubeMoves.filter(
      (move) => !completedMoveSet.has(move),
    );

    for (const move of completedMoves) {
      sceneState.currentFilledVoxels.add(move.toKey);
      lastMovedCubeKeyRef.current = move.toKey;
    }
  }

  while (sceneState.activeCubeMoves.length < parallelMoves) {
    const didScheduleMove = scheduleNextCubeMove(
      sceneState,
      lastMovedCubeKeyRef,
      timestampMs + sceneState.activeCubeMoves.length * SHUFFLE_MOVE_STAGGER_MS,
    );

    if (!didScheduleMove) {
      break;
    }
  }
}

export function LogoIsoThumbnail({
  backgroundColor,
  className,
  faceColors,
  size,
  voxelState,
}: {
  backgroundColor: string;
  className?: string;
  faceColors: FaceColors;
  size: number;
  voxelState: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const filledVoxels =
      parseVoxelState(voxelState) ?? createDefaultFilledVoxelSet();
    drawLogoIsometricFrame({
      backgroundColor,
      context,
      faceColors,
      filledVoxels,
    });
  }, [backgroundColor, faceColors, voxelState]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      height={LOGO_ISOMETRIC_CANVAS_HEIGHT}
      style={{
        height: `${size}px`,
        imageRendering: "pixelated",
        width: `${size}px`,
      }}
      width={LOGO_ISOMETRIC_CANVAS_WIDTH}
    />
  );
}

export function NLogoIsoScene({
  backgroundColor,
  className,
  faceColors,
  onVoxelEdit,
  shuffleAnimation,
  voxelState,
}: NLogoIsoSceneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const backgroundColorRef = useRef(backgroundColor);
  const faceColorsRef = useRef(faceColors);
  const voxelStateRef = useRef(voxelState);
  const shuffleAnimationRef = useRef(shuffleAnimation);
  const onVoxelEditRef = useRef(onVoxelEdit);
  const sceneStateRef = useRef<SceneState | null>(null);
  const viewportRef = useRef<SceneViewport | null>(null);
  const lastMovedCubeKeyRef = useRef<string | null>(null);
  const interactionRef = useRef<SceneInteraction>({
    button: null,
    pointerId: null,
    startX: 0,
    startY: 0,
  });

  useEffect(() => {
    backgroundColorRef.current = backgroundColor;
  }, [backgroundColor]);

  useEffect(() => {
    faceColorsRef.current = faceColors;
  }, [faceColors]);

  useEffect(() => {
    onVoxelEditRef.current = onVoxelEdit;
  }, [onVoxelEdit]);

  useEffect(() => {
    const wasEnabled = shuffleAnimationRef.current.enabled;
    shuffleAnimationRef.current = shuffleAnimation;

    const sceneState = sceneStateRef.current;
    if (!sceneState) {
      return;
    }

    if (wasEnabled !== shuffleAnimation.enabled) {
      resetShuffleAnimation(sceneState, lastMovedCubeKeyRef);
    }
  }, [shuffleAnimation]);

  useEffect(() => {
    voxelStateRef.current = voxelState;

    const sceneState = sceneStateRef.current;
    if (!sceneState) {
      return;
    }

    const nextFilledVoxels =
      parseVoxelState(voxelState) ?? createDefaultFilledVoxelSet();
    sceneState.homeFilledVoxels = new Set(nextFilledVoxels);
    resetShuffleAnimation(sceneState, lastMovedCubeKeyRef);
  }, [voxelState]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    if (!offscreenCanvasRef.current) {
      const offscreenCanvas = document.createElement("canvas");
      offscreenCanvas.width = LOGO_ISOMETRIC_CANVAS_WIDTH;
      offscreenCanvas.height = LOGO_ISOMETRIC_CANVAS_HEIGHT;
      offscreenCanvasRef.current = offscreenCanvas;
    }

    const offscreenCanvas = offscreenCanvasRef.current;
    const offscreenContext = offscreenCanvas.getContext("2d");
    if (!offscreenContext) {
      return;
    }

    const initialFilledVoxels =
      parseVoxelState(voxelStateRef.current) ?? createDefaultFilledVoxelSet();

    sceneStateRef.current = {
      activeCubeMoves: [],
      currentFilledVoxels: new Set(initialFilledVoxels),
      homeFilledVoxels: new Set(initialFilledVoxels),
    };

    const renderScene = (timestampMs: number) => {
      const sceneState = sceneStateRef.current;
      if (!sceneState) {
        return;
      }

      const movingVoxels = sceneState.activeCubeMoves
        .filter((move) => move.hasDeparted)
        .map((move) => {
          const progress = Math.min(
            Math.max((timestampMs - move.startTimeMs) / move.durationMs, 0),
            1,
          );

          return {
            coordinate: move.from,
            position: getCubeMovePosition(move, progress),
          };
        });

      const visibleFaces = drawLogoIsometricFrame({
        backgroundColor: backgroundColorRef.current,
        context: offscreenContext,
        faceColors: faceColorsRef.current,
        filledVoxels: sceneState.currentFilledVoxels,
        movingVoxels,
      });

      const containerWidth = container.clientWidth || 640;
      const containerHeight = container.clientHeight || 768;
      const pixelScale = Math.max(
        1,
        Math.floor(
          Math.min(
            containerWidth / LOGO_ISOMETRIC_CANVAS_WIDTH,
            containerHeight / LOGO_ISOMETRIC_CANVAS_HEIGHT,
          ),
        ),
      );
      const drawWidth = LOGO_ISOMETRIC_CANVAS_WIDTH * pixelScale;
      const drawHeight = LOGO_ISOMETRIC_CANVAS_HEIGHT * pixelScale;
      const offsetX = Math.floor((containerWidth - drawWidth) / 2);
      const offsetY = Math.floor((containerHeight - drawHeight) / 2);
      const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.max(1, Math.floor(containerWidth * devicePixelRatio));
      canvas.height = Math.max(
        1,
        Math.floor(containerHeight * devicePixelRatio),
      );

      context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      context.clearRect(0, 0, containerWidth, containerHeight);
      context.fillStyle = backgroundColorRef.current;
      context.fillRect(0, 0, containerWidth, containerHeight);
      context.imageSmoothingEnabled = false;
      context.drawImage(
        offscreenCanvas,
        offsetX,
        offsetY,
        drawWidth,
        drawHeight,
      );

      viewportRef.current = {
        faces: visibleFaces,
        offsetX,
        offsetY,
        pixelScale,
      };
    };

    let animationFrameId = 0;

    const animate = (timestampMs: number) => {
      const sceneState = sceneStateRef.current;
      if (!sceneState) {
        return;
      }

      if (shuffleAnimationRef.current.enabled) {
        syncCubeShuffleAnimation(
          sceneState,
          lastMovedCubeKeyRef,
          shuffleAnimationRef.current.parallelMoves,
          timestampMs,
        );
      }

      renderScene(timestampMs);
      animationFrameId = window.requestAnimationFrame(animate);
    };

    renderScene(performance.now());
    animationFrameId = window.requestAnimationFrame(animate);

    const resizeObserver = new ResizeObserver(() => {
      renderScene(performance.now());
    });
    resizeObserver.observe(container);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      sceneStateRef.current = null;
      viewportRef.current = null;
    };
  }, []);

  const resetInteraction = (target: HTMLDivElement, pointerId: number) => {
    if (target.hasPointerCapture(pointerId)) {
      target.releasePointerCapture(pointerId);
    }

    interactionRef.current = {
      button: null,
      pointerId: null,
      startX: 0,
      startY: 0,
    };
  };

  const pickFace = (
    clientX: number,
    clientY: number,
  ): IsometricVisibleFace | null => {
    if (shuffleAnimationRef.current.enabled) {
      return null;
    }

    const canvas = canvasRef.current;
    const viewport = viewportRef.current;
    if (!canvas || !viewport) {
      return null;
    }

    const canvasRect = canvas.getBoundingClientRect();
    const x =
      (clientX - canvasRect.left - viewport.offsetX) / viewport.pixelScale;
    const y =
      (clientY - canvasRect.top - viewport.offsetY) / viewport.pixelScale;

    for (const face of [...viewport.faces].reverse()) {
      if (isPointInsidePolygon(x, y, face.polygon)) {
        return face;
      }
    }

    return null;
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 2) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    interactionRef.current = {
      button: event.button,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const interaction = interactionRef.current;
    if (
      interaction.pointerId !== event.pointerId ||
      interaction.button === null
    ) {
      return;
    }

    const travelDistance = Math.hypot(
      event.clientX - interaction.startX,
      event.clientY - interaction.startY,
    );

    if (travelDistance <= CLICK_THRESHOLD_PX) {
      const face = pickFace(event.clientX, event.clientY);
      const sceneState = sceneStateRef.current;

      if (face && sceneState) {
        if (interaction.button === 0) {
          const coordinate = getIsometricAddCoordinate(
            face,
            sceneState.currentFilledVoxels,
          );

          if (coordinate) {
            onVoxelEditRef.current({ coordinate, kind: "add" });
          }
        }

        if (interaction.button === 2) {
          onVoxelEditRef.current({
            coordinate: face.coordinate,
            kind: "remove",
          });
        }
      }
    }

    resetInteraction(event.currentTarget, event.pointerId);
  };

  const handlePointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    if (interactionRef.current.pointerId !== event.pointerId) {
      return;
    }

    resetInteraction(event.currentTarget, event.pointerId);
  };

  const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  return (
    <div
      ref={containerRef}
      className={className}
      onContextMenu={handleContextMenu}
      onPointerCancel={handlePointerCancel}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
