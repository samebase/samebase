import { type LogoShuffleParallelMoves } from "@/components/logo/logoShuffleAnimation";
import {
  easeLogoShuffleProgress,
  getShuffleOriginCandidates,
  LOGO_SHUFFLE_MOVE_DURATION_MS,
  LOGO_SHUFFLE_MOVE_STAGGER_MS,
} from "@samebase/logo-model/shuffle";
import { clampLogoFractalDepthForRenderer } from "@/components/logo/logoDepthLimits";
import {
  DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
  LOGO_ISOMETRIC_CUBE_SIDE_PIXELS,
  LOGO_ISOMETRIC_ELEVATION_DEGREES,
  LOGO_ISOMETRIC_ROTATION_DEGREES,
  createLogoIsometricCubeCanvas,
  drawLogoIsometricFrame,
  drawLogoIsometricRecursiveFrame,
  getLogoIsometricCubeHitRows,
  getLogoIsometricFrameMetrics,
  getIsometricAddCoordinate,
  isPointInsideRowSpans,
  type IsometricVisibleFace,
  type LogoIsometricStyleId,
} from "@/components/logo/logoIsometricRenderer";
import {
  type LogoIsoCubePixelCoordinate,
  type LogoIsoCubePixelSprite,
  type LogoIsoCubePixelEditKind,
  type LogoIsoCubePixelSpritePaint,
} from "@/components/logo/logoIsoCubePixelSprite";
import { type FaceColors } from "@/components/logo/logoTailwindColors";
import {
  createDefaultFilledVoxelSet,
  DEFAULT_LOGO_FRACTAL_DEPTH,
  DEFAULT_LOGO_GRID_SIZE,
  getLogoFractalGridSize,
  type LogoGridSize,
  type LogoVoxelGrid,
  parseVoxelState,
  type VoxelCoordinate,
  type VoxelEdit,
  voxelKey,
} from "@samebase/logo-model/voxel";
import {
  useEffect,
  useRef,
  type MouseEvent,
  type MutableRefObject,
  type PointerEvent,
} from "react";

const CLICK_THRESHOLD_PX = 4;
const MIN_RECURSIVE_ISO_CUBE_SIDE_PX = 1;

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
  baseGridSize: LogoGridSize;
  currentFilledVoxels: Set<string>;
  gridSize: number;
  homeFilledVoxels: Set<string>;
  recursiveRenderDepth: number | null;
};

type SceneInteraction = {
  button: 0 | 2 | null;
  lastPixel: LogoIsoCubePixelCoordinate | null;
  pointerId: number | null;
  startX: number;
  startY: number;
};

type SceneViewport = {
  canvasHeight: number;
  canvasWidth: number;
  cubeCanvasHeight: number;
  cubeCanvasWidth: number;
  faces: readonly IsometricVisibleFace[];
  offsetX: number;
  offsetY: number;
  pixelScale: number;
};

type NLogoIsoSceneProps = {
  baseGridSize?: LogoGridSize;
  backgroundColor: string;
  className?: string;
  cubeSidePixels?: number;
  editMode: VoxelEdit["kind"];
  faceColors: FaceColors;
  fractalDepth?: number;
  isoCubePixelSprite?: LogoIsoCubePixelSprite | undefined;
  isoCubePixelTool?: LogoIsoCubePixelEditKind | null;
  onIsoCubePixelSpritePaint: (paint: LogoIsoCubePixelSpritePaint) => void;
  onVoxelEdit: (edit: VoxelEdit) => void;
  shuffleAnimation: LogoShuffleAnimationConfig;
  styleId?: LogoIsometricStyleId;
  voxelEditingEnabled?: boolean;
  voxelGrid?: LogoVoxelGrid;
  voxelState: string;
};

