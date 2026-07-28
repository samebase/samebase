import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import { Button } from "@/components/ui/button";
import {
  MENGER_DEPTH_TRANSITION_DEFAULT_STAGGER_GROUP_COUNT,
  MENGER_DEPTH_TRANSITION_MAX_STAGGER_GROUP_COUNT,
  createMengerDepthTransitionModel,
  readMengerDepthTransitionMoveProgress,
  readMengerDepthTransitionStage,
  type MengerDepthTransitionModel,
  type MengerDepthTransitionStage,
} from "@samebase/logo-model/menger-depth-transition";
import {
  MENGER_HOVER_DEFAULT_REVEAL_RADIUS,
  MENGER_HOVER_MAX_REVEAL_RADIUS,
  MENGER_HOVER_MIN_REVEAL_RADIUS,
  createMengerHoverState,
  createMengerHoverTopology,
  normalizeMengerHoverRevealRadius,
  writeMengerHoverState,
  type MengerHoverChannelState,
  type MengerHoverProbe,
} from "@samebase/logo-model/menger-hover";
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
import {
  createMengerHoverBlockerLinkTexture,
  createMengerHoverCoverGeometry,
  createMengerHoverCoverMaterials,
  createMengerHoverStateTexture,
  type MengerHoverTexture,
} from "@/components/logo/mengerHoverShader";
import {
  createMengerHoverSettledSurface,
  type MengerHoverSettledSurface,
} from "@/components/logo/mengerHoverSettledSurface";
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
const HOVER_FRAME_ELAPSED_MAX_MS = 100;
const HOVER_FRAME_ELAPSED_RESTART_MS = 1000 / 60;
const HOVER_OPENNESS_SETTLE_EPSILON = 0.001;
const HOVER_OPENNESS_SMOOTHING_TAU_MS = 58;
const MENGER_DEPTH_TRANSITION_WORLD_SIZE = 9;
const RENDER_PIXEL_RATIO_MAX = 2;
const TRANSITION_PROGRESS_STEPS = 1_000;

type TransitionPhase = `depth-${number}` | "transition";
type MengerResearchMode = "hover" | "transition";

type ClientPoint = {
  x: number;
  y: number;
};

type HoverStageBuffers = {
  openness: Float64Array;
};

type MengerStageMeshes = {
  blockerLinkTexture: MengerHoverTexture;
  coverGeometry: THREE.BufferGeometry;
  coverMaterials: THREE.ShaderMaterial[];
  hoverCoverMesh: THREE.InstancedMesh;
  settledMesh: THREE.InstancedMesh;
  stage: MengerDepthTransitionStage;
  transitionMovingMesh: THREE.InstancedMesh;
};

