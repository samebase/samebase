import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import { Button } from "@/components/ui/button";
import {
  MENGER_DEPTH_TRANSITION_DEFAULT_STAGGER_GROUP_COUNT,
  MENGER_DEPTH_TRANSITION_MAX_STAGGER_GROUP_COUNT,
  MENGER_DEPTH_TRANSITION_MODEL,
  createMengerDepthTransitionModel,
  readMengerDepthTransitionMoveProgress,
  readMengerDepthTransitionStage,
  type MengerDepthTransitionModel,
  type MengerDepthTransitionStage,
} from "@samebase/logo-model/menger-depth-transition";
import { readLogoRouteRenderState } from "@/components/logo/logoRouteRenderState";
import {
  getWorldCameraVector,
  getWorldScreenVerticalAxis,
  toRenderedRotationDegrees,
} from "@samebase/logo-model/rotation";
import { type VoxelCoordinate } from "@samebase/logo-model/voxel";
import { getTailwindColorHex, type FaceColors } from "@/components/logo/logoTailwindColors";
import { resolveLogoSceneCameraDepthBounds } from "@/components/logo/logoSceneCameraDepth";
import { type LogoViewState } from "@/components/logo/logoViewDrag";
import { useLogoViewDrag } from "@/components/logo/useLogoViewDrag";
import { useResolvedAppThemeColorState } from "@/lib/appThemeColorSearch";
import { PUBLIC_LANDING_LOGO_VIEW_DRAG_CONFIG } from "@/lib/publicLandingLogo";
import {
  buildLogoRouteSearch,
  preserveLogoRouteDevModeSearch,
  type LogoRouteSearch,
} from "@/routeSearch/logo";
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
import * as THREE from "three";

const CAMERA_FRUSTUM_PADDING = 1.12;
const MENGER_DEPTH_TRANSITION_WORLD_SIZE = 9;
const RENDER_PIXEL_RATIO_MAX = 2;
const TRANSITION_PROGRESS_STEPS = 1_000;

type TransitionPhase = "depth-1" | "depth-2" | "depth-3" | "transition";

function toWorldCoordinate(
  coordinate: VoxelCoordinate,
  gridSize: number,
): readonly [number, number, number] {
  const centerOffset = (gridSize - 1) / 2;
  const voxelSize = MENGER_DEPTH_TRANSITION_WORLD_SIZE / gridSize;

  return [
    (coordinate[0] - centerOffset) * voxelSize,
    (coordinate[1] - centerOffset) * voxelSize,
    (coordinate[2] - centerOffset) * voxelSize,
  ];
}

function writeVoxelMatrix(
  matrix: THREE.Matrix4,
  coordinate: VoxelCoordinate,
  gridSize: number,
): void {
  const voxelSize = MENGER_DEPTH_TRANSITION_WORLD_SIZE / gridSize;
  const [x, y, z] = toWorldCoordinate(coordinate, gridSize);
  matrix.makeScale(voxelSize, voxelSize, voxelSize);
  matrix.setPosition(x, y, z);
}