function getCubeMovePosition(
  move: ActiveCubeMove,
  progress: number,
): readonly [number, number, number] {
  const travelProgress = easeLogoShuffleProgress(progress);
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

function resolveSceneVoxelGrid({
  baseGridSize = DEFAULT_LOGO_GRID_SIZE,
  fractalDepth,
  voxelGrid,
  voxelState,
}: {
  baseGridSize?: LogoGridSize;
  fractalDepth: number | undefined;
  voxelGrid: LogoVoxelGrid | undefined;
  voxelState: string;
}): {
  filledVoxels: Set<string>;
  baseGridSize: LogoGridSize;
  gridSize: number;
  recursiveRenderDepth: number | null;
} {
  const normalizedFractalDepth = clampLogoFractalDepthForRenderer(
    fractalDepth ?? DEFAULT_LOGO_FRACTAL_DEPTH,
    "iso",
  );

  if (voxelGrid) {
    return {
      baseGridSize,
      filledVoxels: new Set(voxelGrid.filledVoxels),
      gridSize: voxelGrid.gridSize,
      recursiveRenderDepth: null,
    };
  }

  const parsedVoxelState = parseVoxelState(voxelState);
  const filledVoxels =
    parsedVoxelState && parsedVoxelState.gridSize === baseGridSize
      ? parsedVoxelState.filledVoxels
      : createDefaultFilledVoxelSet(baseGridSize);
  if (normalizedFractalDepth > DEFAULT_LOGO_FRACTAL_DEPTH) {
    return {
      baseGridSize,
      filledVoxels,
      gridSize: baseGridSize,
      recursiveRenderDepth: normalizedFractalDepth,
    };
  }

  return {
    baseGridSize,
    filledVoxels,
    gridSize: baseGridSize,
    recursiveRenderDepth: null,
  };
}

function getSceneRenderGridSize(sceneState: SceneState): number {
  if (!sceneState.recursiveRenderDepth) {
    return sceneState.gridSize;
  }

  return getLogoFractalGridSize(sceneState.baseGridSize, sceneState.recursiveRenderDepth);
}

function getBoundedRecursiveCubeSidePixels({
  containerHeight,
  containerWidth,
  baseGridSize,
  cubeSidePixels,
  recursiveRenderDepth,
}: {
  containerHeight: number;
  containerWidth: number;
  baseGridSize: LogoGridSize;
  cubeSidePixels: number;
  recursiveRenderDepth: number | null;
}): number {
  if (!recursiveRenderDepth) {
    return cubeSidePixels;
  }

  const renderGridSize = getLogoFractalGridSize(baseGridSize, recursiveRenderDepth);
  let nextCubeSidePixels = cubeSidePixels;
  while (nextCubeSidePixels > MIN_RECURSIVE_ISO_CUBE_SIDE_PX) {
    const frameMetrics = getLogoIsometricFrameMetrics(nextCubeSidePixels, renderGridSize);
    if (
      frameMetrics.canvasWidth <= containerWidth &&
      frameMetrics.canvasHeight <= containerHeight
    ) {
      return nextCubeSidePixels;
    }

    nextCubeSidePixels -= LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.step;
  }

  return MIN_RECURSIVE_ISO_CUBE_SIDE_PX;
}

function getIsoFramePixelScale({
  containerHeight,
  containerWidth,
  frameMetrics,
}: {
  containerHeight: number;
  containerWidth: number;
  frameMetrics: { canvasHeight: number; canvasWidth: number };
}): number {
  const rawScale = Math.min(
    containerWidth / frameMetrics.canvasWidth,
    containerHeight / frameMetrics.canvasHeight,
  );

  if (rawScale < 1) {
    return rawScale;
  }

  return Math.max(1, Math.floor(rawScale));
}

function getIsoPixelLine(
  from: LogoIsoCubePixelCoordinate,
  to: LogoIsoCubePixelCoordinate,
): readonly LogoIsoCubePixelCoordinate[] {
  const pixels: LogoIsoCubePixelCoordinate[] = [];
  let x = from.x;
  let y = from.y;
  const dx = Math.abs(to.x - from.x);
  const sx = from.x < to.x ? 1 : -1;
  const dy = -Math.abs(to.y - from.y);
  const sy = from.y < to.y ? 1 : -1;
  let error = dx + dy;

  pixels.push({ x, y });
  while (x !== to.x || y !== to.y) {
    const doubledError = error * 2;
    if (doubledError >= dy) {
      error += dy;
      x += sx;
    }
    if (doubledError <= dx) {
      error += dx;
      y += sy;
    }
    pixels.push({ x, y });
  }

  return pixels;
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
    gridSize: sceneState.gridSize,
    lastMovedCubeKey: lastMovedCubeKeyRef.current,
    rotationAxisMode: "cube-y",
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
    durationMs: LOGO_SHUFFLE_MOVE_DURATION_MS,
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

    const progress = Math.min(Math.max((timestampMs - move.startTimeMs) / move.durationMs, 0), 1);

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
      timestampMs + sceneState.activeCubeMoves.length * LOGO_SHUFFLE_MOVE_STAGGER_MS,
    );

    if (!didScheduleMove) {
      break;
    }
  }
}

