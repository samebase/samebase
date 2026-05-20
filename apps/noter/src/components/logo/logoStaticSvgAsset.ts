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

type LocalPoint = {
  x: number;
  y: number;
};

type ProjectedFaceState = {
  center: LogoProjectedPoint;
  depth: number;
  points: readonly LogoProjectedPoint[];
  transform: string;
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

const INTERACTIVE_LOGO_FACE_STROKE_WIDTH = 0.14;
const INTERACTIVE_LOGO_TRANSITION_MS = 220;

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

function serializeLocalPoint(point: LocalPoint) {
  return `${formatSvgNumber(point.x)},${formatSvgNumber(point.y)}`;
}

function serializeLocalPolygon(points: readonly LocalPoint[]) {
  return points.map(serializeLocalPoint).join(" ");
}

function createInteractiveLogoStyleMarkup() {
  return `<style>
.noter-logo-v1-clean,
.noter-logo-face {
  pointer-events: none;
  transition: opacity ${INTERACTIVE_LOGO_TRANSITION_MS}ms ease-out, transform ${INTERACTIVE_LOGO_TRANSITION_MS}ms ease-out;
}
.noter-logo-face {
  opacity: 0;
  transform: var(--logo-transform-v1);
  transform-box: view-box;
  transform-origin: 0 0;
}
.noter-logo-hitbox {
  cursor: pointer;
}
.noter-logo-interactive-svg:hover .noter-logo-v1-clean,
.noter-logo-hitbox:hover ~ .noter-logo-v1-clean,
.noter-logo-hitbox:active ~ .noter-logo-v1-clean {
  opacity: 0;
}
.noter-logo-interactive-svg:hover .noter-logo-face,
.noter-logo-hitbox:hover ~ .noter-logo-faces .noter-logo-face {
  opacity: var(--logo-opacity-v2);
  transform: var(--logo-transform-v2);
}
.noter-logo-interactive-svg:active .noter-logo-face,
.noter-logo-hitbox:active ~ .noter-logo-faces .noter-logo-face {
  opacity: var(--logo-opacity-v3);
  transform: var(--logo-transform-v3);
}
@media (prefers-reduced-motion: reduce) {
  .noter-logo-v1-clean,
  .noter-logo-face {
    transition: none;
  }
}
</style>`;
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

function createProjectedFaceTransform(points: readonly LogoProjectedPoint[]) {
  const origin = points[0] ?? { x: 0, y: 0 };
  const uPoint = points[1] ?? origin;
  const vPoint = points[3] ?? origin;

  return `matrix(${formatSvgNumber(uPoint.x - origin.x)}, ${formatSvgNumber(uPoint.y - origin.y)}, ${formatSvgNumber(vPoint.x - origin.x)}, ${formatSvgNumber(vPoint.y - origin.y)}, ${formatSvgNumber(origin.x)}, ${formatSvgNumber(origin.y)})`;
}

function createCollapsedFaceTransform(center: LogoProjectedPoint) {
  return `matrix(0, 0, 0, 0, ${formatSvgNumber(center.x)}, ${formatSvgNumber(center.y)})`;
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
  const visible = dotLogoWorldPoints(normal, projector.cameraDirection) > 0;
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
    transform: visible
      ? createProjectedFaceTransform(projectedPoints)
      : createCollapsedFaceTransform(center),
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
      const v1 = {
        ...v1Projection,
        transform: createCollapsedFaceTransform(v1Projection.center),
        visible: false,
      };

      return {
        colorKey: surfaceQuad.colorKey,
        key: surfaceQuad.key,
        states: {
          v1,
          v2: v2Projection,
          v3: v3Projection,
        },
      };
    })
    .filter((face) => face.states.v2.visible || face.states.v3.visible)
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

function createFallbackCleanV1Path(
  projectedFaces: readonly ProjectedFaceState[],
) {
  return projectedFaces
    .map((face) => {
      return `M ${face.points.map(serializeLogoProjectedPoint).join(" L ")} Z`;
    })
    .join(" ");
}

function createCleanSidePrimaryPath({
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
  const path =
    xCoordinates.length === 3 && yCoordinates.length === 3
      ? createSidePrimaryRingPathFromCenters({
          xCoordinates,
          yCoordinates,
        })
      : createFallbackCleanV1Path(visibleRightFaces);

  return `<path class="noter-logo-v1-clean" data-logo-view="side-primary" data-logo-version="1" fill="${escapeSvgAttribute(fill)}" fill-rule="evenodd" d="${escapeSvgAttribute(path)}"/>`;
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

function createStripePolygonsMarkup({
  fill,
  style,
}: {
  fill: string;
  style: LogoStripedLeftFaceStyle;
}) {
  const period = style.stripeWidth + style.stripeGap;
  if (period <= 0 || style.stripeWidth <= 0) {
    return "";
  }

  const stripeStart = -period;
  const stripeEnd = 2 + period;
  const polygons: string[] = [];

  for (let lower = stripeStart; lower < stripeEnd; lower += period) {
    const band = createStripeBandPolygon({
      lower: lower + style.stripeOffset * period,
      upper: lower + style.stripeOffset * period + style.stripeWidth,
    });
    if (band.length < 3) {
      continue;
    }

    polygons.push(
      `<polygon class="noter-logo-stripe" points="${escapeSvgAttribute(serializeLocalPolygon(band))}" fill="${escapeSvgAttribute(fill)}"/>`,
    );
  }

  return polygons.join("");
}

function createInteractiveLogoFaceShapeMarkup(paint: InteractiveLogoFacePaint) {
  if (paint.kind === "striped") {
    return [
      `<rect x="0" y="0" width="1" height="1" fill="${escapeSvgAttribute(paint.background)}" stroke="${escapeSvgAttribute(paint.stroke)}" stroke-width="${INTERACTIVE_LOGO_FACE_STROKE_WIDTH}" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`,
      createStripePolygonsMarkup({
        fill: paint.foreground,
        style: LOGO_SINGLE_COLOR_STRIPED_LEFT_FACE_STYLE,
      }),
    ].join("");
  }

  return `<rect x="0" y="0" width="1" height="1" fill="${escapeSvgAttribute(paint.fill)}" stroke="${escapeSvgAttribute(paint.stroke)}" stroke-width="${INTERACTIVE_LOGO_FACE_STROKE_WIDTH}" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`;
}

function createInteractiveLogoFaceMarkup({
  colorMode,
  face,
  faceColors,
}: {
  colorMode: InteractiveLogoColorMode;
  face: InteractiveLogoFace;
  faceColors: FaceColors;
}) {
  const style = [
    `--logo-transform-v1:${face.states.v1.transform}`,
    `--logo-transform-v2:${face.states.v2.transform}`,
    `--logo-transform-v3:${face.states.v3.transform}`,
    `--logo-opacity-v2:${face.states.v2.visible ? "1" : "0"}`,
    `--logo-opacity-v3:${face.states.v3.visible ? "1" : "0"}`,
  ].join(";");
  const paint = getInteractiveLogoFacePaint({
    colorKey: face.colorKey,
    colorMode,
    faceColors,
  });

  return `<g class="noter-logo-face" data-logo-face="${escapeSvgAttribute(face.key)}" data-logo-color-key="${face.colorKey}" style="${escapeSvgAttribute(style)}">${createInteractiveLogoFaceShapeMarkup(paint)}</g>`;
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
  const faceGroups = createInteractiveLogoFaces(surfaceQuads)
    .map((face) =>
      createInteractiveLogoFaceMarkup({
        colorMode,
        face,
        faceColors,
      }),
    )
    .join("");
  const v1Paint = getInteractiveLogoFacePaint({
    colorKey: "right",
    colorMode,
    faceColors,
  });
  const v1Fill = v1Paint.kind === "striped" ? v1Paint.foreground : v1Paint.fill;
  const cleanV1Path = createCleanSidePrimaryPath({
    fill: v1Fill,
    surfaceQuads,
  });
  // The transparent hitbox keeps hover and active states live inside the
  // version 1 center cutout as well as over painted logo faces.
  const hitbox = `<rect class="noter-logo-hitbox" x="0" y="0" width="${LOGO_THREE_SVG_VIEWBOX_SIZE}" height="${LOGO_THREE_SVG_VIEWBOX_SIZE}" fill="${escapeSvgAttribute(STATIC_LOGO_BACKGROUND_COLOR)}" pointer-events="all"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LOGO_THREE_SVG_VIEWBOX_SIZE} ${LOGO_THREE_SVG_VIEWBOX_SIZE}" width="${LOGO_THREE_SVG_VIEWBOX_SIZE}" height="${LOGO_THREE_SVG_VIEWBOX_SIZE}" class="noter-logo-interactive-svg" data-logo-color-mode="${colorMode}">${createInteractiveLogoStyleMarkup()}${hitbox}${cleanV1Path}<g class="noter-logo-faces">${faceGroups}</g></svg>`;
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
