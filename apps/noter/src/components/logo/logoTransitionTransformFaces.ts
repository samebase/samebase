import {
  LOGO_THREE_SVG_VIEWBOX_SIZE,
  STATIC_LOGO_ELEVATION_DEGREES,
  STATIC_LOGO_ROTATION_DEGREES,
} from "@/components/logo/logoStaticSvgContract";
import {
  DEFAULT_FACE_COLORS,
  getTailwindColorHex,
  type FaceColorKey,
} from "@/components/logo/logoTailwindColors";
import {
  createLogoProjector,
  type LogoProjectedPoint,
  type LogoWorldPoint,
} from "@/components/logo/logoThreeSvgRenderer";

type CubeFaceDefinition = {
  color: string;
  colorKey: FaceColorKey;
  key: string;
  origin: LogoWorldPoint;
  u: LogoWorldPoint;
  v: LogoWorldPoint;
};

type AxisGuideLine = {
  color: string;
  end: LogoProjectedPoint;
  key: "x" | "y" | "z";
  label: string;
  labelPosition: LogoProjectedPoint;
  start: LogoProjectedPoint;
};

export type TransformLabFace = {
  color: string;
  colorKey: FaceColorKey;
  corners: readonly LogoProjectedPoint[];
  depth: number;
  key: string;
  stroke: string;
  strokeWidth: number;
  transform: string;
};

export type TransformLabScene = {
  axisGuideLines: readonly AxisGuideLine[];
  faces: readonly TransformLabFace[];
  svgMarkup: string;
};

export const TRANSFORM_LAB_VIEW_BOX = {
  minX: 0,
  minY: 0,
  width: LOGO_THREE_SVG_VIEWBOX_SIZE,
  height: LOGO_THREE_SVG_VIEWBOX_SIZE,
} as const;

const FACE_STROKE_WIDTH = 0.14;
const AXIS_GUIDE_LENGTH = 0.65;
const AXIS_GUIDE_LABEL_DISTANCE = 11;
const AXIS_GUIDE_COLORS = {
  x: "#ef4444",
  y: "#16a34a",
  z: "#2563eb",
} as const;
const BACKGROUND_COLOR = "#fcfbf7";
const CUBE_FACE_ID = "transform-lab-face";
const ORIGIN_MARKER_LABEL_OFFSET = {
  x: -12,
  y: 16,
} as const;

const SINGLE_CUBE_FACE_DEFINITIONS = [
  {
    color: getTailwindColorHex(DEFAULT_FACE_COLORS.right),
    colorKey: "right",
    key: "positive-x",
    origin: { x: 1, y: 0, z: 0 },
    u: { x: 0, y: 0, z: 1 },
    v: { x: 0, y: 1, z: 0 },
  },
  {
    color: getTailwindColorHex(DEFAULT_FACE_COLORS.right),
    colorKey: "right",
    key: "negative-x",
    origin: { x: 0, y: 0, z: 1 },
    u: { x: 0, y: 0, z: -1 },
    v: { x: 0, y: 1, z: 0 },
  },
  {
    color: getTailwindColorHex(DEFAULT_FACE_COLORS.top),
    colorKey: "top",
    key: "positive-y",
    origin: { x: 0, y: 1, z: 1 },
    u: { x: 1, y: 0, z: 0 },
    v: { x: 0, y: 0, z: -1 },
  },
  {
    color: getTailwindColorHex(DEFAULT_FACE_COLORS.top),
    colorKey: "top",
    key: "negative-y",
    origin: { x: 0, y: 0, z: 0 },
    u: { x: 1, y: 0, z: 0 },
    v: { x: 0, y: 0, z: 1 },
  },
  {
    color: getTailwindColorHex(DEFAULT_FACE_COLORS.left),
    colorKey: "left",
    key: "positive-z",
    origin: { x: 0, y: 0, z: 1 },
    u: { x: 1, y: 0, z: 0 },
    v: { x: 0, y: 1, z: 0 },
  },
  {
    color: getTailwindColorHex(DEFAULT_FACE_COLORS.left),
    colorKey: "left",
    key: "negative-z",
    origin: { x: 1, y: 0, z: 0 },
    u: { x: -1, y: 0, z: 0 },
    v: { x: 0, y: 1, z: 0 },
  },
] as const satisfies readonly CubeFaceDefinition[];

function escapeSvgAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatNumber(value: number): string {
  return value.toFixed(6);
}

function createTransformString(
  u: LogoProjectedPoint,
  v: LogoProjectedPoint,
  origin: LogoProjectedPoint,
): string {
  return `matrix(${formatNumber(u.x)} ${formatNumber(u.y)} ${formatNumber(v.x)} ${formatNumber(v.y)} ${formatNumber(origin.x)} ${formatNumber(origin.y)})`;
}