export function LogoIsoThumbnail({
  baseGridSize = DEFAULT_LOGO_GRID_SIZE,
  backgroundColor,
  className,
  cubeSidePixels = LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.defaultValue,
  dataTestId,
  faceColors,
  fractalDepth,
  isoCubePixelSprite,
  size,
  styleId = DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
  voxelGrid,
  voxelState,
}: {
  baseGridSize?: LogoGridSize;
  backgroundColor: string;
  className?: string;
  cubeSidePixels?: number;
  dataTestId?: string;
  faceColors: FaceColors;
  fractalDepth?: number;
  isoCubePixelSprite?: LogoIsoCubePixelSprite | undefined;
  size: number;
  styleId?: LogoIsometricStyleId;
  voxelGrid?: LogoVoxelGrid;
  voxelState: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d", {
      willReadFrequently: true,
    });
    if (!context) {
      return;
    }

    const resolvedVoxelGrid = resolveSceneVoxelGrid({
      baseGridSize,
      fractalDepth,
      voxelGrid,
      voxelState,
    });
    const renderCubeSidePixels = resolvedVoxelGrid.recursiveRenderDepth
      ? Math.min(cubeSidePixels, MIN_RECURSIVE_ISO_CUBE_SIDE_PX)
      : cubeSidePixels;
    const frameMetrics = getLogoIsometricFrameMetrics(
      renderCubeSidePixels,
      resolvedVoxelGrid.recursiveRenderDepth
        ? getLogoFractalGridSize(
            resolvedVoxelGrid.baseGridSize,
            resolvedVoxelGrid.recursiveRenderDepth,
          )
        : resolvedVoxelGrid.gridSize,
    );
    const rasterCanvas = document.createElement("canvas");
    rasterCanvas.width = frameMetrics.canvasWidth;
    rasterCanvas.height = frameMetrics.canvasHeight;
    const rasterContext = rasterCanvas.getContext("2d", {
      willReadFrequently: true,
    });
    if (!rasterContext) {
      return;
    }

    if (resolvedVoxelGrid.recursiveRenderDepth) {
      drawLogoIsometricRecursiveFrame({
        baseGridSize: resolvedVoxelGrid.baseGridSize,
        backgroundColor,
        cubeSidePixels: renderCubeSidePixels,
        context: rasterContext,
        depth: resolvedVoxelGrid.recursiveRenderDepth,
        faceColors,
        filledVoxels: resolvedVoxelGrid.filledVoxels,
        cubePixelSprite: isoCubePixelSprite,
        styleId,
      });
    } else {
      drawLogoIsometricFrame({
        backgroundColor,
        cubeSidePixels: renderCubeSidePixels,
        context: rasterContext,
        faceColors,
        filledVoxels: resolvedVoxelGrid.filledVoxels,
        gridSize: resolvedVoxelGrid.gridSize,
        cubePixelSprite: isoCubePixelSprite,
        styleId,
      });
    }
    context.clearRect(0, 0, size, size);
    context.imageSmoothingEnabled = false;
    context.drawImage(rasterCanvas, 0, 0, size, size);
  }, [
    backgroundColor,
    baseGridSize,
    cubeSidePixels,
    faceColors,
    fractalDepth,
    isoCubePixelSprite,
    size,
    styleId,
    voxelGrid,
    voxelState,
  ]);

  return (
    <canvas
      ref={canvasRef}
      data-testid={dataTestId}
      className={className}
      height={size}
      style={{
        height: `${size}px`,
        imageRendering: "pixelated",
        width: `${size}px`,
      }}
      width={size}
    />
  );
}

