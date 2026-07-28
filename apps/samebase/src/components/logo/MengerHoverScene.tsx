import { getTailwindColorHex, type FaceColors } from "@/components/logo/logoTailwindColors";
import {
  getRadialPointerLogoPresentationTiltTarget,
  getLogoPresentationTiltTransitionAlpha,
  LOGO_POINTER_TILT_MEDIA_QUERY,
  LOGO_PRESENTATION_TILT_SETTLED_DEGREES,
  NEUTRAL_LOGO_PRESENTATION_TILT_TARGET,
  normalizeLogoPresentationTiltRadiusScale,
} from "@/components/logo/logoPresentationTilt";
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
import {
  MENGER_SCENE_WORLD_SIZE,
  writeMengerVoxelMatrix,
} from "@/components/logo/mengerSceneCoordinates";
import { useLogoViewDrag } from "@/components/logo/useLogoViewDrag";
import {
  MENGER_DEPTH_TRANSITION_DEFAULT_STAGGER_GROUP_COUNT,
  createMengerDepthTransitionModel,
  type MengerDepthTransitionStage,
} from "@samebase/logo-model/menger-depth-transition";
import {
  createMengerHoverState,
  createMengerHoverTopology,
  projectMengerHoverLineToVisibleFacePlanes,
  writeMengerHoverState,
  type MengerHoverChannelState,
  type MengerHoverProbe,
} from "@samebase/logo-model/menger-hover";
import {
  getWorldCameraVector,
  getWorldScreenVerticalAxis,
  toRenderedRotationDegrees,
} from "@samebase/logo-model/rotation";
import { PUBLIC_LANDING_LOGO_VIEW_DRAG_CONFIG } from "@/lib/publicLandingLogo";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

const CAMERA_FRUSTUM_PADDING = 1.12;
const HOVER_FRAME_ELAPSED_MAX_MS = 100;
const HOVER_FRAME_ELAPSED_RESTART_MS = 1000 / 60;
const HOVER_OPENNESS_SETTLE_EPSILON = 0.001;
const HOVER_OPENNESS_SMOOTHING_TAU_MS = 58;
const MENGER_CUBE_CORNER_SIGNS = [-1, 1] as const;
const RENDER_PIXEL_RATIO_MAX = 2;

type ClientPoint = {
  x: number;
  y: number;
};

type HoverStageBuffers = {
  openness: Float64Array;
};

type MengerHoverStageMeshes = {
  blockerLinkTexture: MengerHoverTexture;
  coverGeometry: THREE.BufferGeometry;
  coverMaterials: THREE.ShaderMaterial[];
  coverMesh: THREE.InstancedMesh;
  settledMesh: THREE.InstancedMesh;
  stage: MengerDepthTransitionStage;
};

function createHoverStageBuffers(channelCount: number): HoverStageBuffers {
  return {
    openness: new Float64Array(channelCount),
  };
}

