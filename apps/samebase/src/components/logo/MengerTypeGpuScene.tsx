import {
  getTailwindColorHex,
  type FaceColors,
  type HexColorToken,
} from "@/components/logo/logoTailwindColors";
import { createLogoRouteVoxelGrid } from "@/components/logo/logoRouteRenderState";
import { LOGO_SCENE_CAMERA_EDGE_CLEARANCE_CSS_PIXELS } from "@/components/logo/logoSceneCameraDepth";
import { createStaticLogoSvgDataUrl } from "@/components/logo/logoStaticSvgAsset";
import { type LogoViewState } from "@/components/logo/logoViewDrag";
import {
  getLogoPresentationTiltTransitionAlpha,
  getRadialPointerLogoPresentationTiltTarget,
  LOGO_PRESENTATION_TILT_SETTLED_DEGREES,
  LOGO_PRESENTATION_TILT_SUSPEND_ATTRIBUTE,
  NEUTRAL_LOGO_PRESENTATION_TILT_TARGET,
  normalizeLogoPresentationTiltRadiusScale,
} from "@/components/logo/logoPresentationTilt";
import {
  readMengerAutomaticProbePoint,
  type MengerAutomaticProbeMotionSettings,
} from "@/components/logo/mengerAutomaticProbe";
import {
  MENGER_TYPE_GPU_ANTIALIASING_SETTINGS,
  MENGER_TYPE_GPU_MAXIMUM_DEPTH,
  type MengerTypeGpuAntialiasing,
} from "@/components/logo/mengerTypeGpuSettings";
import { useLogoViewDrag } from "@/components/logo/useLogoViewDrag";
import { usePrimaryFineHoverPointer } from "@/hooks/pointerCapabilities";
import { PUBLIC_LANDING_LOGO_VIEW_DRAG_CONFIG } from "@/lib/publicLandingLogo";
import {
  MENGER_HOVER_DEFAULT_REVEAL_RADIUS,
  MENGER_HOVER_FRAME_ELAPSED_MAX_MS,
  MENGER_HOVER_FRAME_ELAPSED_RESTART_MS,
  MENGER_HOVER_FULL_OPEN_RADIUS_FRACTION,
  MENGER_HOVER_OPENNESS_SETTLE_EPSILON,
  MENGER_HOVER_OPENNESS_SMOOTHING_TAU_MS,
  projectMengerHoverLineToVisibleFacePlanes,
  type MengerHoverProbe,
} from "@samebase/logo-model/menger-hover";
import {
  addVectors,
  crossProduct,
  dotProduct,
  getWorldCameraVector,
  getWorldScreenVerticalAxis,
  normalizeVector,
  rotateVectorAroundAxis,
  scaleVector,
  toRenderedRotationDegrees,
  type Vector3,
} from "@samebase/logo-model/rotation";
import { LOGO_GRID_SIZE_3, MENGER_SPONGE_VOXEL_STATE } from "@samebase/logo-model/voxel";
import { useEffect, useMemo, useRef, useState } from "react";
import { common, d, std, tgpu } from "typegpu";

const CAMERA_DISTANCE = 4;
const CAMERA_FIT_RADIUS = Math.sqrt(3);
const MAXIMUM_DEVICE_PIXEL_RATIO = 2;
const GPU_TIMING_FRAME_INTERVAL = 6;
const MAXIMUM_HOST_TIMEOUT_DELAY_MS = 2_147_483_647;
const MAXIMUM_ANTIALIASING_GRID_SIZE = 4;
const MAXIMUM_RAY_STEPS = 128;
const MENGER_CUBE_CORNER_SIGNS = [-1, 1] as const;
const MENGER_TYPE_GPU_HOVER_STATE = d.struct({
  openness: d.f32,
  probe: d.vec3f,
  revealRadius: d.f32,
});
const MENGER_TYPE_GPU_SCENE_STATE = d.struct({
  antialiasingGridSize: d.i32,
  aspectRatio: d.f32,
  frustumHalfSpan: d.f32,
  pixelSize: d.f32,
  selectedDepth: d.i32,
  surfaceThreshold: d.f32,
});
const STATIC_MENGER_VOXEL_GRID = createLogoRouteVoxelGrid({
  fractalDepth: 1,
  gridSize: LOGO_GRID_SIZE_3,
  voxelState: MENGER_SPONGE_VOXEL_STATE,
});

type SceneStatus = "initializing" | "ready" | "unavailable";
export type MengerTypeGpuPerformanceReport =
  | {
      kind: "sample";
      gpuPassMilliseconds: number;
      renderHeight: number;
      renderWidth: number;
    }
  | { kind: "unsupported" };
type CameraFrame = {
  cameraVector: Vector3;
  right: Vector3;
  up: Vector3;
};
type ClientPoint = {
  x: number;
  y: number;
};
type SceneColors = {
  background: HexColorToken;
  left: HexColorToken;
  right: HexColorToken;
  top: HexColorToken;
};
type Quaternion = readonly [number, number, number, number];
type HoverProjection = NonNullable<ReturnType<typeof projectMengerHoverLineToVisibleFacePlanes>>;
type HoverProbeProjection = {
  probe: MengerHoverProbe;
  projection: HoverProjection;
};

const IDENTITY_QUATERNION: Quaternion = [0, 0, 0, 1];

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

function readHexChannel(hex: string, start: number): number {
  return Number.parseInt(hex.slice(start, start + 2), 16) / 255;
}

function readGpuColor(color: HexColorToken): d.v3f {
  const source = color.slice(1);
  const hex =
    source.length === 3
      ? `${source[0]}${source[0]}${source[1]}${source[1]}${source[2]}${source[2]}`
      : source;
  if (hex.length !== 6) {
    return d.vec3f(0);
  }

  return d.vec3f(readHexChannel(hex, 0), readHexChannel(hex, 2), readHexChannel(hex, 4));
}

function normalizeQuaternion([x, y, z, w]: Quaternion): Quaternion {
  const length = Math.hypot(x, y, z, w);
  return length === 0 ? IDENTITY_QUATERNION : [x / length, y / length, z / length, w / length];
}

function createAxisAngleQuaternion(axis: Vector3, angleDegrees: number): Quaternion {
  const halfAngleRadians = (angleDegrees * Math.PI) / 360;
  const sine = Math.sin(halfAngleRadians);
  return normalizeQuaternion([
    axis[0] * sine,
    axis[1] * sine,
    axis[2] * sine,
    Math.cos(halfAngleRadians),
  ]);
}

function readQuaternionAngleDegrees(left: Quaternion, right: Quaternion): number {
  const dot = Math.abs(
    Math.min(
      Math.max(
        left[0] * right[0] + left[1] * right[1] + left[2] * right[2] + left[3] * right[3],
        -1,
      ),
      1,
    ),
  );
  return (Math.acos(dot) * 360) / Math.PI;
}

