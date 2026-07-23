import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import { Button } from "@/components/ui/button";
import {
  MENGER_DEPTH_TRANSITION_GRID_SIZE,
  MENGER_DEPTH_TRANSITION_MODEL,
  MENGER_DEPTH_TRANSITION_MOVE_DURATION_MS,
  MENGER_DEPTH_TRANSITION_SPLIT_HOLD_MS,
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
const RENDER_PIXEL_RATIO_MAX = 2;
const TRANSITION_PROGRESS_STEPS = 1_000;

type TransitionPhase = "depth-1" | "depth-2" | "transition";

function easeInOutCubic(value: number): number {
  if (value < 0.5) {
    return 4 * value * value * value;
  }

  return 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function toWorldCoordinate(coordinate: VoxelCoordinate): readonly [number, number, number] {
  const centerOffset = (MENGER_DEPTH_TRANSITION_GRID_SIZE - 1) / 2;

  return [coordinate[0] - centerOffset, coordinate[1] - centerOffset, coordinate[2] - centerOffset];
}

function writeTranslationMatrix(matrix: THREE.Matrix4, coordinate: VoxelCoordinate) {
  const [x, y, z] = toWorldCoordinate(coordinate);
  matrix.makeTranslation(x, y, z);
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
    const settledMesh = new THREE.InstancedMesh(
      geometry,
      materials,
      MENGER_DEPTH_TRANSITION_MODEL.settledVoxels.length,
    );
    const movingMesh = new THREE.InstancedMesh(
      geometry,
      materials,
      MENGER_DEPTH_TRANSITION_MODEL.moves.length,
    );
    movingMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const logoGroup = new THREE.Group();
    logoGroup.add(depthOneMesh, settledMesh, movingMesh);
    scene.add(logoGroup);

    const matrix = new THREE.Matrix4();
    MENGER_DEPTH_TRANSITION_MODEL.depthOneVoxels.forEach(([x, y, z], index) => {
      matrix.makeScale(3, 3, 3);
      matrix.setPosition((x - 1) * 3, (y - 1) * 3, (z - 1) * 3);
      depthOneMesh.setMatrixAt(index, matrix);
    });
    depthOneMesh.instanceMatrix.needsUpdate = true;
    depthOneMesh.computeBoundingSphere();

    MENGER_DEPTH_TRANSITION_MODEL.settledVoxels.forEach((coordinate, index) => {
      writeTranslationMatrix(matrix, coordinate);
      settledMesh.setMatrixAt(index, matrix);
    });
    settledMesh.instanceMatrix.needsUpdate = true;
    settledMesh.computeBoundingSphere();
    movingMesh.frustumCulled = false;

    const fitRadius = (MENGER_DEPTH_TRANSITION_GRID_SIZE / 2) * Math.sqrt(3);
    const cameraDepthBounds = resolveLogoSceneCameraDepthBounds(fitRadius);
    const [cameraX, cameraY, cameraZ] = getWorldCameraVector(DEFAULT_ELEVATION_DEGREES);
    const [upX, upY, upZ] = getWorldScreenVerticalAxis(DEFAULT_ELEVATION_DEGREES);
    camera.position.set(cameraX, cameraY, cameraZ).setLength(cameraDepthBounds.distance);
    camera.up.set(upX, upY, upZ);
    camera.lookAt(0, 0, 0);
    camera.far = cameraDepthBounds.far;

    const renderProgress = (nextProgress: number) => {
      const elapsedMs =
        THREE.MathUtils.clamp(nextProgress, 0, 1) * MENGER_DEPTH_TRANSITION_MODEL.totalDurationMs;
      const hasSplit = elapsedMs > MENGER_DEPTH_TRANSITION_SPLIT_HOLD_MS;
      depthOneMesh.visible = !hasSplit;
      settledMesh.visible = hasSplit;
      movingMesh.visible = hasSplit;

      MENGER_DEPTH_TRANSITION_MODEL.moves.forEach((move, index) => {
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
        const [startX, startY, startZ] = toWorldCoordinate(move.from);
        const [endX, endY, endZ] = toWorldCoordinate(move.to);
        matrix.makeTranslation(
          startX + (endX - startX) * easedProgress,
          startY + (endY - startY) * easedProgress,
          startZ + (endZ - startZ) * easedProgress,
        );
        movingMesh.setMatrixAt(index, matrix);
      });

      movingMesh.instanceMatrix.needsUpdate = true;
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

  const phase: TransitionPhase =
    progress >= 1 ? "depth-2" : progress > 0 || isPlaying ? "transition" : "depth-1";
  const phaseLabel =
    phase === "depth-1" ? "Depth 1" : phase === "depth-2" ? "Depth 2" : "Transitioning";

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
          <div>140 absorbed cubes</div>
          <div>400 final cubes</div>
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
