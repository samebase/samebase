import { getTailwindColorHex, type FaceColors } from "@/components/logo/logoTailwindColors";
import {
  getRadialPointerLogoPresentationTiltTarget,
  getLogoPresentationTiltTransitionAlpha,
  LOGO_POINTER_TILT_MEDIA_QUERY,
  LOGO_PRESENTATION_TILT_SETTLED_DEGREES,
  NEUTRAL_LOGO_PRESENTATION_TILT_TARGET,
  normalizeLogoPresentationTiltRadiusScale,
} from "@/components/logo/logoPresentationTilt";
import {
  LOGO_SCENE_CAMERA_EDGE_CLEARANCE_CSS_PIXELS,
  resolveLogoSceneCameraDepthBounds,
} from "@/components/logo/logoSceneCameraDepth";
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
import {
  readMengerAutomaticProbePoint,
  type MengerAutomaticProbeMotionSettings,
} from "@/components/logo/mengerAutomaticProbe";
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

const HOVER_FRAME_ELAPSED_MAX_MS = 100;
const HOVER_FRAME_ELAPSED_RESTART_MS = 1000 / 60;
const HOVER_OPENNESS_SETTLE_EPSILON = 0.001;
const HOVER_OPENNESS_SMOOTHING_TAU_MS = 58;
const MENGER_CUBE_CORNER_SIGNS = [-1, 1] as const;
const MAXIMUM_HOST_TIMEOUT_DELAY_MS = 2_147_483_647;
const RENDER_PIXEL_RATIO_MAX = 2;

type ClientPoint = {
  x: number;
  y: number;
};

function hasFiniteSquaredLength(...components: number[]): boolean {
  let squaredLength = 0;
  for (const component of components) {
    if (!Number.isFinite(component)) {
      return false;
    }
    squaredLength += component * component;
  }
  return Number.isFinite(squaredLength);
}

function hasFiniteVector3(vector: THREE.Vector3): boolean {
  return hasFiniteSquaredLength(vector.x, vector.y, vector.z);
}

type MengerHoverStageMeshes = {
  blockerLinkTexture: MengerHoverTexture;
  coverGeometry: THREE.BufferGeometry;
  coverMaterials: THREE.ShaderMaterial[];
  coverMesh: THREE.InstancedMesh;
  settledMesh: THREE.InstancedMesh;
  stage: MengerDepthTransitionStage;
};