function slerpQuaternion(from: Quaternion, to: Quaternion, alpha: number): Quaternion {
  if (alpha <= 0) {
    return from;
  }
  if (alpha >= 1) {
    return to;
  }

  let target: Quaternion = to;
  let dot = from[0] * to[0] + from[1] * to[1] + from[2] * to[2] + from[3] * to[3];
  if (dot < 0) {
    target = [-to[0], -to[1], -to[2], -to[3]];
    dot = -dot;
  }
  if (dot > 0.9995) {
    return normalizeQuaternion([
      from[0] + (target[0] - from[0]) * alpha,
      from[1] + (target[1] - from[1]) * alpha,
      from[2] + (target[2] - from[2]) * alpha,
      from[3] + (target[3] - from[3]) * alpha,
    ]);
  }

  const angle = Math.acos(Math.min(Math.max(dot, -1), 1));
  const sine = Math.sin(angle);
  const fromWeight = Math.sin((1 - alpha) * angle) / sine;
  const targetWeight = Math.sin(alpha * angle) / sine;
  return normalizeQuaternion([
    from[0] * fromWeight + target[0] * targetWeight,
    from[1] * fromWeight + target[1] * targetWeight,
    from[2] * fromWeight + target[2] * targetWeight,
    from[3] * fromWeight + target[3] * targetWeight,
  ]);
}

function rotateVectorByInverseQuaternion(vector: Vector3, quaternion: Quaternion): Vector3 {
  const quaternionVector = scaleVector([quaternion[0], quaternion[1], quaternion[2]], -1);
  const twiceCross = scaleVector(crossProduct(quaternionVector, vector), 2);
  return addVectors(
    addVectors(vector, scaleVector(twiceCross, quaternion[3])),
    crossProduct(quaternionVector, twiceCross),
  );
}

function readWorldCameraFrame(elevationDegrees: number): CameraFrame {
  const cameraVector = getWorldCameraVector(elevationDegrees);
  const up = getWorldScreenVerticalAxis(elevationDegrees);
  const right = normalizeVector(crossProduct(scaleVector(cameraVector, -1), up));
  return { cameraVector, right, up };
}

function readCameraFrame(view: LogoViewState, presentationTiltQuaternion: Quaternion): CameraFrame {
  const worldFrame = readWorldCameraFrame(view.elevationDegrees);
  const inverseRotationDegrees = -toRenderedRotationDegrees(view.rotationDegrees);
  // The rendered object applies cube-Y rotation, then presentation tilt.
  // GPU rays and the CPU probe apply their inverses in reverse order.
  const readLocalVector = (vector: Vector3) =>
    rotateVectorAroundAxis(
      rotateVectorByInverseQuaternion(vector, presentationTiltQuaternion),
      [0, 1, 0],
      inverseRotationDegrees,
    );
  const cameraVector = readLocalVector(worldFrame.cameraVector);
  const up = readLocalVector(worldFrame.up);
  const right = normalizeVector(readLocalVector(worldFrame.right));

  return { cameraVector, right, up };
}

function toGpuVector([x, y, z]: Vector3): d.v3f {
  return d.vec3f(x, y, z);
}

function readHoverProbe(
  canvas: HTMLCanvasElement,
  clientPoint: ClientPoint,
  frustumHalfSpan: number,
  frame: CameraFrame,
): HoverProbeProjection | null {
  const bounds = canvas.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) {
    return null;
  }

  const screenX = ((clientPoint.x - bounds.left) / bounds.width) * 2 - 1;
  const screenY = 1 - ((clientPoint.y - bounds.top) / bounds.height) * 2;
  const horizontalOffset = screenX * (bounds.width / bounds.height) * frustumHalfSpan;
  const verticalOffset = screenY * frustumHalfSpan;
  const origin = {
    x:
      frame.cameraVector[0] * CAMERA_DISTANCE +
      frame.right[0] * horizontalOffset +
      frame.up[0] * verticalOffset,
    y:
      frame.cameraVector[1] * CAMERA_DISTANCE +
      frame.right[1] * horizontalOffset +
      frame.up[1] * verticalOffset,
    z:
      frame.cameraVector[2] * CAMERA_DISTANCE +
      frame.right[2] * horizontalOffset +
      frame.up[2] * verticalOffset,
  };
  const direction = {
    x: -frame.cameraVector[0],
    y: -frame.cameraVector[1],
    z: -frame.cameraVector[2],
  };
  const projection = projectMengerHoverLineToVisibleFacePlanes(origin, direction, 2);
  if (!projection) {
    return null;
  }

  const probe = {
    x: projection.point.x / 2 + 0.5,
    y: projection.point.y / 2 + 0.5,
    z: projection.point.z / 2 + 0.5,
  };
  if (!Number.isFinite(probe.x) || !Number.isFinite(probe.y) || !Number.isFinite(probe.z)) {
    return null;
  }

  return { probe, projection };
}

