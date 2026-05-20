import {
  INTERACTIVE_LOGO_SVG_URL,
  MONOCHROME_INTERACTIVE_LOGO_SVG_URL,
  STATIC_LOGO_BACKGROUND_COLOR,
  STATIC_LOGO_ELEVATION_DEGREES,
  LOGO_IDENTITY_VIEW_CONTRACTS,
  LOGO_THREE_SVG_VIEWBOX_SIZE,
  STATIC_LOGO_ROTATION_DEGREES,
  STATIC_LOGO_VOXEL_COORDINATES,
  type LogoIdentityViewId,
} from "./logoStaticSvgContract";
import {
  LOGO_SINGLE_COLOR_STRIPED_LEFT_FACE_STYLE,
  type LogoStripedLeftFaceStyle,
} from "./logoLeftFaceStyle";
import {
  DEFAULT_FACE_COLORS,
  getTailwindColorHex,
  type FaceColorKey,
  type FaceColors,
} from "./logoTailwindColors";
import {
  buildLogoSurfaceQuads,
  type LogoSurfaceQuad,
  type LogoSurfaceVertex,
} from "./logoSurfaceModel";
import {
  createLogoProjector,
  createLogoThreeSvgMarkup,
  type LogoProjectedPoint,
  type LogoWorldPoint,
} from "./logoThreeSvgRenderer";
import { GRID_SIZE, createFilledVoxelSet } from "./logoVoxelState";

type StaticLogoSvgOptions = {
  depth?: number;
  faceColors?: FaceColors;
  filledVoxels?: ReadonlySet<string>;
  gridSize?: number;
  view?: {
    elevationDegrees: number;
    rotationDegrees: number;
  };
};

type InteractiveLogoSvgOptions = {
  colorMode?: InteractiveLogoColorMode;
  faceColors?: FaceColors;
  filledVoxels?: ReadonlySet<string>;
  gridSize?: number;
};

type InteractiveLogoColorMode = "color" | "monochrome";
type InteractiveLogoStateId = "v1" | "v2" | "v3";

type LocalPoint = {
  x: number;
  y: number;
};

type ProjectedFaceState = {
  center: LogoProjectedPoint;
  depth: number;
  points: readonly LogoProjectedPoint[];
  visible: boolean;
};

type InteractiveLogoFace = {
  colorKey: FaceColorKey;
  key: string;
  states: {
    v1: ProjectedFaceState;
    v2: ProjectedFaceState;
    v3: ProjectedFaceState;
  };
};

type InteractiveLogoFacePaint =
  | {
      fill: string;
      kind: "solid";
      stroke: string;
    }
  | {
      background: string;
      foreground: string;
      kind: "striped";
      stroke: string;
    };

type InteractiveLogoPolygonState = {
  opacity: number;
  points: readonly LogoProjectedPoint[];
};

type InteractiveLogoPolygon = {
  className: string;
  colorKey: FaceColorKey;
  fill: string;
  key: string;
  states: Record<InteractiveLogoStateId, InteractiveLogoPolygonState>;
  stroke: string | null;
  strokeWidth: number;
};

const INTERACTIVE_LOGO_FACE_STROKE_WIDTH = 0.75;
const INTERACTIVE_LOGO_TRANSITION_MS = 220;
const INTERACTIVE_LOGO_VISIBILITY_EPSILON = 0.000001;
const INTERACTIVE_LOGO_FACE_BLEED = 0.012;

function escapeSvgAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatSvgNumber(value: number) {
  return value.toFixed(6);
}

function serializeLogoProjectedPoint(point: LogoProjectedPoint) {
  return `${formatSvgNumber(point.x)},${formatSvgNumber(point.y)}`;
}

function createInteractiveLogoStyleMarkup() {
  return `<style>
.noter-logo-face-part {
  pointer-events: none;
}
.noter-logo-v1-seam-mask {
  pointer-events: none;
}
.noter-logo-hitbox {
  cursor: pointer;
}
.noter-logo-interactive-svg {
  overflow: visible;
}
@media (prefers-reduced-motion: reduce) {
  .noter-logo-face-part {
    transition: none;
  }
}
</style>`;
}