function addWorldPoints(
  left: LogoWorldPoint,
  right: LogoWorldPoint,
): LogoWorldPoint {
  return {
    x: left.x + right.x,
    y: left.y + right.y,
    z: left.z + right.z,
  };
}

function subtractUnitCubeCenter(point: LogoWorldPoint): LogoWorldPoint {
  return {
    x: point.x - 0.5,
    y: point.y - 0.5,
    z: point.z - 0.5,
  };
}

function scaleWorldPoint(
  point: LogoWorldPoint,
  factor: number,
): LogoWorldPoint {
  return {
    x: point.x * factor,
    y: point.y * factor,
    z: point.z * factor,
  };
}

function dotWorldPoints(left: LogoWorldPoint, right: LogoWorldPoint): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function getAxisLabelPosition(
  start: LogoProjectedPoint,
  end: LogoProjectedPoint,
): LogoProjectedPoint {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const length = Math.hypot(deltaX, deltaY) || 1;

  return {
    x: end.x + (deltaX / length) * AXIS_GUIDE_LABEL_DISTANCE,
    y: end.y + (deltaY / length) * AXIS_GUIDE_LABEL_DISTANCE,
  };
}

function createAxisGuideLines(args: {
  elevationDegrees: number;
  rotationDegrees: number;
}): AxisGuideLine[] {
  const origin = subtractUnitCubeCenter({ x: 0, y: 0, z: 0 });
  const xEnd = subtractUnitCubeCenter({ x: AXIS_GUIDE_LENGTH, y: 0, z: 0 });
  const yEnd = subtractUnitCubeCenter({ x: 0, y: AXIS_GUIDE_LENGTH, z: 0 });
  const zEnd = subtractUnitCubeCenter({ x: 0, y: 0, z: AXIS_GUIDE_LENGTH });
  const projector = createLogoProjector({
    elevationDegrees: args.elevationDegrees,
    rotationDegrees: args.rotationDegrees,
    scenePoints: [origin, xEnd, yEnd, zEnd],
    viewBoxSize: TRANSFORM_LAB_VIEW_BOX.width,
  });
  const projectedOrigin = projector.projectRotatedPoint(
    projector.rotateWorldPoint(origin),
  );

  return [
    {
      color: AXIS_GUIDE_COLORS.x,
      end: projector.projectRotatedPoint(projector.rotateWorldPoint(xEnd)),
      key: "x" as const,
      label: "X",
    },
    {
      color: AXIS_GUIDE_COLORS.y,
      end: projector.projectRotatedPoint(projector.rotateWorldPoint(yEnd)),
      key: "y" as const,
      label: "Y",
    },
    {
      color: AXIS_GUIDE_COLORS.z,
      end: projector.projectRotatedPoint(projector.rotateWorldPoint(zEnd)),
      key: "z" as const,
      label: "Z",
    },
  ].map((line) => ({
    color: line.color,
    end: line.end,
    key: line.key,
    label: line.label,
    labelPosition: getAxisLabelPosition(projectedOrigin, line.end),
    start: projectedOrigin,
  }));
}

function createFaceCorners(
  face: CubeFaceDefinition,
): readonly LogoWorldPoint[] {
  const origin = subtractUnitCubeCenter(face.origin);
  const uPoint = subtractUnitCubeCenter(addWorldPoints(face.origin, face.u));
  const uvPoint = subtractUnitCubeCenter(
    addWorldPoints(addWorldPoints(face.origin, face.u), face.v),
  );
  const vPoint = subtractUnitCubeCenter(addWorldPoints(face.origin, face.v));

  return [origin, uPoint, uvPoint, vPoint] as const;
}

function createTransformLabFaces(args: {
  elevationDegrees: number;
  rotationDegrees: number;
}): TransformLabFace[] {
  const faceCorners = SINGLE_CUBE_FACE_DEFINITIONS.map(createFaceCorners);
  const projector = createLogoProjector({
    elevationDegrees: args.elevationDegrees,
    rotationDegrees: args.rotationDegrees,
    scenePoints: faceCorners.flat(),
    viewBoxSize: TRANSFORM_LAB_VIEW_BOX.width,
  });

  return SINGLE_CUBE_FACE_DEFINITIONS.map((face, index) => {
    const corners = faceCorners[index];
    const rotatedCorners = corners.map(projector.rotateWorldPoint);
    const projectedCorners = rotatedCorners.map(projector.projectRotatedPoint);
    const projectedOrigin = projectedCorners[0];
    const projectedUPoint = projectedCorners[1];
    const projectedVPoint = projectedCorners[3];
    const centeredFacePoint = subtractUnitCubeCenter(
      addWorldPoints(
        addWorldPoints(face.origin, scaleWorldPoint(face.u, 0.5)),
        scaleWorldPoint(face.v, 0.5),
      ),
    );
    const rotatedCenter = projector.rotateWorldPoint(centeredFacePoint);

    return {
      color: face.color,
      colorKey: face.colorKey,
      corners: projectedCorners,
      depth: dotWorldPoints(rotatedCenter, projector.cameraDirection),
      key: face.key,
      stroke: face.color,
      strokeWidth: FACE_STROKE_WIDTH,
      transform: createTransformString(
        {
          x: projectedUPoint.x - projectedOrigin.x,
          y: projectedUPoint.y - projectedOrigin.y,
        },
        {
          x: projectedVPoint.x - projectedOrigin.x,
          y: projectedVPoint.y - projectedOrigin.y,
        },
        projectedOrigin,
      ),
    };
  }).sort((left, right) => left.depth - right.depth);
}