export function LogoIsoCubePixelEditor({
  backgroundColor,
  cubePixelSprite,
  cubePixelTool,
  cubeSidePixels = LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.defaultValue,
  disabled = false,
  faceColors,
  onCubePixelSpritePaint,
  styleId = DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
}: {
  backgroundColor: string;
  cubePixelSprite?: LogoIsoCubePixelSprite | undefined;
  cubePixelTool: LogoIsoCubePixelEditKind | null;
  cubeSidePixels?: number;
  disabled?: boolean;
  faceColors: FaceColors;
  onCubePixelSpritePaint: (paint: LogoIsoCubePixelSpritePaint) => void;
  styleId?: LogoIsometricStyleId;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const interactionRef = useRef<SceneInteraction>({
    button: null,
    lastPixel: null,
    pointerId: null,
    startX: 0,
    startY: 0,
  });
  const frameMetrics = getLogoIsometricFrameMetrics(cubeSidePixels, 1);
  const cubeHitRows = getLogoIsometricCubeHitRows({ cubeSidePixels, styleId });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d", {
      willReadFrequently: true,
    });
    if (!context) {
      return;
    }

    const { canvas: cubeCanvas } = createLogoIsometricCubeCanvas({
      cubePixelSprite,
      cubeSidePixels,
      faceColors,
      styleId,
    });

    context.clearRect(0, 0, frameMetrics.canvasWidth, frameMetrics.canvasHeight);
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, frameMetrics.canvasWidth, frameMetrics.canvasHeight);
    context.imageSmoothingEnabled = false;
    context.drawImage(cubeCanvas, 0, 0);
  }, [backgroundColor, cubePixelSprite, cubeSidePixels, faceColors, frameMetrics, styleId]);

  const pickEditorPixel = (
    event: PointerEvent<HTMLCanvasElement>,
  ): LogoIsoCubePixelCoordinate | null => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return null;
    }

    const canvasRect = canvas.getBoundingClientRect();
    const x = Math.floor(
      ((event.clientX - canvasRect.left) / canvasRect.width) * frameMetrics.canvasWidth,
    );
    const y = Math.floor(
      ((event.clientY - canvasRect.top) / canvasRect.height) * frameMetrics.canvasHeight,
    );

    if (
      x < 0 ||
      x >= frameMetrics.canvasWidth ||
      y < 0 ||
      y >= frameMetrics.canvasHeight ||
      !isPointInsideRowSpans(x + 0.5, y + 0.5, cubeHitRows)
    ) {
      return null;
    }

    return { x, y };
  };

  const resetEditorInteraction = (target: HTMLCanvasElement, pointerId: number) => {
    if (target.hasPointerCapture(pointerId)) {
      target.releasePointerCapture(pointerId);
    }

    interactionRef.current = {
      button: null,
      lastPixel: null,
      pointerId: null,
      startX: 0,
      startY: 0,
    };
  };

  const paintEditorPixel = (event: PointerEvent<HTMLCanvasElement>, button: 0 | 2) => {
    if (disabled || !cubePixelTool) {
      return;
    }

    const pixel = pickEditorPixel(event);
    if (!pixel) {
      interactionRef.current.lastPixel = null;
      return;
    }

    const previousPixel = interactionRef.current.lastPixel;
    const pixels = previousPixel ? getIsoPixelLine(previousPixel, pixel) : [pixel];
    onCubePixelSpritePaint({
      canvasHeight: frameMetrics.canvasHeight,
      canvasWidth: frameMetrics.canvasWidth,
      cubeSidePixels,
      kind: button === 2 ? "erase" : cubePixelTool,
      pixels,
    });
    interactionRef.current.lastPixel = pixel;
  };

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 && event.button !== 2) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    interactionRef.current = {
      button: event.button,
      lastPixel: null,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
    paintEditorPixel(event, event.button);
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const interaction = interactionRef.current;
    if (interaction.pointerId !== event.pointerId || interaction.button === null) {
      return;
    }

    paintEditorPixel(event, interaction.button);
  };

  const handlePointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    const interaction = interactionRef.current;
    if (interaction.pointerId !== event.pointerId || interaction.button === null) {
      return;
    }

    resetEditorInteraction(event.currentTarget, event.pointerId);
  };

  const handlePointerCancel = (event: PointerEvent<HTMLCanvasElement>) => {
    if (interactionRef.current.pointerId !== event.pointerId) {
      return;
    }

    resetEditorInteraction(event.currentTarget, event.pointerId);
  };

  const handleContextMenu = (event: MouseEvent<HTMLCanvasElement>) => {
    event.preventDefault();
  };

  return (
    <canvas
      ref={canvasRef}
      aria-label="Cube pixel canvas"
      className={disabled ? "block w-full opacity-60" : "block w-full"}
      data-testid="logo-iso-cube-pixel-editor"
      height={frameMetrics.canvasHeight}
      onContextMenu={handleContextMenu}
      onPointerCancel={handlePointerCancel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        aspectRatio: `${frameMetrics.canvasWidth} / ${frameMetrics.canvasHeight}`,
        cursor: disabled || !cubePixelTool ? "default" : "crosshair",
        height: "auto",
        imageRendering: "pixelated",
        touchAction: "none",
        width: "100%",
      }}
      width={frameMetrics.canvasWidth}
    />
  );
}

