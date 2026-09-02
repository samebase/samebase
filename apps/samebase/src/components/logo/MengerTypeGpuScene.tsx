import {
  getTailwindColorHex,
  type FaceColors,
  type HexColorToken,
} from "@/components/logo/logoTailwindColors";
import { createLogoRouteVoxelGrid } from "@/components/logo/logoRouteRenderState";
import { createStaticLogoSvgDataUrl } from "@/components/logo/logoStaticSvgAsset";
import { type LogoViewState } from "@/components/logo/logoViewDrag";
import { MENGER_TYPE_GPU_MAXIMUM_DEPTH } from "@/components/logo/mengerTypeGpuSettings";
import { useLogoViewDrag } from "@/components/logo/useLogoViewDrag";
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
  crossProduct,
  getCameraLocalVector,
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
const CAMERA_FRUSTUM_HALF_SPAN = Math.sqrt(3) * 1.12;
const MAXIMUM_DEVICE_PIXEL_RATIO = 2;
const MAXIMUM_RAY_STEPS = 128;
const MENGER_TYPE_GPU_HOVER_STATE = d.struct({
  openness: d.f32,
  probe: d.vec3f,
  revealRadius: d.f32,
});
const STATIC_MENGER_VOXEL_GRID = createLogoRouteVoxelGrid({
  fractalDepth: 1,
  gridSize: LOGO_GRID_SIZE_3,
  voxelState: MENGER_SPONGE_VOXEL_STATE,
});

type SceneStatus = "initializing" | "ready" | "unavailable";
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

function readCameraFrame(view: LogoViewState): {
  cameraVector: Vector3;
  right: Vector3;
  up: Vector3;
} {
  const cameraVector = getCameraLocalVector({
    elevationDegrees: view.elevationDegrees,
    rotationAxisMode: "cube-y",
    rotationDegrees: view.rotationDegrees,
  });
  const up = rotateVectorAroundAxis(
    getWorldScreenVerticalAxis(view.elevationDegrees),
    [0, 1, 0],
    -toRenderedRotationDegrees(view.rotationDegrees),
  );
  const right = normalizeVector(crossProduct(scaleVector(cameraVector, -1), up));

  return { cameraVector, right, up };
}

function toGpuVector([x, y, z]: Vector3): d.v3f {
  return d.vec3f(x, y, z);
}

function readHoverProbe(
  canvas: HTMLCanvasElement,
  clientPoint: ClientPoint,
  view: LogoViewState,
): MengerHoverProbe | null {
  const bounds = canvas.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) {
    return null;
  }

  const frame = readCameraFrame(view);
  const screenX = ((clientPoint.x - bounds.left) / bounds.width) * 2 - 1;
  const screenY = 1 - ((clientPoint.y - bounds.top) / bounds.height) * 2;
  const horizontalOffset = screenX * (bounds.width / bounds.height) * CAMERA_FRUSTUM_HALF_SPAN;
  const verticalOffset = screenY * CAMERA_FRUSTUM_HALF_SPAN;
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

  return probe;
}