function MengerDepthTransitionScene({
  elevationDegrees,
  faceColors,
  model,
  onInteractionEnd,
  onViewChange,
  progress,
  rotationDegrees,
  viewSnapEnabled,
}: {
  elevationDegrees: number;
  faceColors: FaceColors;
  model: MengerDepthTransitionModel;
  onInteractionEnd: (finalView: LogoViewState) => void;
  onViewChange: (nextView: LogoViewState) => void;
  progress: number;
  rotationDegrees: number;
  viewSnapEnabled: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const modelRef = useRef(model);
  const progressRef = useRef(progress);
  const renderProgressRef = useRef<(nextProgress: number) => void>(() => {});
  const viewRef = useRef<LogoViewState>({ elevationDegrees, rotationDegrees });
  const {
    handleContextMenu,
    handlePointerCancel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  } = useLogoViewDrag<HTMLDivElement>({
    elevationDegrees,
    onInteractionEnd,
    onViewChange,
    rotationDegrees,
    viewDragConfig: viewSnapEnabled ? PUBLIC_LANDING_LOGO_VIEW_DRAG_CONFIG : undefined,
  });
  const leftFaceColor = getTailwindColorHex(faceColors.left);
  const rightFaceColor = getTailwindColorHex(faceColors.right);
  const topFaceColor = getTailwindColorHex(faceColors.top);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.setAttribute("aria-hidden", "true");
    container.replaceChildren(renderer.domElement);

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const rightMaterial = new THREE.MeshBasicMaterial({
      color: rightFaceColor,
    });
    const topMaterial = new THREE.MeshBasicMaterial({
      color: topFaceColor,
    });
    const leftMaterial = new THREE.MeshBasicMaterial({
      color: leftFaceColor,
    });
    const materials = [
      rightMaterial,
      rightMaterial,
      topMaterial,
      topMaterial,
      leftMaterial,
      leftMaterial,
    ];
    const depthOneMesh = new THREE.InstancedMesh(
      geometry,
      materials,
      MENGER_DEPTH_TRANSITION_MODEL.depthOneVoxels.length,
    );
    const depthTwoSettledMesh = new THREE.InstancedMesh(
      geometry,
      materials,
      MENGER_DEPTH_TRANSITION_MODEL.depthTwo.settledVoxels.length,
    );
    const depthTwoMovingMesh = new THREE.InstancedMesh(
      geometry,
      materials,
      MENGER_DEPTH_TRANSITION_MODEL.depthTwo.moves.length,
    );
    const depthThreeSettledMesh = new THREE.InstancedMesh(
      geometry,
      materials,
      MENGER_DEPTH_TRANSITION_MODEL.depthThree.settledVoxels.length,
    );
    const depthThreeMovingMesh = new THREE.InstancedMesh(
      geometry,
      materials,
      MENGER_DEPTH_TRANSITION_MODEL.depthThree.moves.length,
    );
    depthTwoMovingMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    depthThreeMovingMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const logoGroup = new THREE.Group();
    logoGroup.add(
      depthOneMesh,
      depthTwoSettledMesh,
      depthTwoMovingMesh,
      depthThreeSettledMesh,
      depthThreeMovingMesh,
    );
    scene.add(logoGroup);

    const matrix = new THREE.Matrix4();
    MENGER_DEPTH_TRANSITION_MODEL.depthOneVoxels.forEach((coordinate, index) => {
      writeVoxelMatrix(matrix, coordinate, 3);
      depthOneMesh.setMatrixAt(index, matrix);
    });
    depthOneMesh.instanceMatrix.needsUpdate = true;
    depthOneMesh.computeBoundingSphere();

    MENGER_DEPTH_TRANSITION_MODEL.depthTwo.settledVoxels.forEach((coordinate, index) => {
      writeVoxelMatrix(matrix, coordinate, MENGER_DEPTH_TRANSITION_MODEL.depthTwo.gridSize);
      depthTwoSettledMesh.setMatrixAt(index, matrix);
    });
    depthTwoSettledMesh.instanceMatrix.needsUpdate = true;
    depthTwoSettledMesh.computeBoundingSphere();

    MENGER_DEPTH_TRANSITION_MODEL.depthThree.settledVoxels.forEach((coordinate, index) => {
      writeVoxelMatrix(matrix, coordinate, MENGER_DEPTH_TRANSITION_MODEL.depthThree.gridSize);
      depthThreeSettledMesh.setMatrixAt(index, matrix);
    });
    depthThreeSettledMesh.instanceMatrix.needsUpdate = true;
    depthThreeSettledMesh.computeBoundingSphere();
    depthTwoMovingMesh.frustumCulled = false;
    depthThreeMovingMesh.frustumCulled = false;

    const fitRadius = (MENGER_DEPTH_TRANSITION_WORLD_SIZE / 2) * Math.sqrt(3);
    const cameraDepthBounds = resolveLogoSceneCameraDepthBounds(fitRadius);
    camera.far = cameraDepthBounds.far;

    const renderStageMoves = (
      stage: MengerDepthTransitionStage,
      movingMesh: THREE.InstancedMesh,
      elapsedMs: number,
    ) => {
      stage.moves.forEach((move, index) => {
        const moveProgress = readMengerDepthTransitionMoveProgress(move, elapsedMs);
        if (moveProgress === null) {
          matrix.makeScale(0, 0, 0);
          movingMesh.setMatrixAt(index, matrix);
          return;
        }

        const [startX, startY, startZ] = toWorldCoordinate(move.from, stage.gridSize);
        const [endX, endY, endZ] = toWorldCoordinate(move.to, stage.gridSize);
        const voxelSize = MENGER_DEPTH_TRANSITION_WORLD_SIZE / stage.gridSize;
        matrix.makeScale(voxelSize, voxelSize, voxelSize);
        matrix.setPosition(
          startX + (endX - startX) * moveProgress,
          startY + (endY - startY) * moveProgress,
          startZ + (endZ - startZ) * moveProgress,
        );
        movingMesh.setMatrixAt(index, matrix);
      });

      movingMesh.instanceMatrix.needsUpdate = true;
    };

    const renderProgress = (nextProgress: number) => {
      const currentModel = modelRef.current;
      const elapsedMs = THREE.MathUtils.clamp(nextProgress, 0, 1) * currentModel.totalDurationMs;
      const stage = readMengerDepthTransitionStage(currentModel, elapsedMs);
      depthOneMesh.visible = stage === null;
      depthTwoSettledMesh.visible = stage?.depth === 2;
      depthTwoMovingMesh.visible = stage?.depth === 2;
      depthThreeSettledMesh.visible = stage?.depth === 3;
      depthThreeMovingMesh.visible = stage?.depth === 3;

      renderStageMoves(currentModel.depthTwo, depthTwoMovingMesh, elapsedMs);
      renderStageMoves(currentModel.depthThree, depthThreeMovingMesh, elapsedMs);
      const view = viewRef.current;
      const [cameraX, cameraY, cameraZ] = getWorldCameraVector(view.elevationDegrees);
      const [upX, upY, upZ] = getWorldScreenVerticalAxis(view.elevationDegrees);
      camera.position.set(cameraX, cameraY, cameraZ).setLength(cameraDepthBounds.distance);
      camera.up.set(upX, upY, upZ);
      camera.lookAt(0, 0, 0);
      logoGroup.rotation.y = THREE.MathUtils.degToRad(
        toRenderedRotationDegrees(view.rotationDegrees),
      );
      renderer.render(scene, camera);
    };

    const resizeScene = () => {
      const width = container.clientWidth || 640;
      const height = container.clientHeight || 640;
      const aspect = width / height;
      const frustumHalfSpan = fitRadius * CAMERA_FRUSTUM_PADDING;
      const frustumHalfHeight = Math.max(
        frustumHalfSpan,
        frustumHalfSpan / Math.max(aspect, 0.0001),
      );

      renderer.setPixelRatio(Math.min(window.devicePixelRatio, RENDER_PIXEL_RATIO_MAX));
      renderer.setSize(width, height);
      camera.left = -frustumHalfHeight * aspect;
      camera.right = frustumHalfHeight * aspect;
      camera.top = frustumHalfHeight;
      camera.bottom = -frustumHalfHeight;
      camera.updateProjectionMatrix();
      renderProgress(progressRef.current);
    };

    renderProgressRef.current = renderProgress;
    const resizeObserver = new ResizeObserver(resizeScene);
    resizeObserver.observe(container);
    resizeScene();

    return () => {
      resizeObserver.disconnect();
      renderProgressRef.current = () => {};
      geometry.dispose();
      rightMaterial.dispose();
      topMaterial.dispose();
      leftMaterial.dispose();
      renderer.dispose();
      scene.clear();
      container.replaceChildren();
    };
  }, [leftFaceColor, rightFaceColor, topFaceColor]);

  useEffect(() => {
    progressRef.current = progress;
    renderProgressRef.current(progress);
  }, [progress]);

  useEffect(() => {
    modelRef.current = model;
    renderProgressRef.current(progressRef.current);
  }, [model]);

  useEffect(() => {
    viewRef.current = { elevationDegrees, rotationDegrees };
    renderProgressRef.current(progressRef.current);
  }, [elevationDegrees, rotationDegrees]);

  return (
    <div
      ref={containerRef}
      aria-label="Menger sponge depth transition"
      className="h-full min-h-0 w-full cursor-grab touch-none select-none active:cursor-grabbing"
      data-logo-elevation-degrees={elevationDegrees}
      data-logo-rotation-degrees={rotationDegrees}
      data-testid="logo-menger-depth-transition-scene"
      onContextMenu={handleContextMenu}
      onPointerCancel={handlePointerCancel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      role="img"
    />
  );
}