export function MengerHoverScene({
  automaticProbe,
  cameraFrustumPadding,
  elevationDegrees,
  faceColors,
  maximumDepth,
  onInteractionEnd,
  onRenderReady,
  onRenderUnavailable,
  onViewChange,
  pointerTiltEnabled,
  pointerTiltRadiusScale,
  pointerTiltStrengthScale,
  revealRadius,
  rotationDegrees,
  viewSnapEnabled,
}: {
  automaticProbe: MengerAutomaticProbeMotionSettings;
  cameraFrustumPadding: number;
  elevationDegrees: number;
  faceColors: FaceColors;
  maximumDepth: number;
  onInteractionEnd: (finalView: LogoViewState) => void;
  onRenderReady?: () => void;
  onRenderUnavailable?: () => void;
  onViewChange: (nextView: LogoViewState) => void;
  pointerTiltEnabled: boolean;
  pointerTiltRadiusScale: number;
  pointerTiltStrengthScale: number;
  revealRadius: number;
  rotationDegrees: number;
  viewSnapEnabled: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const automaticProbeRef = useRef(automaticProbe);
  const automaticProbeCycleStartedAtMsRef = useRef(0);
  const automaticProbeResumeAtMsRef = useRef(0);
  const automaticProbeResumeTimeoutRef = useRef(0);
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
    let automaticProbeClientPoint: ClientPoint | null = null;
    let renderCount = 0;
    let sceneIsVisible = true;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
      });
    } catch (error: unknown) {
      console.error("Failed to create Menger hover renderer", error);
      onRenderUnavailable?.();
      return;
    }
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
    const hoverTargetState = createMengerHoverState(model);
    const hoverRenderedState = createMengerHoverState(model);
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
    container.dataset["hoverChannelCount"] = String(depthOneOnly ? 0 : topology.channelCount);
    container.dataset["hoverDynamicUploadBytes"] = String(
      depthOneOnly ? 0 : stateTexture.data.byteLength,
    );
    container.dataset["hoverTriangleCount"] = String(
      settledTriangleCount + coverInstanceCount * 48,
    );
    container.dataset["hoverVisibleInstanceCount"] = String(
      settledInstanceCount + coverInstanceCount,
    );

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

    const clearAutomaticProbeClientPoint = (state: "invalid" | "off" | "resting" | "suspended") => {
      automaticProbeClientPoint = null;
      container.dataset["automaticProbeState"] = state;
      delete container.dataset["automaticProbeClientX"];
      delete container.dataset["automaticProbeClientY"];
      delete container.dataset["automaticProbeProgress"];
    };

    const invalidateAutomaticProbe = () => {
      clearAutomaticProbeClientPoint("invalid");
      presentationTiltTarget = NEUTRAL_LOGO_PRESENTATION_TILT_TARGET;
      lastPresentationTiltFrameTime = null;
    };

    const scheduleAutomaticProbeResume = (resumeAtMs: number) => {
      const remainingMs = resumeAtMs - performance.now();
      if (!Number.isFinite(resumeAtMs) || !Number.isFinite(remainingMs)) {
        invalidateAutomaticProbe();
        return;
      }
      if (automaticProbeResumeTimeoutRef.current !== 0) {
        window.clearTimeout(automaticProbeResumeTimeoutRef.current);
      }
      automaticProbeResumeTimeoutRef.current = window.setTimeout(
        () => {
          automaticProbeResumeTimeoutRef.current = 0;
          scheduleFrame();
        },
        Math.min(Math.max(remainingMs, 0), MAXIMUM_HOST_TIMEOUT_DELAY_MS),
      );
    };

    const updateAutomaticProbeClientPoint = (timestampMs: number): boolean => {
      const settings = automaticProbeRef.current;
      if (!settings.enabled) {
        clearAutomaticProbeClientPoint("off");
        return false;
      }
      if (document.visibilityState !== "visible" || !sceneIsVisible) {
        clearAutomaticProbeClientPoint("suspended");
        return false;
      }

      const bounds = renderer.domElement.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) {
        clearAutomaticProbeClientPoint("suspended");
        return false;
      }

      let automaticProbeNeedsFrame = true;
      let progress: number;
      if (reducedMotionQuery.matches) {
        const point = readMengerAutomaticProbePoint(
          settings.path,
          0,
          settings.width,
          settings.height,
          settings.startProgress,
          settings.verticalOffset,
        );
        automaticProbeClientPoint = {
          x: bounds.left + point.x * bounds.width,
          y: bounds.top + point.y * bounds.height,
        };
        container.dataset["automaticProbeState"] = "reduced-motion";
        container.dataset["automaticProbeClientX"] = automaticProbeClientPoint.x.toFixed(3);
        container.dataset["automaticProbeClientY"] = automaticProbeClientPoint.y.toFixed(3);
        container.dataset["automaticProbeProgress"] = "0.0000";
        return false;
      } else {
        if (timestampMs < automaticProbeResumeAtMsRef.current) {
          progress = 1;
          automaticProbeNeedsFrame = false;
          container.dataset["automaticProbeState"] = "resting";
          scheduleAutomaticProbeResume(automaticProbeResumeAtMsRef.current);
        } else {
          if (automaticProbeResumeAtMsRef.current > 0) {
            automaticProbeCycleStartedAtMsRef.current = timestampMs;
            automaticProbeResumeAtMsRef.current = 0;
          } else if (automaticProbeCycleStartedAtMsRef.current === 0) {
            automaticProbeCycleStartedAtMsRef.current = timestampMs;
          }

          const loopDurationMs = settings.loopDurationSeconds * 1_000;
          const restDurationMs = settings.restDurationSeconds * 1_000;
          const cycleDurationMs = loopDurationMs + restDurationMs;
          if (
            !Number.isFinite(loopDurationMs) ||
            loopDurationMs <= 0 ||
            !Number.isFinite(restDurationMs) ||
            restDurationMs < 0 ||
            !Number.isFinite(cycleDurationMs) ||
            cycleDurationMs <= 0
          ) {
            invalidateAutomaticProbe();
            return false;
          }
          const cycleElapsedMs =
            (timestampMs - automaticProbeCycleStartedAtMsRef.current) / cycleDurationMs;
          const cycleProgressMs = (cycleElapsedMs - Math.floor(cycleElapsedMs)) * cycleDurationMs;
          if (
            !Number.isFinite(cycleElapsedMs) ||
            !Number.isFinite(cycleProgressMs) ||
            cycleProgressMs < 0
          ) {
            invalidateAutomaticProbe();
            return false;
          }
          if (cycleProgressMs >= loopDurationMs) {
            progress = 1;
            automaticProbeNeedsFrame = false;
            container.dataset["automaticProbeState"] = "resting";
            const resumeAtMs = timestampMs + cycleDurationMs - cycleProgressMs;
            automaticProbeResumeAtMsRef.current = resumeAtMs;
            scheduleAutomaticProbeResume(resumeAtMs);
          } else {
            progress = cycleProgressMs / loopDurationMs;
            container.dataset["automaticProbeState"] = "playing";
          }
        }
      }

      const point = readMengerAutomaticProbePoint(
        settings.path,
        progress,
        settings.width,
        settings.height,
        settings.startProgress,
        settings.verticalOffset,
      );
      const clientX = bounds.left + point.x * bounds.width;
      const clientY = bounds.top + point.y * bounds.height;
      const clientOffsetX = clientX - (bounds.left + bounds.width / 2);
      const clientOffsetY = clientY - (bounds.top + bounds.height / 2);
      if (
        !Number.isFinite(progress) ||
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y) ||
        !Number.isFinite(clientX) ||
        !Number.isFinite(clientY) ||
        !hasFiniteSquaredLength(clientOffsetX, clientOffsetY)
      ) {
        invalidateAutomaticProbe();
        return false;
      }
      automaticProbeClientPoint = { x: clientX, y: clientY };
      container.dataset["automaticProbeClientX"] = automaticProbeClientPoint.x.toFixed(3);
      container.dataset["automaticProbeClientY"] = automaticProbeClientPoint.y.toFixed(3);
      container.dataset["automaticProbeProgress"] = progress.toFixed(4);

      return automaticProbeNeedsFrame && (!depthOneOnly || pointerTiltEnabledRef.current);
    };

    const clearProbe = () => {
      delete container.dataset["hoverCoordinateX"];
      delete container.dataset["hoverCoordinateY"];
      delete container.dataset["hoverCoordinateZ"];
      delete container.dataset["hoverFaceAxis"];
      delete container.dataset["hoverFaceSign"];
      delete container.dataset["hoverVisibleFaceCount"];
    };

    /**
    The visible cube face planes extend without tangent limits. Their front
    envelope meets on the same projected edges and corner as the finite cube,
    so the pointer mapping stays continuous inside and outside the canvas.
    */
    const readProbe = (): MengerHoverProbe | null => {
      const clientPointer = automaticProbeClientPoint ?? clientPointerRef.current;
      const automaticClientPointer = automaticProbeClientPoint !== null;
      if (clientPointer === null) {
        clearProbe();
        return null;
      }
      const rejectInvalidProbe = (): null => {
        clearProbe();
        if (automaticClientPointer) {
          invalidateAutomaticProbe();
        }
        return null;
      };

      const bounds = renderer.domElement.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) {
        clearProbe();
        return null;
      }

      const clientOffsetX = clientPointer.x - bounds.left;
      const clientOffsetY = clientPointer.y - bounds.top;
      pointerNdc.set(
        (clientOffsetX / bounds.width) * 2 - 1,
        -(clientOffsetY / bounds.height) * 2 + 1,
      );
      if (!hasFiniteSquaredLength(pointerNdc.x, pointerNdc.y)) {
        return rejectInvalidProbe();
      }
      raycaster.setFromCamera(pointerNdc, camera);
      if (!hasFiniteVector3(raycaster.ray.origin) || !hasFiniteVector3(raycaster.ray.direction)) {
        return rejectInvalidProbe();
      }
      localMatrix.copy(logoGroup.matrixWorld).invert();
      localRay.copy(raycaster.ray).applyMatrix4(localMatrix);
      if (!hasFiniteVector3(localRay.origin) || !hasFiniteVector3(localRay.direction)) {
        return rejectInvalidProbe();
      }
      const projection = projectMengerHoverLineToVisibleFacePlanes(
        localRay.origin,
        localRay.direction,
        MENGER_SCENE_WORLD_SIZE,
      );
      if (projection === null) {
        clearProbe();
        return null;
      }
      if (!hasFiniteSquaredLength(projection.point.x, projection.point.y, projection.point.z)) {
        return rejectInvalidProbe();
      }

      const probe: MengerHoverProbe = {
        x: projection.point.x / MENGER_SCENE_WORLD_SIZE + 0.5,
        y: projection.point.y / MENGER_SCENE_WORLD_SIZE + 0.5,
        z: projection.point.z / MENGER_SCENE_WORLD_SIZE + 0.5,
      };
      if (!hasFiniteSquaredLength(probe.x, probe.y, probe.z)) {
        return rejectInvalidProbe();
      }
      container.dataset["hoverCoordinateX"] = probe.x.toFixed(3);
      container.dataset["hoverCoordinateY"] = probe.y.toFixed(3);
      container.dataset["hoverCoordinateZ"] = probe.z.toFixed(3);
      container.dataset["hoverFaceAxis"] = String(projection.axis);
      container.dataset["hoverFaceSign"] = String(projection.sign);
      container.dataset["hoverVisibleFaceCount"] = String(projection.visibleFaceCount);

      return probe;
    };

    const scheduleFrame = () => {
      if (animationFrame !== 0 || document.visibilityState !== "visible" || !sceneIsVisible) {
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
      container.dataset["presentationTiltCenterX"] = centerX.toFixed(3);
      container.dataset["presentationTiltCenterY"] = centerY.toFixed(3);
      container.dataset["presentationTiltBaseRadius"] = baseRadius.toFixed(3);
      container.dataset["presentationTiltNeutralRadius"] = (baseRadius * radiusScale).toFixed(3);
      const tiltClientPoint = automaticProbeClientPoint ?? presentationTiltClientPoint;
      const tiltClientPointEnabled =
        automaticProbeClientPoint !== null ||
        (presentationTiltClientPoint !== null && pointerMediaQuery.matches);
      const nextPresentationTiltTarget =
        tiltClientPoint !== null && tiltClientPointEnabled
          ? getRadialPointerLogoPresentationTiltTarget({
              baseRadius,
              centerX,
              centerY,
              clientX: tiltClientPoint.x,
              clientY: tiltClientPoint.y,
              radiusScale,
              strengthScale: pointerTiltStrengthScaleRef.current,
            })
          : NEUTRAL_LOGO_PRESENTATION_TILT_TARGET;
      if (
        automaticProbeClientPoint !== null &&
        !hasFiniteSquaredLength(
          nextPresentationTiltTarget.horizontal,
          nextPresentationTiltTarget.vertical,
        )
      ) {
        invalidateAutomaticProbe();
        return;
      }
      presentationTiltTarget = nextPresentationTiltTarget;
    };

    const applyPresentationTilt = (timestampMs: number): boolean => {
      const target =
        pointerTiltEnabledRef.current && !reducedMotionQuery.matches
          ? presentationTiltTarget
          : NEUTRAL_LOGO_PRESENTATION_TILT_TARGET;
      container.dataset["presentationHorizontalDegrees"] = target.horizontal.toFixed(3);
      container.dataset["presentationVerticalDegrees"] = target.vertical.toFixed(3);

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
      if (document.visibilityState !== "visible" || !sceneIsVisible) {
        return;
      }

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
      const automaticProbeNeedsFrame = updateAutomaticProbeClientPoint(now);
      updatePresentationTiltTarget();
      const presentationTiltSettled =
        container.dataset["automaticProbeState"] === "invalid" || applyPresentationTilt(now);
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
        container.dataset["hoverMaximumOpenness"] = "0.000000";
        container.dataset["hoverSettled"] = "true";
      } else {
        const probe = readProbe();
        if (probe !== null) {
          directionProbe = probe;
        }
        if (container.dataset["automaticProbeState"] === "invalid") {
          lastFrameTime = null;
        } else {
          writeMengerHoverState(
            hoverTargetState,
            model,
            probe,
            directionProbe,
            revealRadiusRef.current,
          );
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
          for (let stageIndex = 0; stageIndex < hoverTargetState.stages.length; stageIndex += 1) {
            const targetStageState = hoverTargetState.stages[stageIndex];
            const renderedStageState = hoverRenderedState.stages[stageIndex];
            const stageTopology = topology.stages[stageIndex];

            for (let channel = 0; channel < targetStageState.length; channel += 1) {
              const targetChannelState = targetStageState[channel];
              const renderedChannelState = renderedStageState[channel];
              const nextOpenness =
                renderedChannelState.openness +
                (targetChannelState.openness - renderedChannelState.openness) * smoothing;
              renderedChannelState.openness =
                Math.abs(nextOpenness - targetChannelState.openness) < HOVER_OPENNESS_SETTLE_EPSILON
                  ? targetChannelState.openness
                  : nextOpenness;
              renderedChannelState.anchorA = targetChannelState.anchorA;
              renderedChannelState.anchorB = targetChannelState.anchorB;
              renderedChannelState.weightA = targetChannelState.weightA;
              if (renderedChannelState.openness !== targetChannelState.openness) {
                settled = false;
              }
              const textureOffset = (stageTopology.channelStateOffset + channel) * 4;
              stateTexture.data[textureOffset] = renderedChannelState.openness;
              stateTexture.data[textureOffset + 1] = renderedChannelState.anchorA;
              stateTexture.data[textureOffset + 2] = renderedChannelState.anchorB;
              stateTexture.data[textureOffset + 3] = renderedChannelState.weightA;
              maximumOpenness = Math.max(maximumOpenness, renderedChannelState.openness);
            }
          }
          stateTexture.texture.needsUpdate = true;
          container.dataset["hoverMaximumOpenness"] = maximumOpenness.toFixed(6);
          container.dataset["hoverSettled"] = settled ? "true" : "false";
          if (!settled) {
            scheduleFrame();
          } else {
            lastFrameTime = null;
          }
        }
      }

      container.dataset["presentationTiltSettled"] = presentationTiltSettled ? "true" : "false";
      container.dataset["presentationAppliedAngleDegrees"] = THREE.MathUtils.radToDeg(
        presentationTiltGroup.quaternion.angleTo(presentationTiltNeutralQuaternion),
      ).toFixed(3);
      if (!presentationTiltSettled && container.dataset["automaticProbeState"] !== "invalid") {
        scheduleFrame();
      } else {
        lastPresentationTiltFrameTime = null;
      }
      if (automaticProbeNeedsFrame && container.dataset["automaticProbeState"] !== "invalid") {
        scheduleFrame();
      }

      renderer.render(scene, camera);
      renderCount += 1;
      container.dataset["hoverRenderCount"] = String(renderCount);
      container.dataset["hoverCpuSubmissionMs"] = (
        performance.now() - cpuSubmissionStartedAt
      ).toFixed(3);
      if (firstRenderPending) {
        firstRenderPending = false;
        container.dataset["hoverSceneBuildMs"] = (performance.now() - sceneBuildStartedAt).toFixed(
          3,
        );
        onRenderReady?.();
      }
    };

    const resizeScene = () => {
      const width = container.clientWidth || 640;
      const height = container.clientHeight || 640;
      const aspect = width / height;
      const shortestSide = Math.min(width, height);
      const edgeClearanceScale =
        shortestSide / Math.max(shortestSide - LOGO_SCENE_CAMERA_EDGE_CLEARANCE_CSS_PIXELS * 2, 1);
      const frustumHalfSpan = fitRadius * cameraFrustumPadding * edgeClearanceScale;
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
      if (
        !event.isPrimary ||
        event.pointerType === "touch" ||
        document.visibilityState !== "visible" ||
        !sceneIsVisible
      ) {
        return;
      }

      if (event.pointerType === "mouse") {
        presentationTiltClientPoint = { x: event.clientX, y: event.clientY };
      }
      if (event.buttons !== 0) {
        if (interactionRef.current.status === "idle") {
          scheduleFrame();
        }
        return;
      }

      clientPointerRef.current = { x: event.clientX, y: event.clientY };
      scheduleFrame();
    };
    const onWindowPointerUp = (event: PointerEvent) => {
      if (
        !event.isPrimary ||
        event.pointerType === "touch" ||
        document.visibilityState !== "visible" ||
        !sceneIsVisible
      ) {
        return;
      }

      clientPointerRef.current = { x: event.clientX, y: event.clientY };
      if (event.pointerType === "mouse") {
        presentationTiltClientPoint = clientPointerRef.current;
      }
      scheduleFrame();
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
      scheduleFrame();
    };
    const suspendAutomaticProbeFrames = () => {
      if (animationFrame !== 0) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      }
      if (automaticProbeResumeTimeoutRef.current !== 0) {
        window.clearTimeout(automaticProbeResumeTimeoutRef.current);
        automaticProbeResumeTimeoutRef.current = 0;
      }
    };
    const restartAutomaticProbeAtStart = () => {
      automaticProbeCycleStartedAtMsRef.current = 0;
      automaticProbeResumeAtMsRef.current = 0;
    };
    const onDocumentVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        restartAutomaticProbeAtStart();
        scheduleFrame();
        return;
      }

      suspendAutomaticProbeFrames();
      clearAutomaticProbeClientPoint("suspended");
    };
    const sceneVisibilityObserver = new IntersectionObserver((entries) => {
      const entry = entries[0];
      sceneIsVisible = entry.isIntersecting;
      if (sceneIsVisible) {
        restartAutomaticProbeAtStart();
        scheduleFrame();
        return;
      }

      suspendAutomaticProbeFrames();
      clearAutomaticProbeClientPoint("suspended");
    });
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("pointermove", onWindowPointerMove);
    window.addEventListener("pointerup", onWindowPointerUp);
    pointerMediaQuery.addEventListener("change", onPointerCapabilityChange);
    reducedMotionQuery.addEventListener("change", onReducedMotionChange);
    document.addEventListener("visibilitychange", onDocumentVisibilityChange);
    document.documentElement.addEventListener("pointerleave", onPagePointerLeave);
    sceneVisibilityObserver.observe(container);

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
      document.removeEventListener("visibilitychange", onDocumentVisibilityChange);
      document.documentElement.removeEventListener("pointerleave", onPagePointerLeave);
      sceneVisibilityObserver.disconnect();
      renderSceneRef.current = () => {};
      if (animationFrame !== 0) {
        window.cancelAnimationFrame(animationFrame);
      }
      if (automaticProbeResumeTimeoutRef.current !== 0) {
        window.clearTimeout(automaticProbeResumeTimeoutRef.current);
        automaticProbeResumeTimeoutRef.current = 0;
      }
      geometry.dispose();
      rightMaterial.dispose();
      topMaterial.dispose();
      leftMaterial.dispose();
      stateTexture.texture.dispose();
      settledSurface?.geometry.dispose();
      clearProbe();
      delete container.dataset["hoverChannelCount"];
      delete container.dataset["hoverDynamicUploadBytes"];
      delete container.dataset["hoverCpuSubmissionMs"];
      delete container.dataset["hoverMaximumOpenness"];
      delete container.dataset["hoverRenderCount"];
      delete container.dataset["hoverSceneBuildMs"];
      delete container.dataset["hoverSettled"];
      delete container.dataset["hoverTriangleCount"];
      delete container.dataset["hoverVisibleInstanceCount"];
      delete container.dataset["automaticProbeClientX"];
      delete container.dataset["automaticProbeClientY"];
      delete container.dataset["automaticProbeProgress"];
      delete container.dataset["automaticProbeState"];
      delete container.dataset["presentationAppliedAngleDegrees"];
      delete container.dataset["presentationTiltBaseRadius"];
      delete container.dataset["presentationTiltCenterX"];
      delete container.dataset["presentationTiltCenterY"];
      delete container.dataset["presentationHorizontalDegrees"];
      delete container.dataset["presentationTiltNeutralRadius"];
      delete container.dataset["presentationTiltSettled"];
      delete container.dataset["presentationVerticalDegrees"];
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
  }, [
    cameraFrustumPadding,
    interactionRef,
    leftFaceColor,
    maximumDepth,
    model,
    onRenderReady,
    onRenderUnavailable,
    rightFaceColor,
    topFaceColor,
  ]);

  useEffect(() => {
    automaticProbeRef.current = {
      enabled: automaticProbe.enabled,
      height: automaticProbe.height,
      loopDurationSeconds: automaticProbe.loopDurationSeconds,
      path: automaticProbe.path,
      restDurationSeconds: automaticProbe.restDurationSeconds,
      startProgress: automaticProbe.startProgress,
      verticalOffset: automaticProbe.verticalOffset,
      width: automaticProbe.width,
    };
    automaticProbeCycleStartedAtMsRef.current = 0;
    automaticProbeResumeAtMsRef.current = 0;
    if (automaticProbeResumeTimeoutRef.current !== 0) {
      window.clearTimeout(automaticProbeResumeTimeoutRef.current);
      automaticProbeResumeTimeoutRef.current = 0;
    }
    renderSceneRef.current();
  }, [
    automaticProbe.enabled,
    automaticProbe.height,
    automaticProbe.loopDurationSeconds,
    automaticProbe.path,
    automaticProbe.restDurationSeconds,
    automaticProbe.startProgress,
    automaticProbe.verticalOffset,
    automaticProbe.width,
  ]);

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
      data-menger-automatic-probe={automaticProbe.enabled ? "play" : "off"}
      data-menger-automatic-probe-path={automaticProbe.path}
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