function createInteractiveLogoScriptMarkup() {
  return `<script><![CDATA[
(() => {
  const svg = document.currentScript && document.currentScript.ownerSVGElement;
  if (!svg) {
    return;
  }

  const stateIds = ["v1", "v2", "v3"];
  const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const durationMs = reducedMotion ? 0 : ${INTERACTIVE_LOGO_TRANSITION_MS};
  const parsePoints = (value) =>
    value.trim().split(/\\s+/).map((pair) => {
      const [x, y] = pair.split(",").map(Number);
      return [x, y];
    });
  const formatPoints = (points) =>
    points.map(([x, y]) => x.toFixed(6) + "," + y.toFixed(6)).join(" ");
  const mix = (from, to, progress) => from + (to - from) * progress;
  const ease = (progress) => 1 - Math.pow(1 - progress, 3);
  const parts = [...svg.querySelectorAll("[data-logo-points-v1]")].map((element) => {
    const states = {};
    for (const stateId of stateIds) {
      const datasetSuffix = stateId[0].toUpperCase() + stateId.slice(1);
      states[stateId] = {
        opacity: Number(element.dataset["logoOpacity" + datasetSuffix] || "1"),
        points: parsePoints(element.dataset["logoPoints" + datasetSuffix] || ""),
      };
    }

    element.setAttribute("points", formatPoints(states.v1.points));
    element.style.opacity = String(states.v1.opacity);

    return {
      currentOpacity: states.v1.opacity,
      currentPoints: states.v1.points,
      element,
      fromOpacity: states.v1.opacity,
      fromPoints: states.v1.points,
      states,
      toOpacity: states.v1.opacity,
      toPoints: states.v1.points,
    };
  });
  const opacityOnlyParts = [...svg.querySelectorAll("[data-logo-opacity-only-v1]")].map((element) => {
    const states = {};
    for (const stateId of stateIds) {
      const datasetSuffix = stateId[0].toUpperCase() + stateId.slice(1);
      states[stateId] = {
        opacity: Number(element.dataset["logoOpacityOnly" + datasetSuffix] || "1"),
      };
    }

    element.style.opacity = String(states.v1.opacity);

    return {
      currentOpacity: states.v1.opacity,
      element,
      fromOpacity: states.v1.opacity,
      states,
      toOpacity: states.v1.opacity,
    };
  });
  const opacityParts = [...parts, ...opacityOnlyParts];

  let animationFrame = 0;
  let animationStart = 0;
  let hovering = false;
  let pressing = false;
  let targetState = "v1";

  const applyProgress = (progress) => {
    const easedProgress = ease(progress);
    for (const part of parts) {
      const nextPoints = part.fromPoints.map(([fromX, fromY], index) => {
        const [toX, toY] = part.toPoints[index] || [fromX, fromY];
        return [mix(fromX, toX, easedProgress), mix(fromY, toY, easedProgress)];
      });

      part.currentPoints = nextPoints;
      part.element.setAttribute("points", formatPoints(nextPoints));
    }

    for (const part of opacityParts) {
      const nextOpacity = mix(part.fromOpacity, part.toOpacity, easedProgress);

      part.currentOpacity = nextOpacity;
      part.element.style.opacity = String(nextOpacity);
    }
  };

  const tick = (now) => {
    if (durationMs === 0) {
      applyProgress(1);
      animationFrame = 0;
      return;
    }

    const progress = Math.min(1, (now - animationStart) / durationMs);
    applyProgress(progress);
    if (progress < 1) {
      animationFrame = requestAnimationFrame(tick);
      return;
    }

    animationFrame = 0;
  };

  const setTargetState = (nextState) => {
    if (targetState === nextState && animationFrame === 0) {
      return;
    }

    targetState = nextState;
    animationStart = performance.now();
    for (const part of parts) {
      part.fromPoints = part.currentPoints.map(([x, y]) => [x, y]);
      part.toPoints = part.states[nextState].points;
    }
    for (const part of opacityParts) {
      part.fromOpacity = part.currentOpacity;
      part.toOpacity = part.states[nextState].opacity;
    }

    if (animationFrame !== 0) {
      cancelAnimationFrame(animationFrame);
    }
    animationFrame = requestAnimationFrame(tick);
  };

  const interactionTarget = svg.closest && svg.closest("a") ? svg.closest("a") : svg;
  interactionTarget.addEventListener("pointerenter", () => {
    hovering = true;
    if (!pressing) {
      setTargetState("v2");
    }
  });
  interactionTarget.addEventListener("pointerleave", () => {
    hovering = false;
    pressing = false;
    setTargetState("v1");
  });
  interactionTarget.addEventListener("pointerdown", (event) => {
    pressing = true;
    if (svg.setPointerCapture && event.pointerId !== undefined) {
      svg.setPointerCapture(event.pointerId);
    }
    setTargetState("v3");
  });
  interactionTarget.addEventListener("pointerup", () => {
    pressing = false;
    setTargetState(hovering ? "v2" : "v1");
  });
  interactionTarget.addEventListener("pointercancel", () => {
    pressing = false;
    setTargetState(hovering ? "v2" : "v1");
  });
})();
]]></script>`;
}