export function LogoMengerDepthTransitionPage({
  replaceRouteSearch,
  routeSearch,
}: {
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
  const [progress, setProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackVersion, setPlaybackVersion] = useState(0);
  const [staggerGroupCount, setStaggerGroupCount] = useState(
    MENGER_DEPTH_TRANSITION_DEFAULT_STAGGER_GROUP_COUNT,
  );
  const [view, setView] = useState<LogoViewState>({
    elevationDegrees: routeState.elevationDegrees,
    rotationDegrees: routeState.rotationDegrees,
  });
  const playbackStartProgressRef = useRef(0);
  const prefersReducedMotionRef = useRef(false);
  const progressInputRef = useRef<HTMLInputElement | null>(null);
  const model = useMemo(
    () => createMengerDepthTransitionModel(staggerGroupCount),
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

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    const startedAtMs =
      performance.now() - playbackStartProgressRef.current * model.totalDurationMs;
    let animationFrameId = 0;

    const animate = (timestampMs: number) => {
      const nextProgress = Math.min((timestampMs - startedAtMs) / model.totalDurationMs, 1);
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
  }, [isPlaying, model.totalDurationMs, playbackVersion]);

  useEffect(() => {
    if (progressInputRef.current) {
      progressInputRef.current.value = String(Math.round(progress * TRANSITION_PROGRESS_STEPS));
    }
  }, [progress]);

  const elapsedMs = progress * model.totalDurationMs;
  let phase: TransitionPhase;
  let phaseLabel: string;
  if (progress >= 1) {
    phase = "depth-3";
    phaseLabel = "Depth 3";
  } else if (elapsedMs >= model.depthTwo.endTimeMs) {
    if (elapsedMs < model.depthThree.splitTimeMs) {
      phase = "depth-2";
      phaseLabel = "Depth 2";
    } else {
      phase = "transition";
      phaseLabel = "Depth 2 to 3";
    }
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
  const commitView = useCallback(
    (finalView: LogoViewState) => {
      replaceRouteSearch(
        preserveLogoRouteDevModeSearch(
          buildLogoRouteSearch({
            ...routeState,
            elevationDegrees: finalView.elevationDegrees,
            rotationDegrees: finalView.rotationDegrees,
            themeModeSearch: routeSearch,
          }),
          routeSearch,
        ),
      );
    },
    [replaceRouteSearch, routeSearch, routeState],
  );
  const controlsContent = useMemo(
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
  const leftPane = useMemo(() => ({ content: controlsContent }), [controlsContent]);

  return (
    <AppWorkspaceRouteChrome left={leftPane}>
      <div
        className="h-full min-h-0 w-full"
        data-phase={phase}
        data-testid="logo-menger-depth-transition-page"
        style={{ backgroundColor }}
      >
        <MengerDepthTransitionScene
          elevationDegrees={view.elevationDegrees}
          faceColors={faceColors}
          model={model}
          onInteractionEnd={commitView}
          onViewChange={setView}
          progress={progress}
          rotationDegrees={view.rotationDegrees}
          viewSnapEnabled={routeState.viewSnapEnabled}
        />
      </div>
    </AppWorkspaceRouteChrome>
  );
}