export function MengerTypeGpuScene({
  antialiasing,
  automaticProbe,
  backgroundColor,
  cameraFrustumPadding,
  depth,
  elevationDegrees,
  faceColors,
  onInteractionEnd,
  onPerformanceReport,
  onRenderReady,
  onRenderUnavailable,
  onViewChange,
  pointerTiltEnabled,
  pointerTiltRadiusScale,
  pointerTiltStrengthScale,
  performanceMeasurementEnabled,
  resolutionScale,
  revealRadius,
  rotationDegrees,
  viewSnapEnabled,
}: {
  antialiasing: MengerTypeGpuAntialiasing;
  automaticProbe: MengerAutomaticProbeMotionSettings;
  backgroundColor: HexColorToken;
  cameraFrustumPadding: number;
  depth: number;
  elevationDegrees: number;
  faceColors: FaceColors;
  onInteractionEnd: (finalView: LogoViewState) => void;
  onPerformanceReport?: (report: MengerTypeGpuPerformanceReport) => void;
  onRenderReady?: () => void;
  onRenderUnavailable: () => void;
  onViewChange: (nextView: LogoViewState) => void;
  pointerTiltEnabled: boolean;
  pointerTiltRadiusScale: number;
  pointerTiltStrengthScale: number;
  performanceMeasurementEnabled: boolean;
  resolutionScale: number;
  revealRadius: number;
  rotationDegrees: number;
  viewSnapEnabled: boolean;
}) {
  const hasPrimaryFineHoverPointer = usePrimaryFineHoverPointer();
  const antialiasingRef = useRef(antialiasing);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const automaticProbeRef = useRef(automaticProbe);
  const automaticProbeCycleStartedAtMsRef = useRef(0);
  const automaticProbeResumeAtMsRef = useRef(0);
  const automaticProbeResumeTimeoutRef = useRef(0);
  const depthRef = useRef(depth);
  const frustumHalfSpanRef = useRef(CAMERA_FIT_RADIUS * cameraFrustumPadding);
  const onRenderReadyRef = useRef(onRenderReady);
  const onRenderUnavailableRef = useRef(onRenderUnavailable);
  const onPerformanceReportRef = useRef(onPerformanceReport);
  const pointerTiltEnabledRef = useRef(pointerTiltEnabled);
  const pointerTiltRadiusScaleRef = useRef(pointerTiltRadiusScale);
  const pointerTiltStrengthScaleRef = useRef(pointerTiltStrengthScale);
  const primaryFineHoverPointerRef = useRef(hasPrimaryFineHoverPointer);
  const renderSceneRef = useRef<() => void>(() => {});
  const resolutionScaleRef = useRef(resolutionScale);
  const revealRadiusRef = useRef(revealRadius);
  const viewRef = useRef<LogoViewState>({ elevationDegrees, rotationDegrees });
  const colorsRef = useRef<SceneColors>({
    background: backgroundColor,
    left: getTailwindColorHex(faceColors.left),
    right: getTailwindColorHex(faceColors.right),
    top: getTailwindColorHex(faceColors.top),
  });
  const resizeRef = useRef<() => void>(() => {});
  const writeColorsRef = useRef<(colors: SceneColors) => void>(() => {});
  const writeAntialiasingRef = useRef<(nextAntialiasing: MengerTypeGpuAntialiasing) => void>(
    () => {},
  );
  const writeDepthRef = useRef<(nextDepth: number) => void>(() => {});
  const writeViewRef = useRef<(view: LogoViewState) => void>(() => {});
  const [status, setStatus] = useState<SceneStatus>("initializing");
  const leftFaceColor = getTailwindColorHex(faceColors.left);
  const rightFaceColor = getTailwindColorHex(faceColors.right);
  const topFaceColor = getTailwindColorHex(faceColors.top);
  const staticMengerSvgSrc = useMemo(
    () =>
      createStaticLogoSvgDataUrl({
        cameraFrustumPadding,
        depth: 1,
        faceColors,
        filledVoxels: STATIC_MENGER_VOXEL_GRID.filledVoxels,
        gridSize: STATIC_MENGER_VOXEL_GRID.gridSize,
        view: { elevationDegrees, rotationDegrees },
      }),
    [cameraFrustumPadding, elevationDegrees, faceColors, rotationDegrees],
  );
  const {
    handleContextMenu,
    handlePointerCancel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    interactionRef,
  } = useLogoViewDrag<HTMLCanvasElement>({
    elevationDegrees,
    onInteractionEnd,
    onViewChange,
    rotationDegrees,
    viewDragConfig: viewSnapEnabled ? PUBLIC_LANDING_LOGO_VIEW_DRAG_CONFIG : undefined,
  });

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) {
      return;
    }

    const lifetime = new AbortController();
    let cancelRender = () => {};
    let destroyRoot = () => {};
    let disconnectResizeObserver = () => {};
    let disconnectSceneVisibilityObserver = () => {};
    let removeHoverListeners = () => {};
    const deactivateRenderer = () => {
      cancelRender();
      disconnectResizeObserver();
      disconnectSceneVisibilityObserver();
      removeHoverListeners();
      if (automaticProbeResumeTimeoutRef.current !== 0) {
        window.clearTimeout(automaticProbeResumeTimeoutRef.current);
        automaticProbeResumeTimeoutRef.current = 0;
      }
      delete container.dataset["automaticProbeClientX"];
      delete container.dataset["automaticProbeClientY"];
      delete container.dataset["automaticProbeProgress"];
      delete container.dataset["automaticProbeState"];
      delete container.dataset["hoverCoordinateX"];
      delete container.dataset["hoverCoordinateY"];
      delete container.dataset["hoverCoordinateZ"];
      delete container.dataset["hoverFaceAxis"];
      delete container.dataset["hoverFaceSign"];
      delete container.dataset["hoverMaximumOpenness"];
      delete container.dataset["hoverSettled"];
      delete container.dataset["hoverVisibleFaceCount"];
      delete container.dataset["gpuPassMilliseconds"];
      delete container.dataset["gpuTiming"];
      delete container.dataset["presentationAppliedAngleDegrees"];
      delete container.dataset["presentationHorizontalDegrees"];
      delete container.dataset["presentationTiltBaseRadius"];
      delete container.dataset["presentationTiltCenterX"];
      delete container.dataset["presentationTiltCenterY"];
      delete container.dataset["presentationTiltNeutralRadius"];
      delete container.dataset["presentationTiltSettled"];
      delete container.dataset["presentationVerticalDegrees"];
      renderSceneRef.current = () => {};
      resizeRef.current = () => {};
      writeColorsRef.current = () => {};
      writeAntialiasingRef.current = () => {};
      writeDepthRef.current = () => {};
      writeViewRef.current = () => {};
    };

    const initialize = async () => {
      try {
        const root = await tgpu.init(
          performanceMeasurementEnabled
            ? { device: { optionalFeatures: ["timestamp-query"] } }
            : undefined,
        );
        if (lifetime.signal.aborted) {
          root.destroy();
          return;
        }
        let isRootDestroyed = false;
        destroyRoot = () => {
          if (!isRootDestroyed) {
            isRootDestroyed = true;
            root.destroy();
          }
        };

        const context = root.configureContext({ canvas, alphaMode: "opaque" });
        const background = root.createUniform(d.vec3f, readGpuColor(colorsRef.current.background));
        const cameraRight = root.createUniform(d.vec3f);
        const cameraUp = root.createUniform(d.vec3f);
        const cameraVector = root.createUniform(d.vec3f);
        const leftColor = root.createUniform(d.vec3f, readGpuColor(colorsRef.current.left));
        const rightColor = root.createUniform(d.vec3f, readGpuColor(colorsRef.current.right));
        const topColor = root.createUniform(d.vec3f, readGpuColor(colorsRef.current.top));
        const hoverState = root.createUniform(MENGER_TYPE_GPU_HOVER_STATE, {
          openness: 0,
          probe: d.vec3f(0.5),
          revealRadius: MENGER_HOVER_DEFAULT_REVEAL_RADIUS,
        });
        const sceneState = root.createUniform(MENGER_TYPE_GPU_SCENE_STATE, {
          antialiasingGridSize:
            MENGER_TYPE_GPU_ANTIALIASING_SETTINGS[antialiasingRef.current].gridSize,
          aspectRatio: 1,
          frustumHalfSpan: frustumHalfSpanRef.current,
          pixelSize: 0,
          selectedDepth: depthRef.current,
          surfaceThreshold: 0.001,
        });

        const rectangleDistance = (point: d.v2f, halfSize: d.v2f): number => {
          "use gpu";
          const delta = std.sub(std.abs(point), halfSize);
          return std.add(
            std.length(std.max(delta, d.vec2f(0))),
            std.min(std.max(delta.x, delta.y), 0),
          );
        };
        const boxDistance = (point: d.v3f): number => {
          "use gpu";
          const delta = std.sub(std.abs(point), d.vec3f(1));
          return std.add(
            std.length(std.max(delta, d.vec3f(0))),
            std.min(std.max(delta.x, delta.y, delta.z), 0),
          );
        };
        const crossDistance = (point: d.v3f): number => {
          "use gpu";
          return std.min(
            rectangleDistance(d.vec2f(point.x, point.y), d.vec2f(1)),
            rectangleDistance(d.vec2f(point.x, point.z), d.vec2f(1)),
            rectangleDistance(d.vec2f(point.y, point.z), d.vec2f(1)),
          );
        };
        const openingDistance = (
          localPoint: d.v2f,
          parentRetained: boolean,
          channelCenter: d.v2f,
          probePoint: d.v2f,
          probeAxisDistance: number,
          scale: number,
        ): number => {
          "use gpu";
          if (!parentRetained) {
            return 1_000;
          }

          const channelDelta = std.sub(channelCenter, probePoint);
          const distanceFromProbe = std.length(
            d.vec3f(probeAxisDistance, channelDelta.x, channelDelta.y),
          );
          const closeness = std.sub(1, std.div(distanceFromProbe, hoverState.$.revealRadius));
          if (closeness <= 0) {
            return 1_000;
          }

          const normalized = std.min(
            std.div(closeness, 1 - MENGER_HOVER_FULL_OPEN_RADIUS_FRACTION),
            1,
          );
          const targetOpenness = std.mul(
            std.mul(normalized, normalized),
            std.sub(3, std.mul(2, normalized)),
          );
          const openness = std.mul(targetOpenness, hoverState.$.openness);
          if (openness <= 0) {
            return 1_000;
          }

          const holeSize = std.div(1, std.mul(3, scale));
          const absoluteDelta = std.abs(channelDelta);
          const totalDelta = std.add(absoluteDelta.x, absoluteDelta.y);
          let weightA = d.f32(0.5);
          if (totalDelta > 0) {
            const directionalBlend = std.min(std.div(totalDelta, std.mul(holeSize, 0.5)), 1);
            const directionalWeightA = std.div(absoluteDelta.x, totalDelta);
            weightA = std.add(0.5, std.mul(std.sub(directionalWeightA, 0.5), directionalBlend));
          }
          const anchor = std.clamp(
            std.sub(d.vec2f(0.5), std.div(channelDelta, holeSize)),
            d.vec2f(0),
            d.vec2f(1),
          );
          const width = d.vec2f(std.pow(openness, weightA), std.pow(openness, std.sub(1, weightA)));
          const apertureCenter = std.div(
            std.mul(std.sub(std.mul(anchor, 2), d.vec2f(1)), std.sub(d.vec2f(1), width)),
            3,
          );
          const apertureHalfSize = std.div(width, 3);
          // A Menger channel stays continuous along its axis. An axial bound creates face-on caps.
          return std.div(
            rectangleDistance(std.sub(localPoint, apertureCenter), apertureHalfSize),
            scale,
          );
        };
        const mengerSample = (point: d.v3f): d.v2f => {
          "use gpu";
          const outerDistance = boxDistance(point);
          let removedDistance = d.f32(1_000);
          let pointRemoved = d.bool(false);
          // A descendant channel crosses perpendicular covers, but not a same-axis parent cover.
          let xParentRetained = d.bool(true);
          let yParentRetained = d.bool(true);
          let zParentRetained = d.bool(true);
          let scale = d.f32(1);

          for (let iteration = 0; iteration < MENGER_TYPE_GPU_MAXIMUM_DEPTH; iteration += 1) {
            if (iteration >= sceneState.$.selectedDepth) {
              break;
            }
            if (
              iteration > 0 &&
              (hoverState.$.openness <= 0 ||
                (!xParentRetained && !yParentRetained && !zParentRetained))
            ) {
              break;
            }
            if (iteration > 0 && std.div(1, std.mul(3, scale)) <= sceneState.$.surfaceThreshold) {
              break;
            }
            const shiftedPoint = std.add(std.mul(point, scale), d.vec3f(1));
            const repeatedPoint = std.sub(
              std.mul(std.fract(std.mul(shiftedPoint, 0.5)), 2),
              d.vec3f(1),
            );
            const fullCrossDistance = std.div(
              crossDistance(std.mul(repeatedPoint, 3)),
              std.mul(3, scale),
            );
            let removedCrossDistance = fullCrossDistance;
            if (iteration === 0) {
              pointRemoved = fullCrossDistance <= 0;
            } else {
              const unitPoint = std.clamp(
                std.add(std.mul(point, 0.5), d.vec3f(0.5)),
                d.vec3f(0),
                d.vec3f(0.999_999),
              );
              const channelCenter = std.div(
                std.add(std.floor(std.mul(unitPoint, scale)), d.vec3f(0.5)),
                d.vec3f(scale),
              );
              const probe = hoverState.$.probe;
              const openingAlongX = openingDistance(
                d.vec2f(repeatedPoint.y, repeatedPoint.z),
                xParentRetained,
                d.vec2f(channelCenter.y, channelCenter.z),
                d.vec2f(probe.y, probe.z),
                std.min(probe.x, std.sub(1, probe.x)),
                scale,
              );
              const openingAlongY = openingDistance(
                d.vec2f(repeatedPoint.x, repeatedPoint.z),
                yParentRetained,
                d.vec2f(channelCenter.x, channelCenter.z),
                d.vec2f(probe.x, probe.z),
                std.min(probe.y, std.sub(1, probe.y)),
                scale,
              );
              const openingAlongZ = openingDistance(
                d.vec2f(repeatedPoint.x, repeatedPoint.y),
                zParentRetained,
                d.vec2f(channelCenter.x, channelCenter.y),
                d.vec2f(probe.x, probe.y),
                std.min(probe.z, std.sub(1, probe.z)),
                scale,
              );
              removedCrossDistance = std.min(openingAlongX, openingAlongY, openingAlongZ);
              if (removedCrossDistance <= 0) {
                pointRemoved = true;
              }
            }
            removedDistance = std.min(removedDistance, removedCrossDistance);
            const repeatedAbsolute = std.abs(repeatedPoint);
            const xInMiddleThird = repeatedAbsolute.x <= 1 / 3;
            const yInMiddleThird = repeatedAbsolute.y <= 1 / 3;
            const zInMiddleThird = repeatedAbsolute.z <= 1 / 3;
            xParentRetained = xParentRetained && !(yInMiddleThird && zInMiddleThird);
            yParentRetained = yParentRetained && !(xInMiddleThird && zInMiddleThird);
            zParentRetained = zParentRetained && !(xInMiddleThird && yInMiddleThird);
            scale = std.mul(scale, 3);
          }

          let material = d.f32(0);
          if (outerDistance <= 0 && !pointRemoved) {
            material = 1;
          }
          return d.vec2f(std.max(outerDistance, std.neg(removedDistance)), material);
        };
        const mengerDistance = (point: d.v3f): number => {
          "use gpu";
          return mengerSample(point).x;
        };
        const surfaceNormal = (point: d.v3f): d.v3f => {
          "use gpu";
          const epsilon = std.mul(sceneState.$.surfaceThreshold, 1.5);
          const centerDistance = mengerDistance(point);
          return std.normalize(
            d.vec3f(
              std.sub(mengerDistance(std.add(point, d.vec3f(epsilon, 0, 0))), centerDistance),
              std.sub(mengerDistance(std.add(point, d.vec3f(0, epsilon, 0))), centerDistance),
              std.sub(mengerDistance(std.add(point, d.vec3f(0, 0, epsilon))), centerDistance),
            ),
          );
        };
        const axisColor = (axis: d.v3f): d.v3f => {
          "use gpu";
          if (axis.x >= axis.y && axis.x >= axis.z) {
            return d.vec3f(rightColor.$);
          }
          if (axis.y >= axis.z) {
            return d.vec3f(topColor.$);
          }
          return d.vec3f(leftColor.$);
        };
        const traceMenger = (screenPoint: d.v2f): d.v4f => {
          "use gpu";
          const rayOrigin = std.add(
            std.mul(cameraVector.$, CAMERA_DISTANCE),
            std.add(
              std.mul(cameraRight.$, std.mul(screenPoint.x, sceneState.$.frustumHalfSpan)),
              std.mul(cameraUp.$, std.mul(screenPoint.y, sceneState.$.frustumHalfSpan)),
            ),
          );
          const rayDirection = std.neg(cameraVector.$);
          const inverseRayDirection = std.div(d.vec3f(1), rayDirection);
          const boxEntryByAxis = std.mul(std.sub(d.vec3f(-1), rayOrigin), inverseRayDirection);
          const boxExitByAxis = std.mul(std.sub(d.vec3f(1), rayOrigin), inverseRayDirection);
          const boxNear = std.min(boxEntryByAxis, boxExitByAxis);
          const boxFar = std.max(boxEntryByAxis, boxExitByAxis);
          let distanceAlongRay = std.max(boxNear.x, boxNear.y, boxNear.z, 0);
          const boxExitDistance = std.min(boxFar.x, boxFar.y, boxFar.z);

          if (distanceAlongRay > boxExitDistance) {
            return d.vec4f(background.$, 1);
          }

          for (let step = 0; step < MAXIMUM_RAY_STEPS; step += 1) {
            const point = std.add(rayOrigin, std.mul(rayDirection, distanceAlongRay));
            const sample = mengerSample(point);
            if (sample.x < sceneState.$.surfaceThreshold && sample.y > 0.5) {
              return d.vec4f(axisColor(std.abs(surfaceNormal(point))), 1);
            }
            distanceAlongRay = std.add(
              distanceAlongRay,
              std.max(sample.x, std.mul(sceneState.$.surfaceThreshold, 0.5)),
            );
            if (distanceAlongRay > boxExitDistance) {
              break;
            }
          }

          return d.vec4f(background.$, 1);
        };
        const fragment = tgpu.fragmentFn({
          in: { uv: d.vec2f },
          out: d.vec4f,
        })(({ uv }) => {
          "use gpu";
          const screenPoint = d.vec2f(
            std.mul(std.sub(uv.x, 0.5), std.mul(2, sceneState.$.aspectRatio)),
            std.mul(std.sub(uv.y, 0.5), -2),
          );
          if (sceneState.$.antialiasingGridSize === 1) {
            return traceMenger(screenPoint);
          }

          const gridSize = sceneState.$.antialiasingGridSize;
          let color = d.vec4f(0);
          for (let sampleY = 0; sampleY < MAXIMUM_ANTIALIASING_GRID_SIZE; sampleY += 1) {
            if (sampleY >= gridSize) {
              break;
            }
            for (let sampleX = 0; sampleX < MAXIMUM_ANTIALIASING_GRID_SIZE; sampleX += 1) {
              if (sampleX >= gridSize) {
                break;
              }
              const samplePosition = std.div(
                d.vec2f(std.add(d.f32(sampleX), 0.5), std.add(d.f32(sampleY), 0.5)),
                d.f32(gridSize),
              );
              const sampleOffset = std.mul(
                std.sub(samplePosition, d.vec2f(0.5)),
                sceneState.$.pixelSize,
              );
              color = std.add(color, traceMenger(std.add(screenPoint, sampleOffset)));
            }
          }
          return std.mul(color, std.div(1, d.f32(std.mul(gridSize, gridSize))));
        });
        const pipeline = root.createRenderPipeline({
          vertex: common.fullScreenTriangle,
          fragment,
        });
        const gpuTimingSupported = root.enabledFeatures.has("timestamp-query");
        const timedPipeline =
          performanceMeasurementEnabled && gpuTimingSupported
            ? pipeline.withPerformanceCallback((start, end) => {
                if (lifetime.signal.aborted || end <= start) {
                  return;
                }
                const gpuPassMilliseconds = Number(end - start) / 1_000_000;
                if (!Number.isFinite(gpuPassMilliseconds)) {
                  return;
                }

                container.dataset["gpuTiming"] = "measured";
                container.dataset["gpuPassMilliseconds"] = gpuPassMilliseconds.toFixed(3);
                onPerformanceReportRef.current?.({
                  kind: "sample",
                  gpuPassMilliseconds,
                  renderHeight: canvas.height,
                  renderWidth: canvas.width,
                });
              })
            : pipeline;
        if (performanceMeasurementEnabled) {
          container.dataset["gpuTiming"] = gpuTimingSupported ? "sampling" : "unsupported";
          if (!gpuTimingSupported) {
            onPerformanceReportRef.current?.({ kind: "unsupported" });
          }
        }
        await timedPipeline.initAsync();
        // eslint-disable-next-line typescript/no-unnecessary-condition -- Cleanup can abort while pipeline initialization awaits.
        if (lifetime.signal.aborted) {
          return;
        }

        const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
        let automaticProbeClientPoint: ClientPoint | null = null;
        let clientPointer: ClientPoint | null = null;
        let lastHoverFrameTime: number | null = null;
        let lastPresentationTiltFrameTime: number | null = null;
        let lastProbe: MengerHoverProbe = { x: 0.5, y: 0.5, z: 0.5 };
        let presentationTiltClientPoint: ClientPoint | null = null;
        let presentationTiltQuaternion = IDENTITY_QUATERNION;
        let presentationTiltSuspended = false;
        let presentationTiltTarget = NEUTRAL_LOGO_PRESENTATION_TILT_TARGET;
        let renderedOpenness = 0;
        let renderedFrameCount = 0;
        let renderFrame = 0;
        let sceneIsVisible = true;
        let firstRenderPending = true;
        const clearAutomaticProbeClientPoint = (
          state: "invalid" | "off" | "resting" | "suspended",
        ) => {
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
              requestRender();
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

          const bounds = canvas.getBoundingClientRect();
          if (bounds.width <= 0 || bounds.height <= 0) {
            clearAutomaticProbeClientPoint("suspended");
            return false;
          }

          let automaticProbeNeedsFrame = true;
          let progress: number;
          if (reducedMotionQuery.matches) {
            progress = 0;
            automaticProbeNeedsFrame = false;
            container.dataset["automaticProbeState"] = "reduced-motion";
          } else if (timestampMs < automaticProbeResumeAtMsRef.current) {
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
          if (
            !Number.isFinite(progress) ||
            !Number.isFinite(point.x) ||
            !Number.isFinite(point.y) ||
            !Number.isFinite(clientX) ||
            !Number.isFinite(clientY) ||
            !hasFiniteSquaredLength(clientX - bounds.left, clientY - bounds.top)
          ) {
            invalidateAutomaticProbe();
            return false;
          }
          automaticProbeClientPoint = { x: clientX, y: clientY };
          container.dataset["automaticProbeClientX"] = clientX.toFixed(3);
          container.dataset["automaticProbeClientY"] = clientY.toFixed(3);
          container.dataset["automaticProbeProgress"] = progress.toFixed(4);

          return (
            automaticProbeNeedsFrame && (depthRef.current > 1 || pointerTiltEnabledRef.current)
          );
        };
        const clearProbe = () => {
          delete container.dataset["hoverCoordinateX"];
          delete container.dataset["hoverCoordinateY"];
          delete container.dataset["hoverCoordinateZ"];
          delete container.dataset["hoverFaceAxis"];
          delete container.dataset["hoverFaceSign"];
          delete container.dataset["hoverVisibleFaceCount"];
        };
        const updatePresentationTiltTarget = (baseFrame: CameraFrame) => {
          const bounds = canvas.getBoundingClientRect();
          if (bounds.width <= 0 || bounds.height <= 0) {
            presentationTiltTarget = NEUTRAL_LOGO_PRESENTATION_TILT_TARGET;
            return;
          }

          const centerX = bounds.left + bounds.width / 2;
          const centerY = bounds.top + bounds.height / 2;
          const pixelsPerWorldUnit = bounds.height / (frustumHalfSpanRef.current * 2);
          let baseRadius = 0;
          for (const xSign of MENGER_CUBE_CORNER_SIGNS) {
            for (const ySign of MENGER_CUBE_CORNER_SIGNS) {
              for (const zSign of MENGER_CUBE_CORNER_SIGNS) {
                const corner: Vector3 = [xSign, ySign, zSign];
                baseRadius = Math.max(
                  baseRadius,
                  Math.hypot(
                    dotProduct(corner, baseFrame.right) * pixelsPerWorldUnit,
                    dotProduct(corner, baseFrame.up) * pixelsPerWorldUnit,
                  ),
                );
              }
            }
          }

          const radiusScale = normalizeLogoPresentationTiltRadiusScale(
            pointerTiltRadiusScaleRef.current,
          );
          container.dataset["presentationTiltCenterX"] = centerX.toFixed(3);
          container.dataset["presentationTiltCenterY"] = centerY.toFixed(3);
          container.dataset["presentationTiltBaseRadius"] = baseRadius.toFixed(3);
          container.dataset["presentationTiltNeutralRadius"] = (baseRadius * radiusScale).toFixed(
            3,
          );
          const tiltClientPoint = automaticProbeClientPoint ?? presentationTiltClientPoint;
          const tiltClientPointEnabled =
            automaticProbeClientPoint !== null ||
            (presentationTiltClientPoint !== null && primaryFineHoverPointerRef.current);
          const nextTarget =
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
            !hasFiniteSquaredLength(nextTarget.horizontal, nextTarget.vertical)
          ) {
            invalidateAutomaticProbe();
            return;
          }
          presentationTiltTarget = nextTarget;
        };
        const applyPresentationTilt = (timestampMs: number): boolean => {
          const target =
            pointerTiltEnabledRef.current && !reducedMotionQuery.matches
              ? presentationTiltTarget
              : NEUTRAL_LOGO_PRESENTATION_TILT_TARGET;
          container.dataset["presentationHorizontalDegrees"] = target.horizontal.toFixed(3);
          container.dataset["presentationVerticalDegrees"] = target.vertical.toFixed(3);

          if (reducedMotionQuery.matches) {
            presentationTiltQuaternion = IDENTITY_QUATERNION;
            lastPresentationTiltFrameTime = timestampMs;
            return true;
          }

          let targetQuaternion: Quaternion;
          if (presentationTiltSuspended || interactionRef.current.status !== "idle") {
            targetQuaternion = presentationTiltQuaternion;
          } else {
            const magnitude = Math.hypot(target.horizontal, target.vertical);
            if (magnitude === 0) {
              targetQuaternion = IDENTITY_QUATERNION;
            } else {
              const worldFrame = readWorldCameraFrame(viewRef.current.elevationDegrees);
              const axis = normalizeVector(
                addVectors(
                  scaleVector(worldFrame.right, -target.vertical),
                  scaleVector(worldFrame.up, target.horizontal),
                ),
              );
              targetQuaternion = createAxisAngleQuaternion(axis, magnitude);
            }
          }

          const remainingDegrees = readQuaternionAngleDegrees(
            presentationTiltQuaternion,
            targetQuaternion,
          );
          if (remainingDegrees <= LOGO_PRESENTATION_TILT_SETTLED_DEGREES) {
            presentationTiltQuaternion = targetQuaternion;
            lastPresentationTiltFrameTime = timestampMs;
            return true;
          }

          const previousFrameTime = lastPresentationTiltFrameTime;
          lastPresentationTiltFrameTime = timestampMs;
          if (previousFrameTime === null) {
            return false;
          }

          presentationTiltQuaternion = slerpQuaternion(
            presentationTiltQuaternion,
            targetQuaternion,
            getLogoPresentationTiltTransitionAlpha({
              deltaSeconds: (timestampMs - previousFrameTime) / 1_000,
              remainingDegrees,
            }),
          );
          return false;
        };
        const writeCameraFrame = (frame: CameraFrame) => {
          cameraRight.write(toGpuVector(frame.right));
          cameraUp.write(toGpuVector(frame.up));
          cameraVector.write(toGpuVector(frame.cameraVector));
        };
        const readAndWriteProbe = (frame: CameraFrame): MengerHoverProbe | null => {
          const activeClientPointer = automaticProbeClientPoint ?? clientPointer;
          const result =
            activeClientPointer === null
              ? null
              : readHoverProbe(canvas, activeClientPointer, frustumHalfSpanRef.current, frame);
          if (!result) {
            clearProbe();
            return null;
          }

          lastProbe = result.probe;
          container.dataset["hoverCoordinateX"] = result.probe.x.toFixed(3);
          container.dataset["hoverCoordinateY"] = result.probe.y.toFixed(3);
          container.dataset["hoverCoordinateZ"] = result.probe.z.toFixed(3);
          container.dataset["hoverFaceAxis"] = String(result.projection.axis);
          container.dataset["hoverFaceSign"] = String(result.projection.sign);
          container.dataset["hoverVisibleFaceCount"] = String(result.projection.visibleFaceCount);
          return result.probe;
        };
        const writeHoverState = (timestampMs: number, frame: CameraFrame): boolean => {
          if (depthRef.current === 1) {
            clearProbe();
            lastHoverFrameTime = null;
            renderedOpenness = 0;
            hoverState.write({
              openness: 0,
              probe: d.vec3f(lastProbe.x, lastProbe.y, lastProbe.z),
              revealRadius: revealRadiusRef.current,
            });
            container.dataset["hoverMaximumOpenness"] = "0.000000";
            container.dataset["hoverSettled"] = "true";
            return false;
          }

          const probe = readAndWriteProbe(frame);
          const currentRevealRadius = revealRadiusRef.current;
          const targetOpenness =
            probe &&
            Math.hypot(
              Math.max(-probe.x, probe.x - 1, 0),
              Math.max(-probe.y, probe.y - 1, 0),
              Math.max(-probe.z, probe.z - 1, 0),
            ) < currentRevealRadius
              ? 1
              : 0;
          const previousFrameTime = lastHoverFrameTime;
          lastHoverFrameTime = timestampMs;
          const elapsedMs =
            previousFrameTime === null
              ? MENGER_HOVER_FRAME_ELAPSED_RESTART_MS
              : Math.min(
                  Math.max(timestampMs - previousFrameTime, 0),
                  MENGER_HOVER_FRAME_ELAPSED_MAX_MS,
                );
          const smoothing = reducedMotionQuery.matches
            ? 1
            : 1 - Math.exp(-elapsedMs / MENGER_HOVER_OPENNESS_SMOOTHING_TAU_MS);
          const nextOpenness = renderedOpenness + (targetOpenness - renderedOpenness) * smoothing;
          renderedOpenness =
            Math.abs(nextOpenness - targetOpenness) < MENGER_HOVER_OPENNESS_SETTLE_EPSILON
              ? targetOpenness
              : nextOpenness;
          const settled = renderedOpenness === targetOpenness;
          if (settled) {
            lastHoverFrameTime = null;
          }
          hoverState.write({
            openness: renderedOpenness,
            probe: d.vec3f(lastProbe.x, lastProbe.y, lastProbe.z),
            revealRadius: currentRevealRadius,
          });
          container.dataset["hoverMaximumOpenness"] = renderedOpenness.toFixed(6);
          container.dataset["hoverSettled"] = settled ? "true" : "false";

          return !settled;
        };
        const renderNow = (timestampMs = performance.now()) => {
          if (document.visibilityState !== "visible" || !sceneIsVisible) {
            return;
          }
          const automaticProbeNeedsFrame = updateAutomaticProbeClientPoint(timestampMs);
          const baseFrame = readCameraFrame(viewRef.current, IDENTITY_QUATERNION);
          updatePresentationTiltTarget(baseFrame);
          const presentationTiltSettled =
            container.dataset["automaticProbeState"] === "invalid" ||
            applyPresentationTilt(timestampMs);
          const frame = readCameraFrame(viewRef.current, presentationTiltQuaternion);
          writeCameraFrame(frame);
          let hoverNeedsFrame = false;
          if (depthRef.current === 1) {
            hoverNeedsFrame = writeHoverState(timestampMs, frame);
          } else if (container.dataset["automaticProbeState"] === "invalid") {
            lastHoverFrameTime = null;
            readAndWriteProbe(frame);
          } else {
            hoverNeedsFrame = writeHoverState(timestampMs, frame);
          }
          const framePipeline =
            performanceMeasurementEnabled &&
            gpuTimingSupported &&
            renderedFrameCount % GPU_TIMING_FRAME_INTERVAL === 0
              ? timedPipeline
              : pipeline;
          framePipeline
            .withColorAttachment({ view: context.getCurrentTexture().createView() })
            .draw(3);
          renderedFrameCount += 1;
          container.dataset["presentationTiltSettled"] = presentationTiltSettled ? "true" : "false";
          container.dataset["presentationAppliedAngleDegrees"] = readQuaternionAngleDegrees(
            presentationTiltQuaternion,
            IDENTITY_QUATERNION,
          ).toFixed(3);
          if (firstRenderPending) {
            firstRenderPending = false;
            setStatus("ready");
            onRenderReadyRef.current?.();
          }
          if (presentationTiltSettled) {
            lastPresentationTiltFrameTime = null;
          }
          if (
            automaticProbeNeedsFrame ||
            hoverNeedsFrame ||
            !presentationTiltSettled ||
            (performanceMeasurementEnabled && gpuTimingSupported)
          ) {
            requestRender();
          }
        };
        const requestRender = () => {
          if (
            renderFrame !== 0 ||
            lifetime.signal.aborted ||
            document.visibilityState !== "visible" ||
            !sceneIsVisible
          ) {
            return;
          }
          renderFrame = window.requestAnimationFrame((timestampMs) => {
            renderFrame = 0;
            if (!lifetime.signal.aborted) {
              renderNow(timestampMs);
            }
          });
        };
        cancelRender = () => {
          window.cancelAnimationFrame(renderFrame);
          renderFrame = 0;
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

          presentationTiltSuspended =
            event.target instanceof Element &&
            event.target.closest(`[${LOGO_PRESENTATION_TILT_SUSPEND_ATTRIBUTE}]`) !== null;
          if (presentationTiltSuspended) {
            requestRender();
            return;
          }
          if (event.pointerType === "mouse") {
            presentationTiltClientPoint = { x: event.clientX, y: event.clientY };
          }
          if (event.buttons !== 0) {
            if (interactionRef.current.status === "idle") {
              requestRender();
            }
            return;
          }

          clientPointer = { x: event.clientX, y: event.clientY };
          requestRender();
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

          clientPointer = { x: event.clientX, y: event.clientY };
          if (event.pointerType === "mouse") {
            presentationTiltClientPoint = clientPointer;
          }
          requestRender();
        };
        const onWindowBlur = () => {
          clientPointer = null;
          presentationTiltClientPoint = null;
          presentationTiltSuspended = false;
          renderNow();
        };
        const onReducedMotionChange = () => {
          requestRender();
        };
        const onPagePointerLeave = () => {
          clientPointer = null;
          presentationTiltClientPoint = null;
          presentationTiltSuspended = false;
          requestRender();
        };
        const suspendAutomaticProbeFrames = () => {
          cancelRender();
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
            requestRender();
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
            requestRender();
            return;
          }

          suspendAutomaticProbeFrames();
          clearAutomaticProbeClientPoint("suspended");
        });
        window.addEventListener("blur", onWindowBlur);
        window.addEventListener("pointermove", onWindowPointerMove);
        window.addEventListener("pointerup", onWindowPointerUp);
        reducedMotionQuery.addEventListener("change", onReducedMotionChange);
        document.addEventListener("visibilitychange", onDocumentVisibilityChange);
        document.documentElement.addEventListener("pointerleave", onPagePointerLeave);
        sceneVisibilityObserver.observe(container);
        disconnectSceneVisibilityObserver = () => {
          sceneVisibilityObserver.disconnect();
        };
        removeHoverListeners = () => {
          window.removeEventListener("blur", onWindowBlur);
          window.removeEventListener("pointermove", onWindowPointerMove);
          window.removeEventListener("pointerup", onWindowPointerUp);
          reducedMotionQuery.removeEventListener("change", onReducedMotionChange);
          document.removeEventListener("visibilitychange", onDocumentVisibilityChange);
          document.documentElement.removeEventListener("pointerleave", onPagePointerLeave);
          removeHoverListeners = () => {};
        };
        renderSceneRef.current = requestRender;
        const writeView = () => {
          requestRender();
        };
        const writeColors = (colors: SceneColors) => {
          background.write(readGpuColor(colors.background));
          leftColor.write(readGpuColor(colors.left));
          rightColor.write(readGpuColor(colors.right));
          topColor.write(readGpuColor(colors.top));
        };
        const resize = () => {
          const width = canvas.clientWidth;
          const height = canvas.clientHeight;
          const shortestSide = Math.max(Math.min(width, height), 1);
          const edgeClearanceScale =
            shortestSide /
            Math.max(shortestSide - LOGO_SCENE_CAMERA_EDGE_CLEARANCE_CSS_PIXELS * 2, 1);
          const nextFrustumHalfSpan = CAMERA_FIT_RADIUS * cameraFrustumPadding * edgeClearanceScale;
          const devicePixelRatio = Math.min(
            window.devicePixelRatio || 1,
            MAXIMUM_DEVICE_PIXEL_RATIO,
          );
          const nextWidth = Math.max(
            1,
            Math.floor(width * devicePixelRatio * resolutionScaleRef.current),
          );
          const nextHeight = Math.max(
            1,
            Math.floor(height * devicePixelRatio * resolutionScaleRef.current),
          );
          frustumHalfSpanRef.current = nextFrustumHalfSpan;
          sceneState.patch({
            aspectRatio: nextWidth / nextHeight,
            frustumHalfSpan: nextFrustumHalfSpan,
            pixelSize: 2 / nextHeight,
            surfaceThreshold: Math.max((nextFrustumHalfSpan * 2 * 0.12) / nextHeight, 0.0002),
          });
          if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
            canvas.width = nextWidth;
            canvas.height = nextHeight;
            canvas.dataset["renderWidth"] = String(nextWidth);
            canvas.dataset["renderHeight"] = String(nextHeight);
          }
          requestRender();
        };
        const resizeObserver = new ResizeObserver(resize);
        disconnectResizeObserver = () => {
          resizeObserver.disconnect();
        };
        resizeRef.current = resize;
        writeColorsRef.current = (colors) => {
          writeColors(colors);
          requestRender();
        };
        writeAntialiasingRef.current = (nextAntialiasing) => {
          sceneState.patch({
            antialiasingGridSize: MENGER_TYPE_GPU_ANTIALIASING_SETTINGS[nextAntialiasing].gridSize,
          });
          requestRender();
        };
        writeDepthRef.current = (nextDepth) => {
          sceneState.patch({ selectedDepth: nextDepth });
          requestRender();
        };
        writeViewRef.current = writeView;

        resizeObserver.observe(canvas);
        sceneState.patch({
          antialiasingGridSize:
            MENGER_TYPE_GPU_ANTIALIASING_SETTINGS[antialiasingRef.current].gridSize,
          selectedDepth: depthRef.current,
        });
        writeColors(colorsRef.current);
        writeView();
        resize();
        cancelRender();
        renderNow();

        void root.device.lost.then(() => {
          if (!lifetime.signal.aborted) {
            canvas.dataset["rendererError"] = "The WebGPU device was lost.";
            deactivateRenderer();
            destroyRoot();
            setStatus("unavailable");
            onRenderUnavailableRef.current();
          }
        });
      } catch (error: unknown) {
        deactivateRenderer();
        destroyRoot();
        if (!lifetime.signal.aborted) {
          canvas.dataset["rendererError"] =
            error instanceof Error ? error.message : "WebGPU did not start.";
          setStatus("unavailable");
          onRenderUnavailableRef.current();
        }
      }
    };

    void initialize();

    return () => {
      lifetime.abort();
      deactivateRenderer();
      delete canvas.dataset["rendererError"];
      destroyRoot();
    };
  }, [cameraFrustumPadding, interactionRef, performanceMeasurementEnabled]);

  useEffect(() => {
    antialiasingRef.current = antialiasing;
    writeAntialiasingRef.current(antialiasing);
  }, [antialiasing]);

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
    depthRef.current = depth;
    writeDepthRef.current(depth);
  }, [depth]);

  useEffect(() => {
    resolutionScaleRef.current = resolutionScale;
    resizeRef.current();
  }, [resolutionScale]);

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
    primaryFineHoverPointerRef.current = hasPrimaryFineHoverPointer;
    renderSceneRef.current();
  }, [hasPrimaryFineHoverPointer]);

  useEffect(() => {
    const nextView = { elevationDegrees, rotationDegrees };
    viewRef.current = nextView;
    writeViewRef.current(nextView);
  }, [elevationDegrees, rotationDegrees]);

  useEffect(() => {
    const colors = {
      background: backgroundColor,
      left: leftFaceColor,
      right: rightFaceColor,
      top: topFaceColor,
    };
    colorsRef.current = colors;
    writeColorsRef.current(colors);
  }, [backgroundColor, leftFaceColor, rightFaceColor, topFaceColor]);

  useEffect(() => {
    onRenderReadyRef.current = onRenderReady;
  }, [onRenderReady]);

  useEffect(() => {
    onRenderUnavailableRef.current = onRenderUnavailable;
  }, [onRenderUnavailable]);

  useEffect(() => {
    onPerformanceReportRef.current = onPerformanceReport;
  }, [onPerformanceReport]);

  return (
    <div
      ref={containerRef}
      aria-label="Menger sponge hover reveal"
      className="relative h-full min-h-0 w-full"
      data-menger-antialiasing={antialiasing}
      data-menger-automatic-probe={automaticProbe.enabled ? "play" : "off"}
      data-menger-automatic-probe-path={automaticProbe.path}
      data-menger-maximum-depth={depth}
      data-menger-pointer-tilt={pointerTiltEnabled ? "landing" : "off"}
      data-menger-pointer-tilt-radius-scale={pointerTiltRadiusScale}
      data-menger-pointer-tilt-strength-scale={pointerTiltStrengthScale}
      data-menger-performance-measurement={performanceMeasurementEnabled ? "on" : "off"}
      data-menger-research-mode="hover"
      data-logo-elevation-degrees={elevationDegrees}
      data-logo-rotation-degrees={rotationDegrees}
      data-renderer="typegpu-ray-march"
      data-renderer-state={status}
      data-testid="logo-menger-hover-scene"
      role="img"
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={
          status === "unavailable"
            ? "block h-full w-full select-none"
            : "block h-full w-full cursor-grab touch-none select-none active:cursor-grabbing"
        }
        onContextMenu={status === "unavailable" ? undefined : handleContextMenu}
        onPointerCancel={status === "unavailable" ? undefined : handlePointerCancel}
        onPointerDown={status === "unavailable" ? undefined : handlePointerDown}
        onPointerMove={status === "unavailable" ? undefined : handlePointerMove}
        onPointerUp={status === "unavailable" ? undefined : handlePointerUp}
      />
      {status === "ready" ? null : (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <img
            alt=""
            aria-hidden="true"
            className="h-full w-full object-contain"
            src={staticMengerSvgSrc}
            style={{ padding: LOGO_SCENE_CAMERA_EDGE_CLEARANCE_CSS_PIXELS }}
          />
          <span className="sr-only" role="status">
            {status === "unavailable"
              ? "WebGPU is not available. The static logo is shown."
              : "WebGPU is starting."}
          </span>
        </div>
      )}
    </div>
  );
}