export function MengerHoverScene({
  elevationDegrees,
  faceColors,
  maximumDepth,
  onInteractionEnd,
  onViewChange,
  pointerTiltEnabled,
  pointerTiltRadiusScale,
  pointerTiltStrengthScale,
  revealRadius,
  rotationDegrees,
  viewSnapEnabled,
}: {
  elevationDegrees: number;
  faceColors: FaceColors;
  maximumDepth: number;
  onInteractionEnd: (finalView: LogoViewState) => void;
  onViewChange: (nextView: LogoViewState) => void;
  pointerTiltEnabled: boolean;
  pointerTiltRadiusScale: number;
  pointerTiltStrengthScale: number;
  revealRadius: number;
  rotationDegrees: number;
  viewSnapEnabled: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const clientPointerRef = useRef<ClientPoint | null>(null);
  const pointerTiltEnabledRef = useRef(pointerTiltEnabled);
  const pointerTiltRadiusScaleRef = useRef(pointerTiltRadiusScale);
  const pointerTiltStrengthScaleRef = useRef(pointerTiltStrengthScale);
  const renderSceneRef = useRef<() => void>(() => {});
  const revealRadiusRef = useRef(revealRadius);
  const viewRef = useRef<LogoViewState>({ elevationDegrees, rotationDegrees });
  const {
    handleContextMenu,
    handlePointerCancel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    interactionRef,
  } = useLogoViewDrag<HTMLDivElement>({
    elevationDegrees,
    onInteractionEnd,
    onPointerCaptureEnd: () => {
      renderSceneRef.current();
    },
    onPointerCaptureStart: () => {
      renderSceneRef.current();
    },
    onViewChange,
    rotationDegrees,
    viewDragConfig: viewSnapEnabled ? PUBLIC_LANDING_LOGO_VIEW_DRAG_CONFIG : undefined,
  });
  const leftFaceColor = getTailwindColorHex(faceColors.left);
  const rightFaceColor = getTailwindColorHex(faceColors.right);
  const topFaceColor = getTailwindColorHex(faceColors.top);
  const model = useMemo(
    () =>
      createMengerDepthTransitionModel({
        maximumDepth: Math.max(maximumDepth, 2),
        retainFinalSettledVoxels: maximumDepth < 4,
        staggerGroupCount: MENGER_DEPTH_TRANSITION_DEFAULT_STAGGER_GROUP_COUNT,
      }),
    [maximumDepth],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const sceneBuildStartedAt = performance.now();
    let firstRenderPending = true;
    let animationFrame = 0;
    let lastFrameTime: number | null = null;
    let directionProbe: MengerHoverProbe | null = null;

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
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    const localMatrix = new THREE.Matrix4();
    const localRay = new THREE.Ray();
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
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
      leftMaterial,
    ];
    const depthOneOnly = maximumDepth === 1;
    const depthOneMesh = new THREE.InstancedMesh(geometry, materials, model.depthOneVoxels.length);
    const finalStage = model.stages.at(-1);
    const useSettledSurface = (finalStage?.depth ?? 0) >= 4;
    const settledSurface: MengerHoverSettledSurface | null = useSettledSurface
      ? createMengerHoverSettledSurface({
          materials,
          model,
          worldSize: MENGER_SCENE_WORLD_SIZE,
        })
      : null;
    const topology = createMengerHoverTopology(model);
    const hoverState = createMengerHoverState(model);
    const stateTexture = createMengerHoverStateTexture(topology.channelCount);
    const coverInstanceCount = depthOneOnly
      ? 0
      : model.stages.reduce((count, stage) => count + stage.moves.length, 0);
    const settledInstanceCount = depthOneOnly
      ? model.depthOneVoxels.length
      : (settledSurface?.instanceCount ?? finalStage?.settledVoxelCount ?? 0);
    const settledTriangleCount = depthOneOnly
      ? settledInstanceCount * 12
      : settledSurface === null
        ? settledInstanceCount * 12
        : settledSurface.quadCount * settledSurface.instanceCount * 2;
    container.dataset.hoverChannelCount = String(depthOneOnly ? 0 : topology.channelCount);
    container.dataset.hoverDynamicUploadBytes = String(
      depthOneOnly ? 0 : stateTexture.data.byteLength,
    );
    container.dataset.hoverTriangleCount = String(settledTriangleCount + coverInstanceCount * 24);
    container.dataset.hoverVisibleInstanceCount = String(settledInstanceCount + coverInstanceCount);

    const stageMeshes: MengerHoverStageMeshes[] = model.stages.map((stage, stageIndex) => {
      const stageTopology = topology.stages[stageIndex];
      const settledMesh = new THREE.InstancedMesh(
        geometry,
        materials,
        useSettledSurface ? 0 : (stage.settledVoxels?.length ?? 0),
      );
      const coverGeometry = createMengerHoverCoverGeometry(geometry, stageTopology);
      const blockerLinkTexture = createMengerHoverBlockerLinkTexture(stageTopology);
      const coverMaterials = createMengerHoverCoverMaterials({
        blockerLinkTexture,
        leftColor: leftFaceColor,
        maximumBlockerLinksPerMove: stageTopology.maximumBlockerLinksPerMove,
        rightColor: rightFaceColor,
        stateTexture,
        topColor: topFaceColor,
        worldSize: MENGER_SCENE_WORLD_SIZE,
      });
      const coverMesh = new THREE.InstancedMesh(coverGeometry, coverMaterials, stage.moves.length);
      coverMesh.frustumCulled = false;

      return {
        blockerLinkTexture,
        coverGeometry,
        coverMaterials,
        coverMesh,
        settledMesh,
        stage,
      };
    });
    const finalStageMeshes = stageMeshes.at(-1);
    const logoGroup = new THREE.Group();
    logoGroup.add(depthOneMesh);
    if (settledSurface) {
      logoGroup.add(settledSurface.mesh);
    }
    for (const { coverMesh, settledMesh } of stageMeshes) {
      logoGroup.add(settledMesh, coverMesh);
    }
    const presentationTiltGroup = new THREE.Group();
    presentationTiltGroup.add(logoGroup);
    scene.add(presentationTiltGroup);

    const matrix = new THREE.Matrix4();
    model.depthOneVoxels.forEach((coordinate, index) => {
      writeMengerVoxelMatrix(matrix, coordinate, 3);
      depthOneMesh.setMatrixAt(index, matrix);
    });
    depthOneMesh.instanceMatrix.needsUpdate = true;
    depthOneMesh.computeBoundingSphere();

    for (const { coverMesh, settledMesh, stage } of stageMeshes) {
      if (!useSettledSurface) {
        if (stage.settledVoxels === null) {
          throw new Error("A directly rendered Menger stage must retain settled voxels.");
        }
        stage.settledVoxels.forEach((coordinate, index) => {
          writeMengerVoxelMatrix(matrix, coordinate, stage.gridSize);
          settledMesh.setMatrixAt(index, matrix);
        });
        settledMesh.instanceMatrix.needsUpdate = true;
        settledMesh.computeBoundingSphere();
      }
      stage.moves.forEach((move, index) => {
        writeMengerVoxelMatrix(matrix, move.from, stage.gridSize);
        coverMesh.setMatrixAt(index, matrix);
      });
      coverMesh.instanceMatrix.needsUpdate = true;
    }
    const stageBuffers = topology.stages.map((stage) =>
      createHoverStageBuffers(stage.channelCount),
    );
    const fitRadius = (MENGER_SCENE_WORLD_SIZE / 2) * Math.sqrt(3);
    const cameraDepthBounds = resolveLogoSceneCameraDepthBounds(fitRadius);
    camera.far = cameraDepthBounds.far;
    const pointerMediaQuery = window.matchMedia(LOGO_POINTER_TILT_MEDIA_QUERY);
    const presentationTiltAxisVector = new THREE.Vector3();
    const presentationTiltProjectionPoint = new THREE.Vector3();
    const presentationTiltScreenRightVector = new THREE.Vector3();
    const presentationTiltNeutralQuaternion = new THREE.Quaternion();
    const presentationTiltTargetQuaternion = new THREE.Quaternion();
    let presentationTiltClientPoint: ClientPoint | null = null;
    let presentationTiltTarget = NEUTRAL_LOGO_PRESENTATION_TILT_TARGET;
    let lastPresentationTiltFrameTime: number | null = null;

    const clearProbe = () => {
      delete container.dataset.hoverCoordinateX;
      delete container.dataset.hoverCoordinateY;
      delete container.dataset.hoverCoordinateZ;
      delete container.dataset.hoverFaceAxis;
      delete container.dataset.hoverFaceSign;
      delete container.dataset.hoverVisibleFaceCount;
    };

    /**
    The visible cube face planes extend without tangent limits. Their front
    envelope meets on the same projected edges and corner as the finite cube,
    so the pointer mapping stays continuous inside and outside the canvas.
    */
    const readProbe = (): MengerHoverProbe | null => {
      const clientPointer = clientPointerRef.current;
      if (clientPointer === null) {
        clearProbe();
        return null;
      }

      const bounds = renderer.domElement.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) {
        clearProbe();
        return null;
      }

      pointerNdc.set(
        ((clientPointer.x - bounds.left) / bounds.width) * 2 - 1,
        -((clientPointer.y - bounds.top) / bounds.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointerNdc, camera);
      localMatrix.copy(logoGroup.matrixWorld).invert();
      localRay.copy(raycaster.ray).applyMatrix4(localMatrix);
      const projection = projectMengerHoverLineToVisibleFacePlanes(
        localRay.origin,
        localRay.direction,
        MENGER_SCENE_WORLD_SIZE,
      );
      if (projection === null) {
        clearProbe();
        return null;
      }

      const probe: MengerHoverProbe = {
        x: projection.point.x / MENGER_SCENE_WORLD_SIZE + 0.5,
        y: projection.point.y / MENGER_SCENE_WORLD_SIZE + 0.5,
        z: projection.point.z / MENGER_SCENE_WORLD_SIZE + 0.5,
      };
      container.dataset.hoverCoordinateX = probe.x.toFixed(3);
      container.dataset.hoverCoordinateY = probe.y.toFixed(3);
      container.dataset.hoverCoordinateZ = probe.z.toFixed(3);
      container.dataset.hoverFaceAxis = String(projection.axis);
      container.dataset.hoverFaceSign = String(projection.sign);
      container.dataset.hoverVisibleFaceCount = String(projection.visibleFaceCount);

      return probe;
    };

    const settleChannelStates = (
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

    const scheduleFrame = () => {
      if (animationFrame !== 0) {
        return;
      }

      animationFrame = window.requestAnimationFrame((timestampMs) => {
        animationFrame = 0;
        renderScene(timestampMs);
      });
    };

    const updatePresentationTiltTarget = () => {
      const bounds = renderer.domElement.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) {
        presentationTiltTarget = NEUTRAL_LOGO_PRESENTATION_TILT_TARGET;
        return;
      }

      presentationTiltProjectionPoint.set(0, 0, 0).applyMatrix4(logoGroup.matrix).project(camera);
      const centerX = bounds.left + ((presentationTiltProjectionPoint.x + 1) * bounds.width) / 2;
      const centerY = bounds.top + ((1 - presentationTiltProjectionPoint.y) * bounds.height) / 2;
      const cubeHalfSize = MENGER_SCENE_WORLD_SIZE / 2;
      let baseRadius = 0;
      for (const xSign of MENGER_CUBE_CORNER_SIGNS) {
        for (const ySign of MENGER_CUBE_CORNER_SIGNS) {
          for (const zSign of MENGER_CUBE_CORNER_SIGNS) {
            presentationTiltProjectionPoint
              .set(xSign * cubeHalfSize, ySign * cubeHalfSize, zSign * cubeHalfSize)
              .applyMatrix4(logoGroup.matrix)
              .project(camera);
            const cornerX =
              bounds.left + ((presentationTiltProjectionPoint.x + 1) * bounds.width) / 2;
            const cornerY =
              bounds.top + ((1 - presentationTiltProjectionPoint.y) * bounds.height) / 2;
            baseRadius = Math.max(baseRadius, Math.hypot(cornerX - centerX, cornerY - centerY));
          }
        }
      }

      const radiusScale = normalizeLogoPresentationTiltRadiusScale(
        pointerTiltRadiusScaleRef.current,
      );
      container.dataset.presentationTiltCenterX = centerX.toFixed(3);
      container.dataset.presentationTiltCenterY = centerY.toFixed(3);
      container.dataset.presentationTiltBaseRadius = baseRadius.toFixed(3);
      container.dataset.presentationTiltNeutralRadius = (baseRadius * radiusScale).toFixed(3);
      presentationTiltTarget =
        presentationTiltClientPoint !== null && pointerMediaQuery.matches
          ? getRadialPointerLogoPresentationTiltTarget({
              baseRadius,
              centerX,
              centerY,
              clientX: presentationTiltClientPoint.x,
              clientY: presentationTiltClientPoint.y,
              radiusScale,
              strengthScale: pointerTiltStrengthScaleRef.current,
            })
          : NEUTRAL_LOGO_PRESENTATION_TILT_TARGET;
    };

    const applyPresentationTilt = (timestampMs: number): boolean => {
      const target =
        pointerTiltEnabledRef.current && !reducedMotionQuery.matches
          ? presentationTiltTarget
          : NEUTRAL_LOGO_PRESENTATION_TILT_TARGET;
      container.dataset.presentationHorizontalDegrees = target.horizontal.toFixed(3);
      container.dataset.presentationVerticalDegrees = target.vertical.toFixed(3);

      if (reducedMotionQuery.matches) {
        presentationTiltTargetQuaternion.identity();
        presentationTiltGroup.quaternion.identity();
        lastPresentationTiltFrameTime = timestampMs;
        return true;
      }

      if (interactionRef.current.status !== "idle") {
        presentationTiltTargetQuaternion.copy(presentationTiltGroup.quaternion);
      } else {
        const magnitude = Math.hypot(target.horizontal, target.vertical);
        if (magnitude === 0) {
          presentationTiltTargetQuaternion.identity();
        } else {
          presentationTiltScreenRightVector.crossVectors(camera.up, camera.position).normalize();
          presentationTiltAxisVector
            .copy(presentationTiltScreenRightVector)
            .multiplyScalar(-target.vertical)
            .addScaledVector(camera.up, target.horizontal)
            .normalize();
          presentationTiltTargetQuaternion.setFromAxisAngle(
            presentationTiltAxisVector,
            THREE.MathUtils.degToRad(magnitude),
          );
        }
      }

      const remainingAngle = presentationTiltGroup.quaternion.angleTo(
        presentationTiltTargetQuaternion,
      );
      if (remainingAngle <= THREE.MathUtils.degToRad(LOGO_PRESENTATION_TILT_SETTLED_DEGREES)) {
        presentationTiltGroup.quaternion.copy(presentationTiltTargetQuaternion);
        lastPresentationTiltFrameTime = timestampMs;
        return true;
      }

      const previousFrameTime = lastPresentationTiltFrameTime;
      lastPresentationTiltFrameTime = timestampMs;
      if (previousFrameTime === null) {
        return false;
      }

      presentationTiltGroup.quaternion.slerp(
        presentationTiltTargetQuaternion,
        getLogoPresentationTiltTransitionAlpha({
          deltaSeconds: (timestampMs - previousFrameTime) / 1000,
          remainingDegrees: THREE.MathUtils.radToDeg(remainingAngle),
        }),
      );
      return false;
    };

    const renderScene = (timestampMs?: number): void => {
      const cpuSubmissionStartedAt = performance.now();
      const now = timestampMs ?? performance.now();
      const view = viewRef.current;
      const [cameraX, cameraY, cameraZ] = getWorldCameraVector(view.elevationDegrees);
      const [upX, upY, upZ] = getWorldScreenVerticalAxis(view.elevationDegrees);
      camera.position.set(cameraX, cameraY, cameraZ).setLength(cameraDepthBounds.distance);
      camera.up.set(upX, upY, upZ);
      camera.lookAt(0, 0, 0);
      logoGroup.rotation.y = THREE.MathUtils.degToRad(
        toRenderedRotationDegrees(view.rotationDegrees),
      );
      logoGroup.updateMatrix();
      camera.updateMatrixWorld();
      updatePresentationTiltTarget();
      const presentationTiltSettled = applyPresentationTilt(now);
      presentationTiltGroup.updateMatrixWorld(true);

      depthOneMesh.visible = depthOneOnly;
      if (settledSurface) {
        settledSurface.mesh.visible = !depthOneOnly;
      }
      for (const stageMesh of stageMeshes) {
        stageMesh.settledMesh.visible =
          !depthOneOnly && settledSurface === null && stageMesh === finalStageMeshes;
        stageMesh.coverMesh.visible = !depthOneOnly;
      }

      if (depthOneOnly) {
        clearProbe();
        lastFrameTime = null;
        container.dataset.hoverMaximumOpenness = "0.000000";
        container.dataset.hoverSettled = "true";
      } else {
        const probe = readProbe();
        if (probe !== null) {
          directionProbe = probe;
        }
        writeMengerHoverState(hoverState, model, probe, directionProbe, revealRadiusRef.current);
        const previousFrameTime = lastFrameTime;
        lastFrameTime = now;
        const elapsedMs =
          previousFrameTime === null
            ? HOVER_FRAME_ELAPSED_RESTART_MS
            : Math.min(Math.max(now - previousFrameTime, 0), HOVER_FRAME_ELAPSED_MAX_MS);
        const smoothing = reducedMotionQuery.matches
          ? 1
          : 1 - Math.exp(-elapsedMs / HOVER_OPENNESS_SMOOTHING_TAU_MS);
        let settled = true;
        let maximumOpenness = 0;
        for (const [stageIndex, stageState] of hoverState.stages.entries()) {
          const buffers = stageBuffers[stageIndex];
          if (!settleChannelStates(stageState, buffers, smoothing)) {
            settled = false;
          }
          const stageTopology = topology.stages[stageIndex];
          for (const [channel, channelState] of stageState.entries()) {
            const textureOffset = (stageTopology.channelStateOffset + channel) * 4;
            stateTexture.data[textureOffset] = channelState.openness;
            stateTexture.data[textureOffset + 1] = channelState.signA;
            stateTexture.data[textureOffset + 2] = channelState.signB;
            stateTexture.data[textureOffset + 3] = channelState.weightA;
            maximumOpenness = Math.max(maximumOpenness, channelState.openness);
          }
        }
        stateTexture.texture.needsUpdate = true;
        container.dataset.hoverMaximumOpenness = maximumOpenness.toFixed(6);
        container.dataset.hoverSettled = settled ? "true" : "false";
        if (!settled) {
          scheduleFrame();
        } else {
          lastFrameTime = null;
        }
      }

      container.dataset.presentationTiltSettled = presentationTiltSettled ? "true" : "false";
      container.dataset.presentationAppliedAngleDegrees = THREE.MathUtils.radToDeg(
        presentationTiltGroup.quaternion.angleTo(presentationTiltNeutralQuaternion),
      ).toFixed(3);
      if (!presentationTiltSettled) {
        scheduleFrame();
      } else {
        lastPresentationTiltFrameTime = null;
      }

      renderer.render(scene, camera);
      container.dataset.hoverCpuSubmissionMs = (performance.now() - cpuSubmissionStartedAt).toFixed(
        3,
      );
      if (firstRenderPending) {
        firstRenderPending = false;
        container.dataset.hoverSceneBuildMs = (performance.now() - sceneBuildStartedAt).toFixed(3);
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
      renderScene();
    };

    const onWindowPointerMove = (event: PointerEvent) => {
      if (!event.isPrimary || event.pointerType === "touch") {
        return;
      }

      if (event.pointerType === "mouse") {
        presentationTiltClientPoint = { x: event.clientX, y: event.clientY };
      }
      if (event.buttons !== 0) {
        renderScene();
        return;
      }

      clientPointerRef.current = { x: event.clientX, y: event.clientY };
      renderScene();
    };
    const onWindowPointerUp = (event: PointerEvent) => {
      if (!event.isPrimary || event.pointerType === "touch") {
        return;
      }

      clientPointerRef.current = { x: event.clientX, y: event.clientY };
      if (event.pointerType === "mouse") {
        presentationTiltClientPoint = clientPointerRef.current;
      }
      renderScene();
    };
    const onWindowBlur = () => {
      presentationTiltClientPoint = null;
      renderScene();
    };
    const onPointerCapabilityChange = () => {
      renderScene();
    };
    const onReducedMotionChange = () => {
      renderScene();
    };
    const onPagePointerLeave = () => {
      clientPointerRef.current = null;
      presentationTiltClientPoint = null;
      renderScene();
    };
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("pointermove", onWindowPointerMove);
    window.addEventListener("pointerup", onWindowPointerUp);
    pointerMediaQuery.addEventListener("change", onPointerCapabilityChange);
    reducedMotionQuery.addEventListener("change", onReducedMotionChange);
    document.documentElement.addEventListener("pointerleave", onPagePointerLeave);

    renderSceneRef.current = renderScene;
    const resizeObserver = new ResizeObserver(resizeScene);
    resizeObserver.observe(container);
    resizeScene();

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("pointermove", onWindowPointerMove);
      window.removeEventListener("pointerup", onWindowPointerUp);
      pointerMediaQuery.removeEventListener("change", onPointerCapabilityChange);
      reducedMotionQuery.removeEventListener("change", onReducedMotionChange);
      document.documentElement.removeEventListener("pointerleave", onPagePointerLeave);
      renderSceneRef.current = () => {};
      if (animationFrame !== 0) {
        window.cancelAnimationFrame(animationFrame);
      }
      geometry.dispose();
      rightMaterial.dispose();
      topMaterial.dispose();
      leftMaterial.dispose();
      stateTexture.texture.dispose();
      settledSurface?.geometry.dispose();
      delete container.dataset.hoverChannelCount;
      delete container.dataset.hoverDynamicUploadBytes;
      delete container.dataset.hoverCpuSubmissionMs;
      delete container.dataset.hoverMaximumOpenness;
      delete container.dataset.hoverSceneBuildMs;
      delete container.dataset.hoverTriangleCount;
      delete container.dataset.hoverVisibleInstanceCount;
      delete container.dataset.presentationAppliedAngleDegrees;
      delete container.dataset.presentationTiltBaseRadius;
      delete container.dataset.presentationTiltCenterX;
      delete container.dataset.presentationTiltCenterY;
      delete container.dataset.presentationHorizontalDegrees;
      delete container.dataset.presentationTiltNeutralRadius;
      delete container.dataset.presentationTiltSettled;
      delete container.dataset.presentationVerticalDegrees;
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
  }, [interactionRef, leftFaceColor, maximumDepth, model, rightFaceColor, topFaceColor]);

  useEffect(() => {
    revealRadiusRef.current = revealRadius;
    renderSceneRef.current();
  }, [revealRadius]);

  useEffect(() => {
    pointerTiltEnabledRef.current = pointerTiltEnabled;
    renderSceneRef.current();
  }, [pointerTiltEnabled]);

  useEffect(() => {
    pointerTiltRadiusScaleRef.current = pointerTiltRadiusScale;
    renderSceneRef.current();
  }, [pointerTiltRadiusScale]);

  useEffect(() => {
    pointerTiltStrengthScaleRef.current = pointerTiltStrengthScale;
    renderSceneRef.current();
  }, [pointerTiltStrengthScale]);

  useEffect(() => {
    viewRef.current = { elevationDegrees, rotationDegrees };
    renderSceneRef.current();
  }, [elevationDegrees, rotationDegrees]);

  return (
    <div
      ref={containerRef}
      aria-label="Menger sponge hover reveal"
      className="h-full min-h-0 w-full cursor-grab touch-none select-none active:cursor-grabbing"
      data-menger-maximum-depth={maximumDepth}
      data-menger-pointer-tilt={pointerTiltEnabled ? "landing" : "off"}
      data-menger-pointer-tilt-radius-scale={pointerTiltRadiusScale}
      data-menger-pointer-tilt-strength-scale={pointerTiltStrengthScale}
      data-menger-research-mode="hover"
      data-logo-elevation-degrees={elevationDegrees}
      data-logo-rotation-degrees={rotationDegrees}
      data-testid="logo-menger-hover-scene"
      onContextMenu={handleContextMenu}
      onPointerCancel={handlePointerCancel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      role="img"
    />
  );
}