export function MengerTypeGpuScene({
  backgroundColor,
  depth,
  elevationDegrees,
  faceColors,
  onViewChange,
  resolutionScale,
  rotationDegrees,
}: {
  backgroundColor: HexColorToken;
  depth: number;
  elevationDegrees: number;
  faceColors: FaceColors;
  onViewChange: (nextView: LogoViewState) => void;
  resolutionScale: number;
  rotationDegrees: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const depthRef = useRef(depth);
  const resolutionScaleRef = useRef(resolutionScale);
  const viewRef = useRef<LogoViewState>({ elevationDegrees, rotationDegrees });
  const colorsRef = useRef<SceneColors>({
    background: backgroundColor,
    left: getTailwindColorHex(faceColors.left),
    right: getTailwindColorHex(faceColors.right),
    top: getTailwindColorHex(faceColors.top),
  });
  const resizeRef = useRef<() => void>(() => {});
  const writeColorsRef = useRef<(colors: SceneColors) => void>(() => {});
  const writeDepthRef = useRef<(nextDepth: number) => void>(() => {});
  const writeViewRef = useRef<(view: LogoViewState) => void>(() => {});
  const [status, setStatus] = useState<SceneStatus>("initializing");
  const leftFaceColor = getTailwindColorHex(faceColors.left);
  const rightFaceColor = getTailwindColorHex(faceColors.right);
  const topFaceColor = getTailwindColorHex(faceColors.top);
  const staticMengerSvgSrc = useMemo(
    () =>
      createStaticLogoSvgDataUrl({
        cameraFrustumPadding: 1,
        depth: 1,
        faceColors,
        filledVoxels: STATIC_MENGER_VOXEL_GRID.filledVoxels,
        gridSize: STATIC_MENGER_VOXEL_GRID.gridSize,
        view: { elevationDegrees, rotationDegrees },
      }),
    [elevationDegrees, faceColors, rotationDegrees],
  );
  const {
    handleContextMenu,
    handlePointerCancel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  } = useLogoViewDrag<HTMLCanvasElement>({
    elevationDegrees,
    onViewChange,
    rotationDegrees,
    viewDragConfig: PUBLIC_LANDING_LOGO_VIEW_DRAG_CONFIG,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const lifetime = new AbortController();
    let cancelRender = () => {};
    let destroyRoot = () => {};
    let disconnectResizeObserver = () => {};
    let removeHoverListeners = () => {};
    const deactivateRenderer = () => {
      cancelRender();
      disconnectResizeObserver();
      removeHoverListeners();
      delete canvas.dataset["hoverCoordinateX"];
      delete canvas.dataset["hoverCoordinateY"];
      delete canvas.dataset["hoverCoordinateZ"];
      delete canvas.dataset["hoverMaximumOpenness"];
      delete canvas.dataset["hoverSettled"];
      resizeRef.current = () => {};
      writeColorsRef.current = () => {};
      writeDepthRef.current = () => {};
      writeViewRef.current = () => {};
    };

    const initialize = async () => {
      try {
        const root = await tgpu.init();
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
        const aspectRatio = root.createUniform(d.f32, 1);
        const background = root.createUniform(d.vec3f, readGpuColor(colorsRef.current.background));
        const cameraRight = root.createUniform(d.vec3f);
        const cameraUp = root.createUniform(d.vec3f);
        const cameraVector = root.createUniform(d.vec3f);
        const leftColor = root.createUniform(d.vec3f, readGpuColor(colorsRef.current.left));
        const rightColor = root.createUniform(d.vec3f, readGpuColor(colorsRef.current.right));
        const topColor = root.createUniform(d.vec3f, readGpuColor(colorsRef.current.top));
        const selectedDepth = root.createUniform(d.i32, depthRef.current);
        const surfaceThreshold = root.createUniform(d.f32, 0.001);
        const hoverState = root.createUniform(MENGER_TYPE_GPU_HOVER_STATE, {
          openness: 0,
          probe: d.vec3f(0.5),
          revealRadius: MENGER_HOVER_DEFAULT_REVEAL_RADIUS,
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
          channelCenter: d.v2f,
          probePoint: d.v2f,
          probeAxisDistance: number,
          scale: number,
        ): number => {
          "use gpu";
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
        const mengerDistance = (point: d.v3f): number => {
          "use gpu";
          let distance = boxDistance(point);
          let scale = d.f32(1);
          // A finer opening exists only inside a cell retained by every coarser level.
          let parentCellRetained = d.bool(true);

          for (let iteration = 0; iteration < MENGER_TYPE_GPU_MAXIMUM_DEPTH; iteration += 1) {
            if (iteration >= selectedDepth.$) {
              break;
            }
            if (iteration > 0 && (hoverState.$.openness <= 0 || !parentCellRetained)) {
              break;
            }
            if (iteration > 0 && std.div(1, std.mul(3, scale)) <= surfaceThreshold.$) {
              break;
            }
            const shiftedPoint = std.add(std.mul(point, scale), d.vec3f(1));
            const repeatedPoint = std.sub(
              std.mul(std.fract(std.mul(shiftedPoint, 0.5)), 2),
              d.vec3f(1),
            );
            let removedCrossDistance = d.f32(1_000);
            if (iteration === 0) {
              removedCrossDistance = std.div(
                crossDistance(std.mul(repeatedPoint, 3)),
                std.mul(3, scale),
              );
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
                d.vec2f(channelCenter.y, channelCenter.z),
                d.vec2f(probe.y, probe.z),
                std.min(probe.x, std.sub(1, probe.x)),
                scale,
              );
              const openingAlongY = openingDistance(
                d.vec2f(repeatedPoint.x, repeatedPoint.z),
                d.vec2f(channelCenter.x, channelCenter.z),
                d.vec2f(probe.x, probe.z),
                std.min(probe.y, std.sub(1, probe.y)),
                scale,
              );
              const openingAlongZ = openingDistance(
                d.vec2f(repeatedPoint.x, repeatedPoint.y),
                d.vec2f(channelCenter.x, channelCenter.y),
                d.vec2f(probe.x, probe.y),
                std.min(probe.z, std.sub(1, probe.z)),
                scale,
              );
              removedCrossDistance = std.min(openingAlongX, openingAlongY, openingAlongZ);
            }
            distance = std.max(distance, std.neg(removedCrossDistance));
            const repeatedAbsolute = std.abs(repeatedPoint);
            const xInMiddleThird = repeatedAbsolute.x <= 1 / 3;
            const yInMiddleThird = repeatedAbsolute.y <= 1 / 3;
            const zInMiddleThird = repeatedAbsolute.z <= 1 / 3;
            parentCellRetained =
              parentCellRetained &&
              !(
                (xInMiddleThird && yInMiddleThird) ||
                (xInMiddleThird && zInMiddleThird) ||
                (yInMiddleThird && zInMiddleThird)
              );
            scale = std.mul(scale, 3);
          }

          return distance;
        };
        const surfaceNormal = (point: d.v3f): d.v3f => {
          "use gpu";
          const epsilon = std.mul(surfaceThreshold.$, 1.5);
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
        const fragment = tgpu.fragmentFn({
          in: { uv: d.vec2f },
          out: d.vec4f,
        })(({ uv }) => {
          "use gpu";
          const screenPoint = d.vec2f(
            std.mul(std.sub(uv.x, 0.5), std.mul(2, aspectRatio.$)),
            std.mul(std.sub(uv.y, 0.5), -2),
          );
          const rayOrigin = std.add(
            std.mul(cameraVector.$, CAMERA_DISTANCE),
            std.add(
              std.mul(cameraRight.$, std.mul(screenPoint.x, CAMERA_FRUSTUM_HALF_SPAN)),
              std.mul(cameraUp.$, std.mul(screenPoint.y, CAMERA_FRUSTUM_HALF_SPAN)),
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

          const cameraAxis = std.abs(cameraVector.$);
          if (std.max(cameraAxis.x, cameraAxis.y, cameraAxis.z) > 0.999_999) {
            // A snapped face-on view is a 2D carpet with one visible face color.
            const facePoint = std.add(rayOrigin, std.mul(rayDirection, distanceAlongRay));
            if (mengerDistance(facePoint) > surfaceThreshold.$) {
              return d.vec4f(background.$, 1);
            }
            return d.vec4f(axisColor(cameraAxis), 1);
          }

          for (let step = 0; step < MAXIMUM_RAY_STEPS; step += 1) {
            const point = std.add(rayOrigin, std.mul(rayDirection, distanceAlongRay));
            const distance = mengerDistance(point);
            if (distance < surfaceThreshold.$) {
              return d.vec4f(axisColor(std.abs(surfaceNormal(point))), 1);
            }
            distanceAlongRay = std.add(
              distanceAlongRay,
              std.max(distance, std.mul(surfaceThreshold.$, 0.5)),
            );
            if (distanceAlongRay > boxExitDistance) {
              break;
            }
          }

          return d.vec4f(background.$, 1);
        });
        const pipeline = root.createRenderPipeline({
          vertex: common.fullScreenTriangle,
          fragment,
        });
        await pipeline.initAsync();
        // eslint-disable-next-line typescript/no-unnecessary-condition -- Cleanup can abort while pipeline initialization awaits.
        if (lifetime.signal.aborted) {
          return;
        }

        const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
        let clientPointer: ClientPoint | null = null;
        let lastHoverFrameTime: number | null = null;
        let lastProbe: MengerHoverProbe = { x: 0.5, y: 0.5, z: 0.5 };
        let renderedOpenness = 0;
        const writeHoverState = (timestampMs: number): boolean => {
          const probe =
            clientPointer === null ? null : readHoverProbe(canvas, clientPointer, viewRef.current);
          if (probe) {
            lastProbe = probe;
            canvas.dataset["hoverCoordinateX"] = probe.x.toFixed(3);
            canvas.dataset["hoverCoordinateY"] = probe.y.toFixed(3);
            canvas.dataset["hoverCoordinateZ"] = probe.z.toFixed(3);
          } else {
            delete canvas.dataset["hoverCoordinateX"];
            delete canvas.dataset["hoverCoordinateY"];
            delete canvas.dataset["hoverCoordinateZ"];
          }

          const targetOpenness =
            probe &&
            Math.hypot(
              Math.max(-probe.x, probe.x - 1, 0),
              Math.max(-probe.y, probe.y - 1, 0),
              Math.max(-probe.z, probe.z - 1, 0),
            ) < MENGER_HOVER_DEFAULT_REVEAL_RADIUS
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
            revealRadius: MENGER_HOVER_DEFAULT_REVEAL_RADIUS,
          });
          canvas.dataset["hoverMaximumOpenness"] = renderedOpenness.toFixed(6);
          canvas.dataset["hoverSettled"] = settled ? "true" : "false";

          return !settled;
        };
        const renderNow = (timestampMs = performance.now()) => {
          const hoverNeedsFrame = writeHoverState(timestampMs);
          pipeline.withColorAttachment({ view: context.getCurrentTexture().createView() }).draw(3);
          if (hoverNeedsFrame) {
            requestRender();
          }
        };
        let renderFrame = 0;
        const requestRender = () => {
          if (renderFrame !== 0 || lifetime.signal.aborted) {
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
            event.buttons !== 0
          ) {
            return;
          }

          clientPointer = { x: event.clientX, y: event.clientY };
          requestRender();
        };
        const onWindowPointerUp = (event: PointerEvent) => {
          if (
            !event.isPrimary ||
            event.pointerType === "touch" ||
            document.visibilityState !== "visible"
          ) {
            return;
          }

          clientPointer = { x: event.clientX, y: event.clientY };
          requestRender();
        };
        const closeHover = () => {
          clientPointer = null;
          requestRender();
        };
        const onReducedMotionChange = () => {
          requestRender();
        };
        window.addEventListener("blur", closeHover);
        window.addEventListener("pointermove", onWindowPointerMove);
        window.addEventListener("pointerup", onWindowPointerUp);
        reducedMotionQuery.addEventListener("change", onReducedMotionChange);
        document.documentElement.addEventListener("pointerleave", closeHover);
        removeHoverListeners = () => {
          window.removeEventListener("blur", closeHover);
          window.removeEventListener("pointermove", onWindowPointerMove);
          window.removeEventListener("pointerup", onWindowPointerUp);
          reducedMotionQuery.removeEventListener("change", onReducedMotionChange);
          document.documentElement.removeEventListener("pointerleave", closeHover);
          removeHoverListeners = () => {};
        };
        const writeView = (view: LogoViewState) => {
          const frame = readCameraFrame(view);
          cameraRight.write(toGpuVector(frame.right));
          cameraUp.write(toGpuVector(frame.up));
          cameraVector.write(toGpuVector(frame.cameraVector));
          requestRender();
        };
        const writeColors = (colors: SceneColors) => {
          background.write(readGpuColor(colors.background));
          leftColor.write(readGpuColor(colors.left));
          rightColor.write(readGpuColor(colors.right));
          topColor.write(readGpuColor(colors.top));
        };
        const resize = () => {
          const devicePixelRatio = Math.min(
            window.devicePixelRatio || 1,
            MAXIMUM_DEVICE_PIXEL_RATIO,
          );
          const nextWidth = Math.max(
            1,
            Math.floor(canvas.clientWidth * devicePixelRatio * resolutionScaleRef.current),
          );
          const nextHeight = Math.max(
            1,
            Math.floor(canvas.clientHeight * devicePixelRatio * resolutionScaleRef.current),
          );
          if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
            canvas.width = nextWidth;
            canvas.height = nextHeight;
            aspectRatio.write(nextWidth / nextHeight);
            surfaceThreshold.write(
              Math.max((CAMERA_FRUSTUM_HALF_SPAN * 2 * 0.12) / nextHeight, 0.0002),
            );
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
        writeDepthRef.current = (nextDepth) => {
          selectedDepth.write(nextDepth);
          requestRender();
        };
        writeViewRef.current = writeView;

        resizeObserver.observe(canvas);
        writeColors(colorsRef.current);
        selectedDepth.write(depthRef.current);
        writeView(viewRef.current);
        resize();
        cancelRender();
        renderNow();
        setStatus("ready");

        void root.device.lost.then(() => {
          if (!lifetime.signal.aborted) {
            canvas.dataset["rendererError"] = "The WebGPU device was lost.";
            deactivateRenderer();
            destroyRoot();
            setStatus("unavailable");
          }
        });
      } catch (error: unknown) {
        deactivateRenderer();
        destroyRoot();
        if (!lifetime.signal.aborted) {
          canvas.dataset["rendererError"] =
            error instanceof Error ? error.message : "WebGPU did not start.";
          setStatus("unavailable");
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
  }, []);

  useEffect(() => {
    depthRef.current = depth;
    writeDepthRef.current(depth);
  }, [depth]);

  useEffect(() => {
    resolutionScaleRef.current = resolutionScale;
    resizeRef.current();
  }, [resolutionScale]);

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

  return (
    <div
      aria-label="TypeGPU Menger hover reveal"
      className="relative h-full min-h-0 w-full"
      data-renderer="typegpu-ray-march"
      data-renderer-state={status}
      data-testid="logo-menger-webgpu-scene"
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
