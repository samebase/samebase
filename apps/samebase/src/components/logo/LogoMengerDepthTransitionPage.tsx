import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import { Button } from "@/components/ui/button";
import {
  MENGER_DEPTH_TRANSITION_MODEL,
  MENGER_DEPTH_TRANSITION_MOVE_DURATION_MS,
  type MengerDepthTransitionStage,
} from "@/components/logo/logoMengerDepthTransition";
import {
  getWorldCameraVector,
  getWorldScreenVerticalAxis,
} from "@/components/logo/logoRotationMath";
import { DEFAULT_ELEVATION_DEGREES, type VoxelCoordinate } from "@/components/logo/logoVoxelState";
import { getTailwindColorHex } from "@/components/logo/logoTailwindColors";
import { resolveLogoSceneCameraDepthBounds } from "@/components/logo/logoSceneCameraDepth";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import * as THREE from "three";

const CAMERA_FRUSTUM_PADDING = 1.12;
const MENGER_DEPTH_TRANSITION_WORLD_SIZE = 9;
const RENDER_PIXEL_RATIO_MAX = 2;
const TRANSITION_PROGRESS_STEPS = 1_000;

type TransitionPhase = "depth-1" | "depth-2" | "depth-3" | "transition";

function easeInOutCubic(value: number): number {
  if (value < 0.5) {
    return 4 * value * value * value;
  }

  return 1 - Math.pow(-2 * value + 2, 3) / 2;
}

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

function MengerDepthTransitionScene({ progress }: { progress: number }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const progressRef = useRef(progress);
  const renderProgressRef = useRef<(nextProgress: number) => void>(() => {});

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
      color: getTailwindColorHex("red-800"),
    });
    const topMaterial = new THREE.MeshBasicMaterial({
      color: getTailwindColorHex("amber-200"),
    });
    const leftMaterial = new THREE.MeshBasicMaterial({
      color: getTailwindColorHex("orange-500"),
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
    const [cameraX, cameraY, cameraZ] = getWorldCameraVector(DEFAULT_ELEVATION_DEGREES);
    const [upX, upY, upZ] = getWorldScreenVerticalAxis(DEFAULT_ELEVATION_DEGREES);
    camera.position.set(cameraX, cameraY, cameraZ).setLength(cameraDepthBounds.distance);
    camera.up.set(upX, upY, upZ);
    camera.lookAt(0, 0, 0);
    camera.far = cameraDepthBounds.far;

    const renderStageMoves = (
      stage: MengerDepthTransitionStage,
      movingMesh: THREE.InstancedMesh,
      elapsedMs: number,
    ) => {
      stage.moves.forEach((move, index) => {
        const moveProgress = THREE.MathUtils.clamp(
          (elapsedMs - move.startTimeMs) / MENGER_DEPTH_TRANSITION_MOVE_DURATION_MS,
          0,
          1,
        );

        if (moveProgress >= 1) {
          matrix.makeScale(0, 0, 0);
          movingMesh.setMatrixAt(index, matrix);
          return;
        }

        const easedProgress = easeInOutCubic(moveProgress);
        let segmentStart = move.from;
        let segmentEnd = move.to;
        let segmentProgress = easedProgress;
        if (move.kind === "via") {
          if (easedProgress < 0.5) {
            segmentEnd = move.via;
            segmentProgress = easedProgress * 2;
          } else {
            segmentStart = move.via;
            segmentProgress = (easedProgress - 0.5) * 2;
          }
        }

        const [startX, startY, startZ] = toWorldCoordinate(segmentStart, stage.gridSize);
        const [endX, endY, endZ] = toWorldCoordinate(segmentEnd, stage.gridSize);
        const voxelSize = MENGER_DEPTH_TRANSITION_WORLD_SIZE / stage.gridSize;
        matrix.makeScale(voxelSize, voxelSize, voxelSize);
        matrix.setPosition(
          startX + (endX - startX) * segmentProgress,
          startY + (endY - startY) * segmentProgress,
          startZ + (endZ - startZ) * segmentProgress,
        );
        movingMesh.setMatrixAt(index, matrix);
      });

      movingMesh.instanceMatrix.needsUpdate = true;
    };

    const renderProgress = (nextProgress: number) => {
      const elapsedMs =
        THREE.MathUtils.clamp(nextProgress, 0, 1) * MENGER_DEPTH_TRANSITION_MODEL.totalDurationMs;
      const hasSplitToDepthTwo = elapsedMs > MENGER_DEPTH_TRANSITION_MODEL.depthTwo.splitTimeMs;
      const hasSplitToDepthThree = elapsedMs > MENGER_DEPTH_TRANSITION_MODEL.depthThree.splitTimeMs;
      depthOneMesh.visible = !hasSplitToDepthTwo;
      depthTwoSettledMesh.visible = hasSplitToDepthTwo && !hasSplitToDepthThree;
      depthTwoMovingMesh.visible = hasSplitToDepthTwo && !hasSplitToDepthThree;
      depthThreeSettledMesh.visible = hasSplitToDepthThree;
      depthThreeMovingMesh.visible = hasSplitToDepthThree;

      renderStageMoves(MENGER_DEPTH_TRANSITION_MODEL.depthTwo, depthTwoMovingMesh, elapsedMs);
      renderStageMoves(MENGER_DEPTH_TRANSITION_MODEL.depthThree, depthThreeMovingMesh, elapsedMs);
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
  }, []);

  useEffect(() => {
    progressRef.current = progress;
    renderProgressRef.current(progress);
  }, [progress]);

  return (
    <div
      ref={containerRef}
      aria-label="Menger sponge depth transition"
      className="h-full min-h-0 w-full"
      data-testid="logo-menger-depth-transition-scene"
      role="img"
    />
  );
}