function toLogoWorldPoint([x, y, z]: LogoSurfaceVertex): LogoWorldPoint {
  return { x, y, z };
}

function dotLogoWorldPoints(left: LogoWorldPoint, right: LogoWorldPoint) {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function getProjectedPointCenter(
  points: readonly LogoProjectedPoint[],
): LogoProjectedPoint {
  if (points.length === 0) {
    return { x: 0, y: 0 };
  }

  const total = points.reduce(
    (sum, point) => ({
      x: sum.x + point.x,
      y: sum.y + point.y,
    }),
    { x: 0, y: 0 },
  );

  return {
    x: total.x / points.length,
    y: total.y / points.length,
  };
}

function getLogoWorldPointCenter(
  points: readonly LogoWorldPoint[],
): LogoWorldPoint {
  if (points.length === 0) {
    return { x: 0, y: 0, z: 0 };
  }

  const total = points.reduce(
    (sum, point) => ({
      x: sum.x + point.x,
      y: sum.y + point.y,
      z: sum.z + point.z,
    }),
    { x: 0, y: 0, z: 0 },
  );

  return {
    x: total.x / points.length,
    y: total.y / points.length,
    z: total.z / points.length,
  };
}

function projectInteractiveLogoFaceState({
  projector,
  surfaceQuad,
}: {
  projector: ReturnType<typeof createLogoProjector>;
  surfaceQuad: LogoSurfaceQuad;
}): ProjectedFaceState {
  const normal = projector.rotateWorldPoint(
    toLogoWorldPoint(surfaceQuad.normal),
  );
  const visible =
    dotLogoWorldPoints(normal, projector.cameraDirection) >
    INTERACTIVE_LOGO_VISIBILITY_EPSILON;
  const rotatedVertices = surfaceQuad.vertices.map((vertex) =>
    projector.rotateWorldPoint(toLogoWorldPoint(vertex)),
  );
  const projectedPoints = rotatedVertices.map((vertex) =>
    projector.projectRotatedPoint(vertex),
  );
  const center = getProjectedPointCenter(projectedPoints);
  const rotatedCenter = getLogoWorldPointCenter(rotatedVertices);

  return {
    center,
    depth: dotLogoWorldPoints(rotatedCenter, projector.cameraDirection),
    points: projectedPoints,
    visible,
  };
}

function createInteractiveLogoViewProjectors(
  surfaceQuads: readonly LogoSurfaceQuad[],
) {
  const scenePoints = surfaceQuads.flatMap((surfaceQuad) =>
    surfaceQuad.vertices.map(toLogoWorldPoint),
  );
  const v1View = getLogoIdentityViewContract("side-primary");
  const v2View = getLogoIdentityViewContract("side-diagonal");
  const v3View = getLogoIdentityViewContract("spatial");

  return {
    v1: createLogoProjector({
      elevationDegrees: v1View.elevationDegrees,
      rotationDegrees: v1View.rotationDegrees,
      scenePoints,
      viewBoxSize: LOGO_THREE_SVG_VIEWBOX_SIZE,
    }),
    v2: createLogoProjector({
      elevationDegrees: v2View.elevationDegrees,
      rotationDegrees: v2View.rotationDegrees,
      scenePoints,
      viewBoxSize: LOGO_THREE_SVG_VIEWBOX_SIZE,
    }),
    v3: createLogoProjector({
      elevationDegrees: v3View.elevationDegrees,
      rotationDegrees: v3View.rotationDegrees,
      scenePoints,
      viewBoxSize: LOGO_THREE_SVG_VIEWBOX_SIZE,
    }),
  };
}

function createInteractiveLogoFaces(
  surfaceQuads: readonly LogoSurfaceQuad[],
): InteractiveLogoFace[] {
  const projectors = createInteractiveLogoViewProjectors(surfaceQuads);

  return surfaceQuads
    .map((surfaceQuad) => {
      const v1Projection = projectInteractiveLogoFaceState({
        projector: projectors.v1,
        surfaceQuad,
      });
      const v2Projection = projectInteractiveLogoFaceState({
        projector: projectors.v2,
        surfaceQuad,
      });
      const v3Projection = projectInteractiveLogoFaceState({
        projector: projectors.v3,
        surfaceQuad,
      });

      return {
        colorKey: surfaceQuad.colorKey,
        key: surfaceQuad.key,
        states: {
          v1: v1Projection,
          v2: v2Projection,
          v3: v3Projection,
        },
      };
    })
    .filter(
      (face) =>
        face.states.v1.visible ||
        face.states.v2.visible ||
        face.states.v3.visible,
    )
    .sort((left, right) => {
      const leftDepth = left.states.v3.visible
        ? left.states.v3.depth
        : left.states.v2.depth;
      const rightDepth = right.states.v3.visible
        ? right.states.v3.depth
        : right.states.v2.depth;

      return leftDepth - rightDepth || left.key.localeCompare(right.key);
    });
}

function collectSortedUniqueCoordinates(values: readonly number[]) {
  const coordinatesByKey = new Map<string, number>();
  for (const value of values) {
    coordinatesByKey.set(formatSvgNumber(value), value);
  }

  return [...coordinatesByKey.values()].sort((left, right) => left - right);
}

function createSidePrimaryRingPathFromCenters({
  xCoordinates,
  yCoordinates,
}: {
  xCoordinates: readonly number[];
  yCoordinates: readonly number[];
}) {
  const cellWidth = xCoordinates[1] - xCoordinates[0];
  const cellHeight = yCoordinates[1] - yCoordinates[0];
  const x0 = xCoordinates[0] - cellWidth / 2;
  const x1 = xCoordinates[1] - cellWidth / 2;
  const x2 = xCoordinates[1] + cellWidth / 2;
  const x3 = xCoordinates[2] + cellWidth / 2;
  const y0 = yCoordinates[0] - cellHeight / 2;
  const y1 = yCoordinates[1] - cellHeight / 2;
  const y2 = yCoordinates[1] + cellHeight / 2;
  const y3 = yCoordinates[2] + cellHeight / 2;

  return [
    `M ${formatSvgNumber(x0)} ${formatSvgNumber(y0)}`,
    `H ${formatSvgNumber(x3)}`,
    `V ${formatSvgNumber(y3)}`,
    `H ${formatSvgNumber(x0)}`,
    "Z",
    `M ${formatSvgNumber(x1)} ${formatSvgNumber(y1)}`,
    `H ${formatSvgNumber(x2)}`,
    `V ${formatSvgNumber(y2)}`,
    `H ${formatSvgNumber(x1)}`,
    "Z",
  ].join(" ");
}

function createInteractiveLogoV1SeamMask({
  fill,
  surfaceQuads,
}: {
  fill: string;
  surfaceQuads: readonly LogoSurfaceQuad[];
}) {
  const projectors = createInteractiveLogoViewProjectors(surfaceQuads);
  const visibleRightFaces = surfaceQuads
    .filter((surfaceQuad) => surfaceQuad.colorKey === "right")
    .map((surfaceQuad) =>
      projectInteractiveLogoFaceState({
        projector: projectors.v1,
        surfaceQuad,
      }),
    )
    .filter((face) => face.visible);
  const xCoordinates = collectSortedUniqueCoordinates(
    visibleRightFaces.flatMap((face) => [face.center.x]),
  );
  const yCoordinates = collectSortedUniqueCoordinates(
    visibleRightFaces.flatMap((face) => [face.center.y]),
  );

  if (xCoordinates.length !== 3 || yCoordinates.length !== 3) {
    return "";
  }

  return `<path class="noter-logo-v1-seam-mask" fill="${escapeSvgAttribute(fill)}" fill-rule="evenodd" d="${escapeSvgAttribute(createSidePrimaryRingPathFromCenters({ xCoordinates, yCoordinates }))}" data-logo-opacity-only-v1="1" data-logo-opacity-only-v2="0" data-logo-opacity-only-v3="0" opacity="1"/>`;
}

function getInteractiveLogoFacePaint({
  colorKey,
  colorMode,
  faceColors,
}: {
  colorKey: FaceColorKey;
  colorMode: InteractiveLogoColorMode;
  faceColors: FaceColors;
}): InteractiveLogoFacePaint {
  if (colorMode === "monochrome") {
    const foreground = getTailwindColorHex(faceColors.right);
    const background = getTailwindColorHex(faceColors.top);

    if (colorKey === "left") {
      return {
        background,
        foreground,
        kind: "striped",
        stroke: foreground,
      };
    }

    const fill = colorKey === "top" ? background : foreground;
    return {
      fill,
      kind: "solid",
      stroke: fill,
    };
  }

  const fill = getTailwindColorHex(faceColors[colorKey]);
  return {
    fill,
    kind: "solid",
    stroke: fill,
  };
}

function isInsideStripeHalfPlane({
  keepGreater,
  point,
  threshold,
}: {
  keepGreater: boolean;
  point: LocalPoint;
  threshold: number;
}) {
  const sum = point.x + point.y;
  return keepGreater ? sum >= threshold : sum <= threshold;
}

function intersectStripeBoundary(
  start: LocalPoint,
  end: LocalPoint,
  threshold: number,
): LocalPoint {
  const startSum = start.x + start.y;
  const endSum = end.x + end.y;
  const denominator = endSum - startSum;
  if (denominator === 0) {
    return start;
  }

  const progress = (threshold - startSum) / denominator;
  return {
    x: start.x + (end.x - start.x) * progress,
    y: start.y + (end.y - start.y) * progress,
  };
}

function clipPolygonByStripeBoundary({
  keepGreater,
  points,
  threshold,
}: {
  keepGreater: boolean;
  points: readonly LocalPoint[];
  threshold: number;
}) {
  const clippedPoints: LocalPoint[] = [];
  const firstPrevious = points.at(-1);
  if (!firstPrevious) {
    return clippedPoints;
  }

  let previous = firstPrevious;
  let wasPreviousInside = isInsideStripeHalfPlane({
    keepGreater,
    point: previous,
    threshold,
  });

  for (const point of points) {
    const isPointInside = isInsideStripeHalfPlane({
      keepGreater,
      point,
      threshold,
    });

    if (isPointInside !== wasPreviousInside) {
      clippedPoints.push(intersectStripeBoundary(previous, point, threshold));
    }
    if (isPointInside) {
      clippedPoints.push(point);
    }

    previous = point;
    wasPreviousInside = isPointInside;
  }

  return clippedPoints;
}

function createStripeBandPolygon({
  lower,
  upper,
}: {
  lower: number;
  upper: number;
}) {
  const clippedLower = clipPolygonByStripeBoundary({
    keepGreater: true,
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
    threshold: lower,
  });

  return clipPolygonByStripeBoundary({
    keepGreater: false,
    points: clippedLower,
    threshold: upper,
  });
}

function createStripeBandPolygons(style: LogoStripedLeftFaceStyle) {
  const period = style.stripeWidth + style.stripeGap;
  if (period <= 0 || style.stripeWidth <= 0) {
    return [];
  }

  const stripeStart = -period;
  const stripeEnd = 2 + period;
  const polygons: LocalPoint[][] = [];

  for (let lower = stripeStart; lower < stripeEnd; lower += period) {
    const band = createStripeBandPolygon({
      lower: lower + style.stripeOffset * period,
      upper: lower + style.stripeOffset * period + style.stripeWidth,
    });
    if (band.length < 3) {
      continue;
    }

    polygons.push(band);
  }

  return polygons;
}

function projectLocalFacePoint({
  localPoint,
  state,
}: {
  localPoint: LocalPoint;
  state: ProjectedFaceState;
}): LogoProjectedPoint {
  if (!state.visible) {
    return state.center;
  }

  const origin = state.points[0] ?? state.center;
  const uPoint = state.points[1] ?? origin;
  const vPoint = state.points[3] ?? origin;

  return {
    x:
      origin.x +
      (uPoint.x - origin.x) * localPoint.x +
      (vPoint.x - origin.x) * localPoint.y,
    y:
      origin.y +
      (uPoint.y - origin.y) * localPoint.x +
      (vPoint.y - origin.y) * localPoint.y,
  };
}

function createInteractiveLogoPolygonState({
  localPoints,
  state,
}: {
  localPoints: readonly LocalPoint[];
  state: ProjectedFaceState;
}): InteractiveLogoPolygonState {
  return {
    opacity: state.visible ? 1 : 0,
    points: localPoints.map((localPoint) =>
      projectLocalFacePoint({ localPoint, state }),
    ),
  };
}

function serializeProjectedPolygon(points: readonly LogoProjectedPoint[]) {
  return points.map(serializeLogoProjectedPoint).join(" ");
}

function createInteractiveLogoPolygon({
  className,
  colorKey,
  face,
  fill,
  key,
  localPoints,
  stroke,
  strokeWidth,
}: {
  className: string;
  colorKey: FaceColorKey;
  face: InteractiveLogoFace;
  fill: string;
  key: string;
  localPoints: readonly LocalPoint[];
  stroke: string | null;
  strokeWidth: number;
}): InteractiveLogoPolygon {
  return {
    className,
    colorKey,
    fill,
    key,
    states: {
      v1: createInteractiveLogoPolygonState({
        localPoints,
        state: face.states.v1,
      }),
      v2: createInteractiveLogoPolygonState({
        localPoints,
        state: face.states.v2,
      }),
      v3: createInteractiveLogoPolygonState({
        localPoints,
        state: face.states.v3,
      }),
    },
    stroke,
    strokeWidth,
  };
}

function createInteractiveLogoPolygons({
  colorMode,
  face,
  faceColors,
}: {
  colorMode: InteractiveLogoColorMode;
  face: InteractiveLogoFace;
  faceColors: FaceColors;
}): InteractiveLogoPolygon[] {
  const paint = getInteractiveLogoFacePaint({
    colorKey: face.colorKey,
    colorMode,
    faceColors,
  });
  const faceLocalPoints = [
    { x: -INTERACTIVE_LOGO_FACE_BLEED, y: -INTERACTIVE_LOGO_FACE_BLEED },
    { x: 1 + INTERACTIVE_LOGO_FACE_BLEED, y: -INTERACTIVE_LOGO_FACE_BLEED },
    {
      x: 1 + INTERACTIVE_LOGO_FACE_BLEED,
      y: 1 + INTERACTIVE_LOGO_FACE_BLEED,
    },
    { x: -INTERACTIVE_LOGO_FACE_BLEED, y: 1 + INTERACTIVE_LOGO_FACE_BLEED },
  ];

  if (paint.kind === "striped") {
    const background = createInteractiveLogoPolygon({
      className: "noter-logo-face-part noter-logo-face",
      colorKey: face.colorKey,
      face,
      fill: paint.background,
      key: `${face.key}:background`,
      localPoints: faceLocalPoints,
      stroke: paint.stroke,
      strokeWidth: INTERACTIVE_LOGO_FACE_STROKE_WIDTH,
    });
    const stripes = createStripeBandPolygons(
      LOGO_SINGLE_COLOR_STRIPED_LEFT_FACE_STYLE,
    ).map((localPoints, index) =>
      createInteractiveLogoPolygon({
        className: "noter-logo-face-part noter-logo-stripe",
        colorKey: face.colorKey,
        face,
        fill: paint.foreground,
        key: `${face.key}:stripe:${index}`,
        localPoints,
        stroke: null,
        strokeWidth: 0,
      }),
    );

    return [background, ...stripes];
  }

  return [
    createInteractiveLogoPolygon({
      className: "noter-logo-face-part noter-logo-face",
      colorKey: face.colorKey,
      face,
      fill: paint.fill,
      key: `${face.key}:face`,
      localPoints: faceLocalPoints,
      stroke: paint.stroke,
      strokeWidth: INTERACTIVE_LOGO_FACE_STROKE_WIDTH,
    }),
  ];
}

function createInteractiveLogoPolygonMarkup(polygon: InteractiveLogoPolygon) {
  const stroke =
    polygon.stroke === null
      ? ""
      : ` stroke="${escapeSvgAttribute(polygon.stroke)}" stroke-width="${formatSvgNumber(polygon.strokeWidth)}" stroke-linejoin="round" paint-order="fill stroke"`;

  return `<polygon class="${escapeSvgAttribute(polygon.className)}" data-logo-part="${escapeSvgAttribute(polygon.key)}" data-logo-color-key="${polygon.colorKey}" data-logo-points-v1="${escapeSvgAttribute(serializeProjectedPolygon(polygon.states.v1.points))}" data-logo-points-v2="${escapeSvgAttribute(serializeProjectedPolygon(polygon.states.v2.points))}" data-logo-points-v3="${escapeSvgAttribute(serializeProjectedPolygon(polygon.states.v3.points))}" data-logo-opacity-v1="${polygon.states.v1.opacity}" data-logo-opacity-v2="${polygon.states.v2.opacity}" data-logo-opacity-v3="${polygon.states.v3.opacity}" points="${escapeSvgAttribute(serializeProjectedPolygon(polygon.states.v1.points))}" fill="${escapeSvgAttribute(polygon.fill)}"${stroke} opacity="${polygon.states.v1.opacity}"/>`;
}

export function createStaticLogoSvgMarkup(options: StaticLogoSvgOptions = {}) {
  const filledVoxels =
    options.filledVoxels ?? createFilledVoxelSet(STATIC_LOGO_VOXEL_COORDINATES);
  const view = options.view ?? {
    elevationDegrees: STATIC_LOGO_ELEVATION_DEGREES,
    rotationDegrees: STATIC_LOGO_ROTATION_DEGREES,
  };

  return createLogoThreeSvgMarkup({
    backgroundColor: STATIC_LOGO_BACKGROUND_COLOR,
    depth: options.depth,
    elevationDegrees: view.elevationDegrees,
    faceColors: options.faceColors ?? DEFAULT_FACE_COLORS,
    filledVoxels,
    gridSize: options.gridSize ?? GRID_SIZE,
    rotationDegrees: view.rotationDegrees,
  });
}

export function createLogoIdentityViewSvgMarkup(
  viewId: LogoIdentityViewId,
  options: StaticLogoSvgOptions = {},
) {
  const filledVoxels =
    options.filledVoxels ?? createFilledVoxelSet(STATIC_LOGO_VOXEL_COORDINATES);
  const view = getLogoIdentityViewContract(viewId);

  return createLogoThreeSvgMarkup({
    backgroundColor: STATIC_LOGO_BACKGROUND_COLOR,
    depth: options.depth,
    elevationDegrees: view.elevationDegrees,
    faceColors: options.faceColors ?? DEFAULT_FACE_COLORS,
    filledVoxels,
    gridSize: options.gridSize ?? GRID_SIZE,
    rotationDegrees: view.rotationDegrees,
  });
}

export function createStaticLogoSvgDataUrl(options: StaticLogoSvgOptions = {}) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(createStaticLogoSvgMarkup(options))}`;
}

export function createLogoIdentitySvgAssets() {
  return LOGO_IDENTITY_VIEW_CONTRACTS.map((view) => ({
    assetPath: view.assetPath,
    markup: createLogoIdentityViewSvgMarkup(view.id),
    viewId: view.id,
  }));
}

/**
 * Builds the identity sequence as one inline SVG: version 1 by default,
 * version 2 on hover, and version 3 while the pointer press is active.
 */
export function createInteractiveLogoSvgMarkup(
  options: InteractiveLogoSvgOptions = {},
) {
  const filledVoxels =
    options.filledVoxels ?? createFilledVoxelSet(STATIC_LOGO_VOXEL_COORDINATES);
  const faceColors = options.faceColors ?? DEFAULT_FACE_COLORS;
  const colorMode = options.colorMode ?? "color";
  const surfaceQuads = buildLogoSurfaceQuads(
    filledVoxels,
    options.gridSize ?? GRID_SIZE,
  );
  const polygons = createInteractiveLogoFaces(surfaceQuads)
    .flatMap((face) =>
      createInteractiveLogoPolygons({
        colorMode,
        face,
        faceColors,
      }),
    )
    .map(createInteractiveLogoPolygonMarkup)
    .join("");
  const v1Paint = getInteractiveLogoFacePaint({
    colorKey: "right",
    colorMode,
    faceColors,
  });
  const v1Fill = v1Paint.kind === "striped" ? v1Paint.foreground : v1Paint.fill;
  const seamMask = createInteractiveLogoV1SeamMask({
    fill: v1Fill,
    surfaceQuads,
  });
  // The transparent hitbox keeps hover and active states live inside the
  // version 1 center cutout as well as over painted logo faces.
  const hitbox = `<rect class="noter-logo-hitbox" x="0" y="0" width="${LOGO_THREE_SVG_VIEWBOX_SIZE}" height="${LOGO_THREE_SVG_VIEWBOX_SIZE}" fill="${escapeSvgAttribute(STATIC_LOGO_BACKGROUND_COLOR)}" pointer-events="all"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LOGO_THREE_SVG_VIEWBOX_SIZE} ${LOGO_THREE_SVG_VIEWBOX_SIZE}" width="${LOGO_THREE_SVG_VIEWBOX_SIZE}" height="${LOGO_THREE_SVG_VIEWBOX_SIZE}" class="noter-logo-interactive-svg" data-logo-color-mode="${colorMode}" data-logo-animation="points">${createInteractiveLogoStyleMarkup()}${hitbox}<g class="noter-logo-faces">${polygons}</g>${seamMask}${createInteractiveLogoScriptMarkup()}</svg>`;
}

export function createInteractiveLogoSvgAsset() {
  return {
    assetPath: INTERACTIVE_LOGO_SVG_URL,
    markup: createInteractiveLogoSvgMarkup(),
  };
}

export function createMonochromeInteractiveLogoSvgAsset() {
  return {
    assetPath: MONOCHROME_INTERACTIVE_LOGO_SVG_URL,
    markup: createInteractiveLogoSvgMarkup({ colorMode: "monochrome" }),
  };
}

function getLogoIdentityViewContract(viewId: LogoIdentityViewId) {
  for (const view of LOGO_IDENTITY_VIEW_CONTRACTS) {
    if (view.id === viewId) {
      return view;
    }
  }

  throw new Error(`Unknown logo identity view: ${viewId}`);
}
