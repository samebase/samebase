import { getTailwindColorHex, type FaceColors } from "@/components/logo/logoTailwindColors";
import { resolveLogoSceneCameraDepthBounds } from "@/components/logo/logoSceneCameraDepth";
import { type LogoViewState } from "@/components/logo/logoViewDrag";
import {
  MENGER_SCENE_WORLD_SIZE,
  toMengerWorldCoordinate,
  writeMengerVoxelMatrix,
} from "@/components/logo/mengerSceneCoordinates";
import { useLogoViewDrag } from "@/components/logo/useLogoViewDrag";
import { PUBLIC_LANDING_LOGO_VIEW_DRAG_CONFIG } from "@/lib/publicLandingLogo";
import {
  readMengerDepthTransitionMoveProgress,
  readMengerDepthTransitionStage,
  type MengerDepthTransitionModel,
  type MengerDepthTransitionStage,
} from "@samebase/logo-model/menger-depth-transition";
import {
  getWorldCameraVector,
  getWorldScreenVerticalAxis,
  toRenderedRotationDegrees,
} from "@samebase/logo-model/rotation";
import { useEffect, useRef } from "react";
import * as THREE from "three";

const CAMERA_FRUSTUM_PADDING = 1.12;
const RENDER_PIXEL_RATIO_MAX = 2;

type MengerTransitionStageMeshes = {
  movingMesh: THREE.InstancedMesh;
  settledMesh: THREE.InstancedMesh;
};

export function MengerDepthTransitionScene({
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
  // This scene always receives the same retained depth-three topology. The
  // stagger control changes move timing only, so renderer-owned meshes stay.
  const modelRef = useRef(model);
  const progressRef = useRef(progress);
  const renderSceneRef = useRef<(nextProgress: number) => void>(() => {});
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
    const rightMaterial = new THREE.MeshBasicMaterial({ color: rightFaceColor });
    const topMaterial = new THREE.MeshBasicMaterial({ color: topFaceColor });
    const leftMaterial = new THREE.MeshBasicMaterial({ color: leftFaceColor });
    const materials = [
      rightMaterial,
      rightMaterial,
      topMaterial,
      topMaterial,
      leftMaterial,
      leftMaterial,
    ];
    const initialModel = modelRef.current;
    const depthOneMesh = new THREE.InstancedMesh(
      geometry,
      materials,
      initialModel.depthOneVoxels.length,
    );
    const stageMeshes: MengerTransitionStageMeshes[] = initialModel.stages.map((stage) => {
      if (stage.settledVoxels === null) {
        throw new Error("A Menger transition stage must retain settled voxels.");
      }
      const settledMesh = new THREE.InstancedMesh(geometry, materials, stage.settledVoxels.length);
      const movingMesh = new THREE.InstancedMesh(geometry, materials, stage.moves.length);
      movingMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      movingMesh.frustumCulled = false;

      return { movingMesh, settledMesh };
    });
    const logoGroup = new THREE.Group();
    logoGroup.add(depthOneMesh);
    for (const { movingMesh, settledMesh } of stageMeshes) {
      logoGroup.add(settledMesh, movingMesh);
    }
    scene.add(logoGroup);

    const matrix = new THREE.Matrix4();
    initialModel.depthOneVoxels.forEach((coordinate, index) => {
      writeMengerVoxelMatrix(matrix, coordinate, 3);
      depthOneMesh.setMatrixAt(index, matrix);
    });
    depthOneMesh.instanceMatrix.needsUpdate = true;
    depthOneMesh.computeBoundingSphere();

    for (const [stageIndex, { settledMesh }] of stageMeshes.entries()) {
      const stage = initialModel.stages[stageIndex];
      if (stage.settledVoxels === null) {
        throw new Error("A Menger transition stage must retain settled voxels.");
      }
      stage.settledVoxels.forEach((coordinate, index) => {
        writeMengerVoxelMatrix(matrix, coordinate, stage.gridSize);
        settledMesh.setMatrixAt(index, matrix);
      });
      settledMesh.instanceMatrix.needsUpdate = true;
      settledMesh.computeBoundingSphere();
    }

    const fitRadius = (MENGER_SCENE_WORLD_SIZE / 2) * Math.sqrt(3);
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

        const [startX, startY, startZ] = toMengerWorldCoordinate(move.from, stage.gridSize);
        const [endX, endY, endZ] = toMengerWorldCoordinate(move.to, stage.gridSize);
        const voxelSize = MENGER_SCENE_WORLD_SIZE / stage.gridSize;
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

    const renderScene = (nextProgress: number): void => {
      const currentModel = modelRef.current;
      const view = viewRef.current;
      const [cameraX, cameraY, cameraZ] = getWorldCameraVector(view.elevationDegrees);
      const [upX, upY, upZ] = getWorldScreenVerticalAxis(view.elevationDegrees);
      camera.position.set(cameraX, cameraY, cameraZ).setLength(cameraDepthBounds.distance);
      camera.up.set(upX, upY, upZ);
      camera.lookAt(0, 0, 0);
      logoGroup.rotation.y = THREE.MathUtils.degToRad(
        toRenderedRotationDegrees(view.rotationDegrees),
      );
      camera.updateMatrixWorld();
      logoGroup.updateMatrixWorld(true);

      const elapsedMs = THREE.MathUtils.clamp(nextProgress, 0, 1) * currentModel.totalDurationMs;
      const activeStage = readMengerDepthTransitionStage(currentModel, elapsedMs);
      depthOneMesh.visible = activeStage === null;
      for (const [stageIndex, stageMesh] of stageMeshes.entries()) {
        const stage = currentModel.stages[stageIndex];
        const stageVisible = stage === activeStage;
        stageMesh.settledMesh.visible = stageVisible;
        stageMesh.movingMesh.visible = stageVisible;
        renderStageMoves(stage, stageMesh.movingMesh, elapsedMs);
      }

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
      renderScene(progressRef.current);
    };

    renderSceneRef.current = renderScene;
    const resizeObserver = new ResizeObserver(resizeScene);
    resizeObserver.observe(container);
    resizeScene();

    return () => {
      resizeObserver.disconnect();
      renderSceneRef.current = () => {};
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
    modelRef.current = model;
    renderSceneRef.current(progressRef.current);
  }, [model]);

  useEffect(() => {
    progressRef.current = progress;
    renderSceneRef.current(progress);
  }, [progress]);

  useEffect(() => {
    viewRef.current = { elevationDegrees, rotationDegrees };
    renderSceneRef.current(progressRef.current);
  }, [elevationDegrees, rotationDegrees]);

  return (
    <div
      ref={containerRef}
      aria-label="Menger sponge depth transition"
      className="h-full min-h-0 w-full cursor-grab touch-none select-none active:cursor-grabbing"
      data-menger-maximum-depth={model.stages.at(-1)?.depth ?? 1}
      data-menger-research-mode="transition"
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