export function LogoMengerDepthTransitionPage() {
  const [progress, setProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackVersion, setPlaybackVersion] = useState(0);
  const playbackStartProgressRef = useRef(0);
  const prefersReducedMotionRef = useRef(false);
  const progressInputRef = useRef<HTMLInputElement | null>(null);

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
      performance.now() -
      playbackStartProgressRef.current * MENGER_DEPTH_TRANSITION_MODEL.totalDurationMs;
    let animationFrameId = 0;

    const animate = (timestampMs: number) => {
      const nextProgress = Math.min(
        (timestampMs - startedAtMs) / MENGER_DEPTH_TRANSITION_MODEL.totalDurationMs,
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
  }, [isPlaying, playbackVersion]);

  useEffect(() => {
    if (progressInputRef.current) {
      progressInputRef.current.value = String(Math.round(progress * TRANSITION_PROGRESS_STEPS));
    }
  }, [progress]);

  const elapsedMs = progress * MENGER_DEPTH_TRANSITION_MODEL.totalDurationMs;
  let phase: TransitionPhase;
  let phaseLabel: string;
  if (progress >= 1) {
    phase = "depth-3";
    phaseLabel = "Depth 3";
  } else if (elapsedMs >= MENGER_DEPTH_TRANSITION_MODEL.depthTwo.endTimeMs) {
    if (elapsedMs < MENGER_DEPTH_TRANSITION_MODEL.depthThree.splitTimeMs) {
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
          <div>140 absorbed for depth 2</div>
          <div>400 depth 2 cubes</div>
          <div>2,800 absorbed for depth 3</div>
          <div>8,000 final cubes</div>
        </div>
      </div>
    ),
    [phaseLabel, replayTransition, updateProgress],
  );
  const leftPane = useMemo(() => ({ content: controlsContent }), [controlsContent]);

  return (
    <AppWorkspaceRouteChrome left={leftPane}>
      <div
        className="h-full min-h-0 w-full"
        data-phase={phase}
        data-testid="logo-menger-depth-transition-page"
      >
        <MengerDepthTransitionScene progress={progress} />
      </div>
    </AppWorkspaceRouteChrome>
  );
}