function createHoverStageBuffers(moveCount: number): HoverStageBuffers {
  return {
    openness: new Float64Array(moveCount),
  };
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

function MengerDepthTransitionScene({
  elevationDegrees,
  faceColors,
  hoverRevealRadius,
  mode,
  model,
  onInteractionEnd,
  onViewChange,
  progress,
  rotationDegrees,
  viewSnapEnabled,
}: {
  elevationDegrees: number;
  faceColors: FaceColors;
  hoverRevealRadius: number;
  mode: MengerResearchMode;
  model: MengerDepthTransitionModel;
  onInteractionEnd: (finalView: LogoViewState) => void;
  onViewChange: (nextView: LogoViewState) => void;
  progress: number;
  rotationDegrees: number;
  viewSnapEnabled: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const clientPointerRef = useRef<ClientPoint | null>(null);
  const hoverRevealRadiusRef = useRef(hoverRevealRadius);
  const modeRef = useRef(mode);
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
    const sceneBuildStartedAt = performance.now();
    let firstHoverRenderPending = mode === "hover";

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
    const hoverProxyGeometry = new THREE.BoxGeometry(
      MENGER_DEPTH_TRANSITION_WORLD_SIZE,
      MENGER_DEPTH_TRANSITION_WORLD_SIZE,
      MENGER_DEPTH_TRANSITION_WORLD_SIZE,
    );
    const hoverProxyMaterial = new THREE.MeshBasicMaterial();
    const hoverProxy = new THREE.Mesh(hoverProxyGeometry, hoverProxyMaterial);
    hoverProxy.visible = false;
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    const hoverLocalMatrix = new THREE.Matrix4();
    const hoverLocalRay = new THREE.Ray();
    const hoverSpongeCenter = new THREE.Vector3();
    const hoverRayPoint = new THREE.Vector3();
    const hoverClampedPoint = new THREE.Vector3();
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
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
    const depthOneMesh = new THREE.InstancedMesh(geometry, materials, model.depthOneVoxels.length);
    const finalStage = model.stages.at(-1);
    const useHoverSettledSurface = mode === "hover" && (finalStage?.depth ?? 0) >= 4;
    const hoverSettledSurface: MengerHoverSettledSurface | null = useHoverSettledSurface
      ? createMengerHoverSettledSurface({
          materials,
          model,
          worldSize: MENGER_DEPTH_TRANSITION_WORLD_SIZE,
        })
      : null;
    const hoverTopology = createMengerHoverTopology(model);
    const hoverState = createMengerHoverState(model);
    const hoverStateTexture = createMengerHoverStateTexture(hoverTopology.channelCount);
    if (mode === "hover") {
      const coverInstanceCount = model.stages.reduce(
        (count, stage) => count + stage.moves.length,
        0,
      );
      const settledInstanceCount =
        hoverSettledSurface?.instanceCount ?? finalStage?.settledVoxels.length ?? 0;
      const settledTriangleCount =
        hoverSettledSurface === null
          ? settledInstanceCount * 12
          : hoverSettledSurface.quadCount * hoverSettledSurface.instanceCount * 2;
      container.dataset.hoverChannelCount = String(hoverTopology.channelCount);
      container.dataset.hoverDynamicUploadBytes = String(hoverStateTexture.data.byteLength);
      container.dataset.hoverTriangleCount = String(settledTriangleCount + coverInstanceCount * 24);
      container.dataset.hoverVisibleInstanceCount = String(
        settledInstanceCount + coverInstanceCount,
      );
    }
    const stageMeshes: MengerStageMeshes[] = model.stages.map((stage, stageIndex) => {
      const stageTopology = hoverTopology.stages[stageIndex];
      const settledMesh = new THREE.InstancedMesh(
        geometry,
        materials,
        useHoverSettledSurface ? 0 : stage.settledVoxels.length,
      );
      const transitionMovingMesh = new THREE.InstancedMesh(geometry, materials, stage.moves.length);
      transitionMovingMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      transitionMovingMesh.frustumCulled = false;
      const coverGeometry = createMengerHoverCoverGeometry(geometry, stageTopology);
      const blockerLinkTexture = createMengerHoverBlockerLinkTexture(stageTopology);
      const coverMaterials = createMengerHoverCoverMaterials({
        blockerLinkTexture,
        leftColor: leftFaceColor,
        maximumBlockerLinksPerMove: stageTopology.maximumBlockerLinksPerMove,
        rightColor: rightFaceColor,
        stateTexture: hoverStateTexture,
        topColor: topFaceColor,
        worldSize: MENGER_DEPTH_TRANSITION_WORLD_SIZE,
      });
      const hoverCoverMesh = new THREE.InstancedMesh(
        coverGeometry,
        coverMaterials,
        stage.moves.length,
      );
      hoverCoverMesh.frustumCulled = false;

      return {
        blockerLinkTexture,
        coverGeometry,
        coverMaterials,
        hoverCoverMesh,
        settledMesh,
        stage,
        transitionMovingMesh,
      };
    });
    const finalStageMeshes = stageMeshes.at(-1);
    const logoGroup = new THREE.Group();
    logoGroup.add(hoverProxy, depthOneMesh);
    if (hoverSettledSurface) {
      logoGroup.add(hoverSettledSurface.mesh);
    }
    for (const { hoverCoverMesh, settledMesh, transitionMovingMesh } of stageMeshes) {
      logoGroup.add(settledMesh, transitionMovingMesh, hoverCoverMesh);
    }
    scene.add(logoGroup);

    const matrix = new THREE.Matrix4();
    model.depthOneVoxels.forEach((coordinate, index) => {
      writeVoxelMatrix(matrix, coordinate, 3);
      depthOneMesh.setMatrixAt(index, matrix);
    });
    depthOneMesh.instanceMatrix.needsUpdate = true;
    depthOneMesh.computeBoundingSphere();

    for (const { hoverCoverMesh, settledMesh, stage } of stageMeshes) {
      if (!useHoverSettledSurface) {
        stage.settledVoxels.forEach((coordinate, index) => {
          writeVoxelMatrix(matrix, coordinate, stage.gridSize);
          settledMesh.setMatrixAt(index, matrix);
        });
        settledMesh.instanceMatrix.needsUpdate = true;
        settledMesh.computeBoundingSphere();
      }
      stage.moves.forEach((move, index) => {
        writeVoxelMatrix(matrix, move.from, stage.gridSize);
        hoverCoverMesh.setMatrixAt(index, matrix);
      });
      hoverCoverMesh.instanceMatrix.needsUpdate = true;
    }
    let hoverAnimationFrame = 0;
    let hoverLastFrameTime: number | null = null;
    // The heal after the pointer leaves keeps the last slide directions, so
    // easing movers retract along the path they came instead of teleporting
    // when the live probe goes null.
    let hoverDirectionProbe: MengerHoverProbe | null = null;
    const hoverStageBuffers = hoverTopology.stages.map((stage) =>
      createHoverStageBuffers(stage.channelCount),
    );

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

    const clearHoverProbe = () => {
      delete container.dataset.hoverCoordinateX;
      delete container.dataset.hoverCoordinateY;
      delete container.dataset.hoverCoordinateZ;
    };

    /**
    The probe is the pointer ray mapped onto the sponge surface. When the ray
    misses the cube, its point in the cube-center plane clamps to the nearest
    surface position. This box-shaped trackball keeps the same surface
    direction active while the pointer moves anywhere else on the page.
    */
    const readHoverProbe = (): MengerHoverProbe | null => {
      const clientPointer = clientPointerRef.current;
      if (clientPointer === null) {
        clearHoverProbe();
        return null;
      }

      const bounds = renderer.domElement.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) {
        clearHoverProbe();
        return null;
      }

      pointerNdc.set(
        ((clientPointer.x - bounds.left) / bounds.width) * 2 - 1,
        -((clientPointer.y - bounds.top) / bounds.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointerNdc, camera);
      hoverLocalMatrix.copy(logoGroup.matrixWorld).invert();
      hoverLocalRay.copy(raycaster.ray).applyMatrix4(hoverLocalMatrix);
      const intersection = raycaster.intersectObject(hoverProxy, false).at(0);
      if (intersection) {
        hoverClampedPoint.copy(intersection.point).applyMatrix4(hoverLocalMatrix);
      } else {
        hoverLocalRay.closestPointToPoint(hoverSpongeCenter, hoverRayPoint);
        const halfWorldSize = MENGER_DEPTH_TRANSITION_WORLD_SIZE / 2;
        hoverClampedPoint.set(
          THREE.MathUtils.clamp(hoverRayPoint.x, -halfWorldSize, halfWorldSize),
          THREE.MathUtils.clamp(hoverRayPoint.y, -halfWorldSize, halfWorldSize),
          THREE.MathUtils.clamp(hoverRayPoint.z, -halfWorldSize, halfWorldSize),
        );
      }

      const probe: MengerHoverProbe = {
        x: hoverClampedPoint.x / MENGER_DEPTH_TRANSITION_WORLD_SIZE + 0.5,
        y: hoverClampedPoint.y / MENGER_DEPTH_TRANSITION_WORLD_SIZE + 0.5,
        z: hoverClampedPoint.z / MENGER_DEPTH_TRANSITION_WORLD_SIZE + 0.5,
      };
      container.dataset.hoverCoordinateX = probe.x.toFixed(3);
      container.dataset.hoverCoordinateY = probe.y.toFixed(3);
      container.dataset.hoverCoordinateZ = probe.z.toFixed(3);

      return probe;
    };

    const settleHoverChannelStates = (
      channelStates: MengerHoverChannelState[],
      buffers: HoverStageBuffers,
      smoothing: number,
    ): boolean => {
      let settled = true;
      const settleScalar = (target: number, buffer: Float64Array, channel: number): number => {
        const current = buffer[channel] ?? 0;
        let next = current + (target - current) * smoothing;
        if (Math.abs(next - target) < HOVER_OPENNESS_SETTLE_EPSILON) {
          next = target;
        } else {
          settled = false;
        }

        buffer[channel] = next;
        return next;
      };
      for (const [channel, channelState] of channelStates.entries()) {
        channelState.openness = settleScalar(channelState.openness, buffers.openness, channel);
      }

      return settled;
    };

    const scheduleHoverFrame = () => {
      if (hoverAnimationFrame !== 0) {
        return;
      }

      hoverAnimationFrame = window.requestAnimationFrame((timestampMs) => {
        hoverAnimationFrame = 0;
        renderProgress(progressRef.current, timestampMs);
      });
    };

    const renderProgress = (nextProgress: number, timestampMs?: number): void => {
      const cpuSubmissionStartedAt = performance.now();
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

      if (modeRef.current === "hover") {
        // The final settled cubes plus every cover generation at rest read
        // exactly as the depth-one sponge. Earlier settled meshes stay hidden
        // because their cubes are refined by the final geometry.
        depthOneMesh.visible = false;
        if (hoverSettledSurface) {
          hoverSettledSurface.mesh.visible = true;
        }
        for (const stageMesh of stageMeshes) {
          stageMesh.settledMesh.visible =
            hoverSettledSurface === null && stageMesh === finalStageMeshes;
          stageMesh.transitionMovingMesh.visible = false;
          stageMesh.hoverCoverMesh.visible = true;
        }

        const hoverProbe = readHoverProbe();
        if (hoverProbe !== null) {
          hoverDirectionProbe = hoverProbe;
        }
        writeMengerHoverState(
          hoverState,
          model,
          hoverProbe,
          hoverDirectionProbe,
          hoverRevealRadiusRef.current,
        );
        const now = timestampMs ?? performance.now();
        const previousFrameTime = hoverLastFrameTime;
        hoverLastFrameTime = now;
        const elapsedMs =
          previousFrameTime === null
            ? HOVER_FRAME_ELAPSED_RESTART_MS
            : Math.min(Math.max(now - previousFrameTime, 0), HOVER_FRAME_ELAPSED_MAX_MS);
        const smoothing = reducedMotionQuery.matches
          ? 1
          : 1 - Math.exp(-elapsedMs / HOVER_OPENNESS_SMOOTHING_TAU_MS);
        let hoverSettled = true;
        let maximumHoverOpenness = 0;
        for (const [stageIndex, stageState] of hoverState.stages.entries()) {
          const buffers = hoverStageBuffers[stageIndex];
          if (!settleHoverChannelStates(stageState, buffers, smoothing)) {
            hoverSettled = false;
          }
          const stageTopology = hoverTopology.stages[stageIndex];
          for (const [channel, channelState] of stageState.entries()) {
            const textureOffset = (stageTopology.channelStateOffset + channel) * 4;
            hoverStateTexture.data[textureOffset] = channelState.openness;
            hoverStateTexture.data[textureOffset + 1] = channelState.signA;
            hoverStateTexture.data[textureOffset + 2] = channelState.signB;
            hoverStateTexture.data[textureOffset + 3] = channelState.weightA;
            maximumHoverOpenness = Math.max(maximumHoverOpenness, channelState.openness);
          }
        }
        hoverStateTexture.texture.needsUpdate = true;
        container.dataset.hoverMaximumOpenness = maximumHoverOpenness.toFixed(6);
        container.dataset.hoverSettled = hoverSettled ? "true" : "false";
        if (!hoverSettled) {
          scheduleHoverFrame();
        } else {
          hoverLastFrameTime = null;
        }
      } else {
        hoverLastFrameTime = null;
        delete container.dataset.hoverSettled;
        clearHoverProbe();
        const elapsedMs = THREE.MathUtils.clamp(nextProgress, 0, 1) * model.totalDurationMs;
        const stage = readMengerDepthTransitionStage(model, elapsedMs);
        depthOneMesh.visible = stage === null;
        if (hoverSettledSurface) {
          hoverSettledSurface.mesh.visible = false;
        }
        for (const stageMesh of stageMeshes) {
          const stageVisible = stageMesh.stage === stage;
          stageMesh.settledMesh.visible = stageVisible;
          stageMesh.transitionMovingMesh.visible = stageVisible;
          stageMesh.hoverCoverMesh.visible = false;
          renderStageMoves(stageMesh.stage, stageMesh.transitionMovingMesh, elapsedMs);
        }
      }

      renderer.render(scene, camera);
      if (modeRef.current === "hover") {
        container.dataset.hoverCpuSubmissionMs = (
          performance.now() - cpuSubmissionStartedAt
        ).toFixed(3);
        if (firstHoverRenderPending) {
          firstHoverRenderPending = false;
          container.dataset.hoverSceneBuildMs = (performance.now() - sceneBuildStartedAt).toFixed(
            3,
          );
        }
      }
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

    const onWindowPointerMove = (event: PointerEvent) => {
      if (
        modeRef.current !== "hover" ||
        !event.isPrimary ||
        event.pointerType === "touch" ||
        event.buttons !== 0
      ) {
        return;
      }

      clientPointerRef.current = { x: event.clientX, y: event.clientY };
      renderProgress(progressRef.current);
    };
    const onWindowPointerUp = (event: PointerEvent) => {
      if (modeRef.current !== "hover" || !event.isPrimary || event.pointerType === "touch") {
        return;
      }

      clientPointerRef.current = { x: event.clientX, y: event.clientY };
      renderProgress(progressRef.current);
    };
    const onPagePointerLeave = () => {
      clientPointerRef.current = null;
      if (modeRef.current === "hover") {
        renderProgress(progressRef.current);
      }
    };
    window.addEventListener("pointermove", onWindowPointerMove);
    window.addEventListener("pointerup", onWindowPointerUp);
    document.documentElement.addEventListener("pointerleave", onPagePointerLeave);

    renderProgressRef.current = renderProgress;
    const resizeObserver = new ResizeObserver(resizeScene);
    resizeObserver.observe(container);
    resizeScene();

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", onWindowPointerMove);
      window.removeEventListener("pointerup", onWindowPointerUp);
      document.documentElement.removeEventListener("pointerleave", onPagePointerLeave);
      renderProgressRef.current = () => {};
      if (hoverAnimationFrame !== 0) {
        window.cancelAnimationFrame(hoverAnimationFrame);
      }
      geometry.dispose();
      hoverProxyGeometry.dispose();
      hoverProxyMaterial.dispose();
      rightMaterial.dispose();
      topMaterial.dispose();
      leftMaterial.dispose();
      hoverStateTexture.texture.dispose();
      hoverSettledSurface?.geometry.dispose();
      delete container.dataset.hoverChannelCount;
      delete container.dataset.hoverDynamicUploadBytes;
      delete container.dataset.hoverCpuSubmissionMs;
      delete container.dataset.hoverMaximumOpenness;
      delete container.dataset.hoverSceneBuildMs;
      delete container.dataset.hoverTriangleCount;
      delete container.dataset.hoverVisibleInstanceCount;
      for (const stageMesh of stageMeshes) {
        stageMesh.blockerLinkTexture.texture.dispose();
        stageMesh.coverGeometry.dispose();
        for (const material of new Set(stageMesh.coverMaterials)) {
          material.dispose();
        }
      }
      renderer.dispose();
      scene.clear();
      container.replaceChildren();
    };
  }, [leftFaceColor, mode, model, rightFaceColor, topFaceColor]);

  useEffect(() => {
    progressRef.current = progress;
    renderProgressRef.current(progress);
  }, [progress]);

  useEffect(() => {
    hoverRevealRadiusRef.current = hoverRevealRadius;
    modeRef.current = mode;
    if (mode !== "hover") {
      clientPointerRef.current = null;
    }
    renderProgressRef.current(progressRef.current);
  }, [hoverRevealRadius, mode]);

  useEffect(() => {
    viewRef.current = { elevationDegrees, rotationDegrees };
    renderProgressRef.current(progressRef.current);
  }, [elevationDegrees, rotationDegrees]);

  return (
    <div
      ref={containerRef}
      aria-label={
        mode === "hover" ? "Menger sponge hover reveal" : "Menger sponge depth transition"
      }
      className="h-full min-h-0 w-full cursor-grab touch-none select-none active:cursor-grabbing"
      data-menger-maximum-depth={model.stages.at(-1)?.depth ?? 1}
      data-menger-research-mode={mode}
      data-logo-elevation-degrees={elevationDegrees}
      data-logo-rotation-degrees={rotationDegrees}
      data-testid={
        mode === "hover" ? "logo-menger-hover-scene" : "logo-menger-depth-transition-scene"
      }
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
  const [progress, setProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackVersion, setPlaybackVersion] = useState(0);
  const [staggerGroupCount, setStaggerGroupCount] = useState(
    MENGER_DEPTH_TRANSITION_DEFAULT_STAGGER_GROUP_COUNT,
  );
  const [hoverRevealRadius, setHoverRevealRadius] = useState(MENGER_HOVER_DEFAULT_REVEAL_RADIUS);
  const [view, setView] = useState<LogoViewState>({
    elevationDegrees: routeState.elevationDegrees,
    rotationDegrees: routeState.rotationDegrees,
  });
  const playbackStartProgressRef = useRef(0);
  const prefersReducedMotionRef = useRef(false);
  const progressInputRef = useRef<HTMLInputElement | null>(null);
  const model = useMemo(
    () =>
      createMengerDepthTransitionModel({
        maximumDepth: mode === "hover" ? 4 : 3,
        staggerGroupCount,
      }),
    [mode, staggerGroupCount],
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
  }, [isPlaying, mode, model.totalDurationMs, playbackVersion]);

  useEffect(() => {
    if (progressInputRef.current) {
      progressInputRef.current.value = String(Math.round(progress * TRANSITION_PROGRESS_STEPS));
    }
  }, [progress]);

  const elapsedMs = progress * model.totalDurationMs;
  const activeStage = readMengerDepthTransitionStage(model, elapsedMs);
  const finalStage = model.stages[model.stages.length - 1];
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
          <div>Pointer reveals depths 2, 3, and 4</div>
          <div>2 covers per hole, one axis each</div>
        </div>
      </div>
    ),
    [hoverRevealRadius, updateHoverRevealRadius],
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
        <MengerDepthTransitionScene
          elevationDegrees={view.elevationDegrees}
          faceColors={faceColors}
          hoverRevealRadius={hoverRevealRadius}
          mode={mode}
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