export function NLogoIsoScene({
  baseGridSize = DEFAULT_LOGO_GRID_SIZE,
  backgroundColor,
  className,
  cubeSidePixels = LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.defaultValue,
  editMode,
  faceColors,
  fractalDepth,
  isoCubePixelSprite,
  isoCubePixelTool = null,
  onIsoCubePixelSpritePaint,
  onVoxelEdit,
  shuffleAnimation,
  styleId = DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
  voxelEditingEnabled = true,
  voxelGrid,
  voxelState,
}: NLogoIsoSceneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const baseGridSizeRef = useRef(baseGridSize);
  const backgroundColorRef = useRef(backgroundColor);
  const faceColorsRef = useRef(faceColors);
  const voxelEditingEnabledRef = useRef(voxelEditingEnabled);
  const fractalDepthRef = useRef(fractalDepth);
  const isoCubePixelSpriteRef = useRef(isoCubePixelSprite);
  const isoCubePixelToolRef = useRef(isoCubePixelTool);
  const voxelGridRef = useRef(voxelGrid);
  const voxelStateRef = useRef(voxelState);
  const shuffleAnimationRef = useRef(shuffleAnimation);
  const onIsoCubePixelSpritePaintRef = useRef(onIsoCubePixelSpritePaint);
  const onVoxelEditRef = useRef(onVoxelEdit);
  const sceneStateRef = useRef<SceneState | null>(null);
  const viewportRef = useRef<SceneViewport | null>(null);
  const renderSceneRef = useRef<(timestampMs: number) => void>(() => {});
  const syncAnimationLoopRef = useRef<() => void>(() => {});
  const lastMovedCubeKeyRef = useRef<string | null>(null);
  const interactionRef = useRef<SceneInteraction>({
    button: null,
    lastPixel: null,
    pointerId: null,
    startX: 0,
    startY: 0,
  });

  useEffect(() => {
    backgroundColorRef.current = backgroundColor;
    renderSceneRef.current(performance.now());
  }, [backgroundColor]);

  useEffect(() => {
    faceColorsRef.current = faceColors;
    renderSceneRef.current(performance.now());
  }, [faceColors]);

  useEffect(() => {
    isoCubePixelSpriteRef.current = isoCubePixelSprite;
    renderSceneRef.current(performance.now());
  }, [isoCubePixelSprite]);

  useEffect(() => {
    isoCubePixelToolRef.current = isoCubePixelTool;
  }, [isoCubePixelTool]);

  useEffect(() => {
    voxelEditingEnabledRef.current = voxelEditingEnabled;
  }, [voxelEditingEnabled]);

  useEffect(() => {
    onVoxelEditRef.current = onVoxelEdit;
  }, [onVoxelEdit]);

  useEffect(() => {
    onIsoCubePixelSpritePaintRef.current = onIsoCubePixelSpritePaint;
  }, [onIsoCubePixelSpritePaint]);

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

    syncAnimationLoopRef.current();
    renderSceneRef.current(performance.now());
  }, [shuffleAnimation]);

  useEffect(() => {
    baseGridSizeRef.current = baseGridSize;
    voxelGridRef.current = voxelGrid;
    voxelStateRef.current = voxelState;
    fractalDepthRef.current = fractalDepth;

    const sceneState = sceneStateRef.current;
    if (!sceneState) {
      return;
    }

    const nextVoxelGrid = resolveSceneVoxelGrid({
      baseGridSize,
      fractalDepth,
      voxelGrid,
      voxelState,
    });
    sceneState.baseGridSize = nextVoxelGrid.baseGridSize;
    sceneState.homeFilledVoxels = new Set(nextVoxelGrid.filledVoxels);
    sceneState.gridSize = nextVoxelGrid.gridSize;
    sceneState.recursiveRenderDepth = nextVoxelGrid.recursiveRenderDepth;
    resetShuffleAnimation(sceneState, lastMovedCubeKeyRef);
    renderSceneRef.current(performance.now());
  }, [baseGridSize, fractalDepth, voxelGrid, voxelState]);

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

    const initialVoxelGrid = resolveSceneVoxelGrid({
      baseGridSize: baseGridSizeRef.current,
      fractalDepth: fractalDepthRef.current,
      voxelGrid: voxelGridRef.current,
      voxelState: voxelStateRef.current,
    });

    if (!offscreenCanvasRef.current) {
      offscreenCanvasRef.current = document.createElement("canvas");
    }

    const offscreenCanvas = offscreenCanvasRef.current;
    const offscreenContext = offscreenCanvas.getContext("2d", {
      willReadFrequently: true,
    });
    if (!offscreenContext) {
      return;
    }

    sceneStateRef.current = {
      activeCubeMoves: [],
      baseGridSize: initialVoxelGrid.baseGridSize,
      currentFilledVoxels: new Set(initialVoxelGrid.filledVoxels),
      gridSize: initialVoxelGrid.gridSize,
      homeFilledVoxels: new Set(initialVoxelGrid.filledVoxels),
      recursiveRenderDepth: initialVoxelGrid.recursiveRenderDepth,
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

      const containerWidth = container.clientWidth || 640;
      const containerHeight = container.clientHeight || 768;
      const renderCubeSidePixels = getBoundedRecursiveCubeSidePixels({
        baseGridSize: sceneState.baseGridSize,
        containerHeight,
        containerWidth,
        cubeSidePixels,
        recursiveRenderDepth: sceneState.recursiveRenderDepth,
      });
      const frameMetrics = getLogoIsometricFrameMetrics(
        renderCubeSidePixels,
        getSceneRenderGridSize(sceneState),
      );
      const cubeFrameMetrics = getLogoIsometricFrameMetrics(renderCubeSidePixels, 1);
      if (offscreenCanvas.width !== frameMetrics.canvasWidth) {
        offscreenCanvas.width = frameMetrics.canvasWidth;
      }
      if (offscreenCanvas.height !== frameMetrics.canvasHeight) {
        offscreenCanvas.height = frameMetrics.canvasHeight;
      }

      const visibleFaces = sceneState.recursiveRenderDepth
        ? drawLogoIsometricRecursiveFrame({
            baseGridSize: sceneState.baseGridSize,
            backgroundColor: backgroundColorRef.current,
            cubeSidePixels: renderCubeSidePixels,
            context: offscreenContext,
            depth: sceneState.recursiveRenderDepth,
            faceColors: faceColorsRef.current,
            filledVoxels: sceneState.currentFilledVoxels,
            movingVoxels,
            cubePixelSprite: isoCubePixelSpriteRef.current,
            styleId,
          })
        : drawLogoIsometricFrame({
            backgroundColor: backgroundColorRef.current,
            cubeSidePixels: renderCubeSidePixels,
            context: offscreenContext,
            faceColors: faceColorsRef.current,
            filledVoxels: sceneState.currentFilledVoxels,
            gridSize: sceneState.gridSize,
            movingVoxels,
            cubePixelSprite: isoCubePixelSpriteRef.current,
            styleId,
          });

      const pixelScale = getIsoFramePixelScale({
        containerHeight,
        containerWidth,
        frameMetrics,
      });
      const drawWidth = frameMetrics.canvasWidth * pixelScale;
      const drawHeight = frameMetrics.canvasHeight * pixelScale;
      const offsetX = Math.floor((containerWidth - drawWidth) / 2);
      const offsetY = Math.floor((containerHeight - drawHeight) / 2);
      const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.max(1, Math.floor(containerWidth * devicePixelRatio));
      canvas.height = Math.max(1, Math.floor(containerHeight * devicePixelRatio));

      context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      context.clearRect(0, 0, containerWidth, containerHeight);
      context.fillStyle = backgroundColorRef.current;
      context.fillRect(0, 0, containerWidth, containerHeight);
      context.imageSmoothingEnabled = false;
      context.drawImage(offscreenCanvas, offsetX, offsetY, drawWidth, drawHeight);

      viewportRef.current = {
        canvasHeight: frameMetrics.canvasHeight,
        canvasWidth: frameMetrics.canvasWidth,
        cubeCanvasHeight: cubeFrameMetrics.canvasHeight,
        cubeCanvasWidth: cubeFrameMetrics.canvasWidth,
        faces: visibleFaces,
        offsetX,
        offsetY,
        pixelScale,
      };
    };

    let animationFrameId: number | null = null;

    const stopAnimation = () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    };

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
      if (shuffleAnimationRef.current.enabled) {
        animationFrameId = window.requestAnimationFrame(animate);
        return;
      }

      animationFrameId = null;
    };

    renderSceneRef.current = renderScene;
    syncAnimationLoopRef.current = () => {
      if (shuffleAnimationRef.current.enabled) {
        if (animationFrameId === null) {
          animationFrameId = window.requestAnimationFrame(animate);
        }
        return;
      }

      stopAnimation();
    };

    renderScene(performance.now());
    syncAnimationLoopRef.current();

    const resizeObserver = new ResizeObserver(() => {
      renderScene(performance.now());
    });
    resizeObserver.observe(container);

    return () => {
      stopAnimation();
      resizeObserver.disconnect();
      sceneStateRef.current = null;
      viewportRef.current = null;
      renderSceneRef.current = () => {};
      syncAnimationLoopRef.current = () => {};
    };
  }, [cubeSidePixels, styleId]);

  const resetInteraction = (target: HTMLDivElement, pointerId: number) => {
    if (target.hasPointerCapture(pointerId)) {
      target.releasePointerCapture(pointerId);
    }

    interactionRef.current = {
      button: null,
      lastPixel: null,
      pointerId: null,
      startX: 0,
      startY: 0,
    };
  };

  const pickFace = (clientX: number, clientY: number): IsometricVisibleFace | null => {
    if (!voxelEditingEnabledRef.current || shuffleAnimationRef.current.enabled) {
      return null;
    }

    const canvas = canvasRef.current;
    const viewport = viewportRef.current;
    if (!canvas || !viewport) {
      return null;
    }

    const canvasRect = canvas.getBoundingClientRect();
    const x = (clientX - canvasRect.left - viewport.offsetX) / viewport.pixelScale;
    const y = (clientY - canvasRect.top - viewport.offsetY) / viewport.pixelScale;

    for (const face of [...viewport.faces].reverse()) {
      if (isPointInsideRowSpans(x, y, face.hitRows)) {
        return face;
      }
    }

    return null;
  };

  const pickIsoPixel = (clientX: number, clientY: number): LogoIsoCubePixelCoordinate | null => {
    if (!voxelEditingEnabledRef.current || shuffleAnimationRef.current.enabled) {
      return null;
    }

    const canvas = canvasRef.current;
    const viewport = viewportRef.current;
    if (!canvas || !viewport) {
      return null;
    }

    const canvasRect = canvas.getBoundingClientRect();
    const frameX = Math.floor((clientX - canvasRect.left - viewport.offsetX) / viewport.pixelScale);
    const frameY = Math.floor((clientY - canvasRect.top - viewport.offsetY) / viewport.pixelScale);

    if (
      frameX < 0 ||
      frameX >= viewport.canvasWidth ||
      frameY < 0 ||
      frameY >= viewport.canvasHeight
    ) {
      return null;
    }

    for (const face of [...viewport.faces].reverse()) {
      if (!isPointInsideRowSpans(frameX + 0.5, frameY + 0.5, face.hitRows)) {
        continue;
      }

      const x = Math.floor(frameX - face.spriteOffsetX);
      const y = Math.floor(frameY - face.spriteOffsetY);
      if (x < 0 || x >= viewport.cubeCanvasWidth || y < 0 || y >= viewport.cubeCanvasHeight) {
        return null;
      }

      return { x, y };
    }

    return null;
  };

  const paintIsoPixel = (clientX: number, clientY: number, button: 0 | 2): boolean => {
    const tool = isoCubePixelToolRef.current;
    const viewport = viewportRef.current;
    if (!tool || !viewport) {
      return false;
    }

    const pixel = pickIsoPixel(clientX, clientY);
    if (!pixel) {
      interactionRef.current.lastPixel = null;
      return true;
    }

    const previousPixel = interactionRef.current.lastPixel;
    const pixels = previousPixel ? getIsoPixelLine(previousPixel, pixel) : [pixel];
    onIsoCubePixelSpritePaintRef.current({
      canvasHeight: viewport.cubeCanvasHeight,
      canvasWidth: viewport.cubeCanvasWidth,
      cubeSidePixels,
      kind: button === 2 ? "erase" : tool,
      pixels,
    });
    interactionRef.current.lastPixel = pixel;
    return true;
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 2) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    interactionRef.current = {
      button: event.button,
      lastPixel: null,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };

    if (isoCubePixelToolRef.current) {
      paintIsoPixel(event.clientX, event.clientY, event.button);
    }
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const interaction = interactionRef.current;
    if (interaction.pointerId !== event.pointerId || interaction.button === null) {
      return;
    }

    if (isoCubePixelToolRef.current) {
      paintIsoPixel(event.clientX, event.clientY, interaction.button);
    }
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const interaction = interactionRef.current;
    if (interaction.pointerId !== event.pointerId || interaction.button === null) {
      return;
    }

    if (isoCubePixelToolRef.current) {
      resetInteraction(event.currentTarget, event.pointerId);
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
        const nextEditMode = interaction.button === 2 ? "remove" : editMode;

        if (nextEditMode === "add") {
          const coordinate = getIsometricAddCoordinate(
            face,
            sceneState.currentFilledVoxels,
            sceneState.gridSize,
          );

          if (coordinate) {
            onVoxelEditRef.current({ coordinate, kind: "add" });
          }
        }

        if (nextEditMode === "remove") {
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
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <canvas ref={canvasRef} className="block h-full w-full" data-logo-renderer="iso" />
    </div>
  );
}