function serializeAxisGuideLines(lines: readonly AxisGuideLine[]): string {
  const origin = lines[0]?.start ?? { x: 0, y: 0 };
  const axisLines = lines
    .map((line) => {
      return [
        `<line x1="${formatNumber(line.start.x)}" y1="${formatNumber(line.start.y)}" x2="${formatNumber(line.end.x)}" y2="${formatNumber(line.end.y)}" stroke="${escapeSvgAttribute(line.color)}" stroke-linecap="round" stroke-width="2.25" marker-end="url(#transform-lab-axis-arrow-${line.key})"/>`,
        `<text x="${formatNumber(line.labelPosition.x)}" y="${formatNumber(line.labelPosition.y)}" dominant-baseline="middle" fill="${escapeSvgAttribute(line.color)}" font-size="11" font-weight="700" text-anchor="middle">${line.label}</text>`,
      ].join("");
    })
    .join("");

  return `<g><circle cx="${formatNumber(origin.x)}" cy="${formatNumber(origin.y)}" r="2.75" fill="#111111"/><text x="${formatNumber(origin.x + ORIGIN_MARKER_LABEL_OFFSET.x)}" y="${formatNumber(origin.y + ORIGIN_MARKER_LABEL_OFFSET.y)}" fill="#111111" font-size="10" font-weight="600">0,0,0</text>${axisLines}</g>`;
}

function serializeFaceUses(faces: readonly TransformLabFace[]): string {
  return faces
    .map((face) => {
      return `<use href="#${CUBE_FACE_ID}" fill="${escapeSvgAttribute(face.color)}" stroke="${escapeSvgAttribute(face.stroke)}" stroke-width="${formatNumber(face.strokeWidth)}" transform="${escapeSvgAttribute(face.transform)}"/>`;
    })
    .join("");
}

export function createTransformLabScene({
  elevationDegrees = STATIC_LOGO_ELEVATION_DEGREES,
  rotationDegrees = STATIC_LOGO_ROTATION_DEGREES,
}: {
  elevationDegrees?: number;
  rotationDegrees?: number;
} = {}): TransformLabScene {
  const faces = createTransformLabFaces({
    elevationDegrees,
    rotationDegrees,
  });
  const axisGuideLines = createAxisGuideLines({
    elevationDegrees,
    rotationDegrees,
  });
  const svgMarkup = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TRANSFORM_LAB_VIEW_BOX.width} ${TRANSFORM_LAB_VIEW_BOX.height}" width="${TRANSFORM_LAB_VIEW_BOX.width}" height="${TRANSFORM_LAB_VIEW_BOX.height}">`,
    `<defs><rect id="${CUBE_FACE_ID}" x="0" y="0" width="1" height="1"/><marker id="transform-lab-axis-arrow-x" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" viewBox="0 0 6 6"><path d="M 0 0 L 6 3 L 0 6 z" fill="${AXIS_GUIDE_COLORS.x}"/></marker><marker id="transform-lab-axis-arrow-y" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" viewBox="0 0 6 6"><path d="M 0 0 L 6 3 L 0 6 z" fill="${AXIS_GUIDE_COLORS.y}"/></marker><marker id="transform-lab-axis-arrow-z" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" viewBox="0 0 6 6"><path d="M 0 0 L 6 3 L 0 6 z" fill="${AXIS_GUIDE_COLORS.z}"/></marker></defs>`,
    `<rect x="0" y="0" width="${TRANSFORM_LAB_VIEW_BOX.width}" height="${TRANSFORM_LAB_VIEW_BOX.height}" fill="${BACKGROUND_COLOR}"/>`,
    serializeFaceUses(faces),
    serializeAxisGuideLines(axisGuideLines),
    `</svg>`,
  ].join("\n");

  return {
    axisGuideLines,
    faces,
    svgMarkup,
  };
}

export function createTransformLabSvgMarkup(args?: {
  elevationDegrees?: number;
  rotationDegrees?: number;
}): string {
  return createTransformLabScene(args).svgMarkup;
}
