import { LOGO_THREE_SVG_VIEWBOX_SIZE } from "@/components/logoStaticSvgContract";
import {
  DEFAULT_FACE_COLORS,
  getTailwindColorHex,
  type FaceColorKey,
} from "@/components/logoTailwindColors";
import {
  type LogoProjectedPoint,
  type LogoWorldPoint,
} from "@/components/logoThreeSvgRenderer";
import { stripIndent } from "../../shared/stripIndent";

type CubeFaceDefinition = {
  color: string;
  colorKey: FaceColorKey;
  rectId: string;
  key: string;
  corners: [LogoWorldPoint, LogoWorldPoint, LogoWorldPoint, LogoWorldPoint];
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
  rectId: string;
  key: string;
  // stroke: string;
  // strokeWidth: number;
  transform: string;
};

export type TransformLabScene = {
  axisGuideLines: readonly AxisGuideLine[];
  faces: readonly TransformLabFace[];
  svgMarkup: string;
};

type TransformLabFacesResult = {
  faces: readonly TransformLabFace[];
  renderTransform: string;
};

export const TRANSFORM_LAB_VIEW_BOX = {
  minX: 0,
  minY: 0,
  width: LOGO_THREE_SVG_VIEWBOX_SIZE,
  height: LOGO_THREE_SVG_VIEWBOX_SIZE,
} as const;

const FACE_STROKE_WIDTH = 0.14;
const AXIS_GUIDE_LENGTH = 1.25;
const AXIS_GUIDE_LABEL_DISTANCE = 11;
const CAMERA_FRUSTUM_PADDING = 1.12;
const ORBIT_RIGHT_AXIS: LogoWorldPoint = {
  x: 1,
  y: 0,
  z: -1,
};
const AXIS_GUIDE_COLORS = {
  x: "#ef4444",
  y: "#16a34a",
  z: "#2563eb",
} as const;
const BACKGROUND_COLOR = "#fcfbf7";
const CUBE_FACE_IDS = {
  posZFront: "posZ-front",
  negZBack: "negZ-back",
  posXRight: "posX-right",
  negXLeft: "negX-left",
  posYDown: "posY-down",
  negYTop: "negY-top",
} as const;
// Face identifiers are intentionally semantic, not numeric.
// These names match camera-facing intent so the generated SVG can be read without
// mapping math formula output to human-readable geometry labels.
const FACE_OUTPUT_ORDER = [
  CUBE_FACE_IDS.posZFront,
  CUBE_FACE_IDS.negXLeft,
  CUBE_FACE_IDS.negYTop,
  CUBE_FACE_IDS.posYDown,
  CUBE_FACE_IDS.negZBack,
  CUBE_FACE_IDS.posXRight,
] as const;
const FACE_DEFINITIONS_GROUP_ID = "transform-lab-face-definitions";
const FACE_RENDER_GROUP_ID = "transform-lab-faces";
const ORIGIN_MARKER_LABEL_OFFSET = {
  x: -12,
  y: 16,
} as const;

type FrontToUnitAffineTransform = {
  a: number;
  b: number;
  c: number;
  d: number;
  originX: number;
  originY: number;
};

const SINGLE_CUBE_FACE_DEFINITIONS = [
  // Color intent:
  // - posZ-front: primary
  // - X-axis faces (negX-left, posX-right): secondary
  // - Y-axis faces (negY-top, posY-down): top/background
  // - negZ-back: secondary
  {
    color: getTailwindColorHex(DEFAULT_FACE_COLORS.right),
    rectId: CUBE_FACE_IDS.posZFront,
    colorKey: "right",
    key: "posZ-front",
    corners: [
      { x: 0, y: 0, z: 1 },
      { x: 1, y: 0, z: 1 },
      { x: 1, y: 1, z: 1 },
      { x: 0, y: 1, z: 1 },
    ],
  },
  {
    color: getTailwindColorHex(DEFAULT_FACE_COLORS.left),
    rectId: CUBE_FACE_IDS.negXLeft,
    colorKey: "left",
    key: "negX-left",
    corners: [
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 1, z: 1 },
    ],
  },
  {
    color: getTailwindColorHex(DEFAULT_FACE_COLORS.top),
    rectId: CUBE_FACE_IDS.negYTop,
    colorKey: "top",
    key: "negY-top",
    corners: [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 1, y: 0, z: 1 },
      { x: 0, y: 0, z: 1 },
    ],
  },
  {
    color: getTailwindColorHex(DEFAULT_FACE_COLORS.left),
    rectId: CUBE_FACE_IDS.posXRight,
    colorKey: "left",
    key: "posX-right",
    corners: [
      { x: 1, y: 0, z: 0 },
      { x: 1, y: 0, z: 1 },
      { x: 1, y: 1, z: 1 },
      { x: 1, y: 1, z: 0 },
    ],
  },
  {
    color: getTailwindColorHex(DEFAULT_FACE_COLORS.top),
    rectId: CUBE_FACE_IDS.posYDown,
    colorKey: "top",
    key: "posY-down",
    corners: [
      { x: 0, y: 1, z: 1 },
      { x: 1, y: 1, z: 1 },
      { x: 1, y: 1, z: 0 },
      { x: 0, y: 1, z: 0 },
    ],
  },
  {
    color: getTailwindColorHex(DEFAULT_FACE_COLORS.left),
    rectId: CUBE_FACE_IDS.negZBack,
    colorKey: "left",
    key: "negZ-back",
    corners: [
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 1, y: 1, z: 0 },
    ],
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
  // Keep enough precision for projected geometry, but strip static SVG noise
  // like 1.000000 or -0.000000 from the serialized matrices.
  if (Math.abs(value) < 0.0000005) {
    return "0";
  }

  return value.toFixed(6).replace(/\.?0+$/, "");
}

function normalizeVector(vector: LogoWorldPoint): LogoWorldPoint {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  if (length === 0) {
    throw new Error("Cannot normalize zero-length vector.");
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
}

function crossVectors(
  left: LogoWorldPoint,
  right: LogoWorldPoint,
): LogoWorldPoint {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

function dotVectors(left: LogoWorldPoint, right: LogoWorldPoint): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function rotateVectorY(
  vector: LogoWorldPoint,
  radians: number,
): LogoWorldPoint {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: vector.x * cosine + vector.z * sine,
    y: vector.y,
    z: -vector.x * sine + vector.z * cosine,
  };
}

function projectPoint(
  point: LogoWorldPoint,
  right: LogoWorldPoint,
  up: LogoWorldPoint,
  frustumHalfHeight: number,
  unitScale: number,
): LogoProjectedPoint {
  return {
    x:
      ((dotVectors(point, right) + frustumHalfHeight) /
        (frustumHalfHeight * 2)) *
      unitScale,
    y:
      ((frustumHalfHeight - dotVectors(point, up)) / (frustumHalfHeight * 2)) *
      unitScale,
  };
}

function getCameraBasis(elevationDegrees: number): {
  cameraDirection: LogoWorldPoint;
  right: LogoWorldPoint;
  up: LogoWorldPoint;
} {
  const elevationRadians = (elevationDegrees * Math.PI) / 180;
  const horizontalComponent = Math.cos(elevationRadians);
  const verticalComponent = Math.sin(elevationRadians);
  const diagonalComponent = horizontalComponent / Math.sqrt(2);
  const cameraDirection = normalizeVector({
    x: diagonalComponent,
    y: verticalComponent,
    z: diagonalComponent,
  });
  const forward = {
    x: -cameraDirection.x,
    y: -cameraDirection.y,
    z: -cameraDirection.z,
  };
  const up = normalizeVector(crossVectors(ORBIT_RIGHT_AXIS, forward));

  return {
    cameraDirection,
    right: normalizeVector(ORBIT_RIGHT_AXIS),
    up,
  };
}

function createLabLogoProjector({
  elevationDegrees,
  rotationDegrees,
  scenePoints,
  unitScale,
}: {
  elevationDegrees: number;
  rotationDegrees: number;
  scenePoints: readonly LogoWorldPoint[];
  unitScale: number;
}): {
  cameraDirection: LogoWorldPoint;
  projectRotatedPoint: (point: LogoWorldPoint) => LogoProjectedPoint;
  rotateWorldPoint: (point: LogoWorldPoint) => LogoWorldPoint;
} {
  const { cameraDirection, right, up } = getCameraBasis(elevationDegrees);
  const rotationRadians = (rotationDegrees * Math.PI) / 180;
  const rotateWorldPoint = (point: LogoWorldPoint) =>
    rotateVectorY(point, rotationRadians);
  const radius = scenePoints.reduce((maxRadius, point) => {
    const rotatedPoint = rotateWorldPoint(point);
    return Math.max(
      maxRadius,
      Math.hypot(rotatedPoint.x, rotatedPoint.y, rotatedPoint.z),
    );
  }, 0);
  const frustumHalfHeight =
    radius > 0 ? radius * CAMERA_FRUSTUM_PADDING : CAMERA_FRUSTUM_PADDING;

  return {
    cameraDirection,
    projectRotatedPoint: (point) =>
      projectPoint(point, right, up, frustumHalfHeight, unitScale),
    rotateWorldPoint,
  };
}

function orientToSvgPoint(
  point: LogoProjectedPoint,
  viewportHeight: number,
): LogoProjectedPoint {
  return {
    x: point.x,
    y: viewportHeight - point.y,
  };
}

/**
 * Computes an affine transform that maps the projected front (posZ) face corners into
 * unit-square coordinates.
 *
 * This keeps the front face as the canonical basis (0,0) -> (1,1) without any
 * special-casing downstream callers.
 */
function createFrontFaceAlignmentTransform(
  frontCorners: readonly LogoProjectedPoint[],
): FrontToUnitAffineTransform {
  const origin = frontCorners[0];
  const uVector = {
    x: frontCorners[1].x - origin.x,
    y: frontCorners[1].y - origin.y,
  };
  const vVector = {
    x: frontCorners[3].x - origin.x,
    y: frontCorners[3].y - origin.y,
  };
  const determinant = uVector.x * vVector.y - uVector.y * vVector.x;
  const inverseDeterminant = 1 / determinant;

  return {
    a: vVector.y * inverseDeterminant,
    b: -uVector.y * inverseDeterminant,
    c: -vVector.x * inverseDeterminant,
    d: uVector.x * inverseDeterminant,
    originX: origin.x,
    originY: origin.y,
  };
}

function applyFrontAlignmentTransform(
  transform: FrontToUnitAffineTransform,
  point: LogoProjectedPoint,
): LogoProjectedPoint {
  const relativeX = point.x - transform.originX;
  const relativeY = point.y - transform.originY;

  return {
    x: transform.a * relativeX + transform.b * relativeY,
    y: transform.c * relativeX + transform.d * relativeY,
  };
}

function createTransformString(
  u: LogoProjectedPoint,
  v: LogoProjectedPoint,
  origin: LogoProjectedPoint,
): string {
  return `matrix(${formatNumber(u.x)} ${formatNumber(u.y)} ${formatNumber(v.x)} ${formatNumber(v.y)} ${formatNumber(origin.x)} ${formatNumber(origin.y)})`;
}

function createRectTransformFromCorners(
  corners: readonly LogoProjectedPoint[],
): string {
  const origin = corners[0];
  const uPoint = corners[1];
  const vPoint = corners[3];

  return createTransformString(
    {
      x: uPoint.x - origin.x,
      y: uPoint.y - origin.y,
    },
    {
      x: vPoint.x - origin.x,
      y: vPoint.y - origin.y,
    },
    origin,
  );
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
  const origin = { x: 0, y: 0, z: 0 };
  const xEnd = { x: AXIS_GUIDE_LENGTH, y: 0, z: 0 };
  const yEnd = { x: 0, y: AXIS_GUIDE_LENGTH, z: 0 };
  const zEnd = { x: 0, y: 0, z: AXIS_GUIDE_LENGTH };
  const projector = createLabLogoProjector({
    elevationDegrees: args.elevationDegrees,
    rotationDegrees: args.rotationDegrees,
    scenePoints: [origin, xEnd, yEnd, zEnd],
    unitScale: TRANSFORM_LAB_VIEW_BOX.width,
  });
  const projectToViewBox = (point: LogoWorldPoint): LogoProjectedPoint =>
    orientToSvgPoint(
      projector.projectRotatedPoint(projector.rotateWorldPoint(point)),
      TRANSFORM_LAB_VIEW_BOX.height,
    );
  const projectedOrigin = projectToViewBox(origin);

  return [
    {
      color: AXIS_GUIDE_COLORS.x,
      end: projectToViewBox(xEnd),
      key: "x" as const,
      label: "X",
    },
    {
      color: AXIS_GUIDE_COLORS.y,
      end: projectToViewBox(yEnd),
      key: "y" as const,
      label: "Y",
    },
    {
      color: AXIS_GUIDE_COLORS.z,
      end: projectToViewBox(zEnd),
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

function calculateFaceCenter(
  points: readonly LogoWorldPoint[],
): LogoWorldPoint {
  const [a, b, c, d] = points;
  return {
    x: (a.x + b.x + c.x + d.x) / 4,
    y: (a.y + b.y + c.y + d.y) / 4,
    z: (a.z + b.z + c.z + d.z) / 4,
  };
}

function createTransformLabFaces(args: {
  elevationDegrees: number;
  rotationDegrees: number;
}): TransformLabFacesResult {
  const faceCorners = SINGLE_CUBE_FACE_DEFINITIONS.map((face) => face.corners);
  const projector = createLabLogoProjector({
    elevationDegrees: args.elevationDegrees,
    rotationDegrees: args.rotationDegrees,
    scenePoints: faceCorners.flat(),
    unitScale: TRANSFORM_LAB_VIEW_BOX.width,
  });
  const frontFaceDefinition = SINGLE_CUBE_FACE_DEFINITIONS.find(
    (face) => face.rectId === CUBE_FACE_IDS.posZFront,
  );
  if (!frontFaceDefinition) {
    throw new Error("Front face definition missing. Unable to build faces.");
  }
  const projectedFrontFaceCorners = frontFaceDefinition.corners.map((point) =>
    orientToSvgPoint(
      projector.projectRotatedPoint(projector.rotateWorldPoint(point)),
      TRANSFORM_LAB_VIEW_BOX.height,
    ),
  );
  const frontAlignmentTransform = createFrontFaceAlignmentTransform(
    projectedFrontFaceCorners,
  );
  const renderTransform = createRectTransformFromCorners(
    projectedFrontFaceCorners,
  );

  // Each face definition is expressed in front-face local coordinates. The
  // render group later reapplies the projected front-face basis to the whole set.
  const projectToFrontSpace = (point: LogoProjectedPoint) =>
    applyFrontAlignmentTransform(frontAlignmentTransform, point);

  const projectedFaces = SINGLE_CUBE_FACE_DEFINITIONS.map((face, index) => {
    const corners = faceCorners[index];
    const rotatedCorners = corners.map(projector.rotateWorldPoint);
    const projectedCorners = rotatedCorners.map((point) =>
      orientToSvgPoint(
        projector.projectRotatedPoint(point),
        TRANSFORM_LAB_VIEW_BOX.height,
      ),
    );
    const localCorners = projectedCorners.map(projectToFrontSpace);
    const centeredFacePoint = calculateFaceCenter(face.corners);
    const rotatedCenter = projector.rotateWorldPoint(centeredFacePoint);

    return {
      color: face.color,
      rectId: face.rectId,
      colorKey: face.colorKey,
      corners: projectedCorners,
      depth: dotWorldPoints(rotatedCenter, projector.cameraDirection),
      key: face.key,
      stroke: face.color,
      strokeWidth: FACE_STROKE_WIDTH,
      transform: createRectTransformFromCorners(localCorners),
    };
  });

  return {
    faces: projectedFaces.sort((left, right) => left.depth - right.depth),
    renderTransform,
  };
}

function getFacesInDefinitionOrder(
  faces: readonly TransformLabFace[],
): TransformLabFace[] {
  const faceById = new Map(faces.map((face) => [face.rectId, face]));
  return FACE_OUTPUT_ORDER.map((rectId) => faceById.get(rectId)).filter(
    (face): face is TransformLabFace => face != null,
  );
}

function serializeAxisGuideLines(lines: readonly AxisGuideLine[]): string {
  const origin = lines[0]?.start ?? { x: 0, y: 0 };
  const axisLines = lines
    .map((line) => {
      return stripIndent`
        <line
          x1="${formatNumber(line.start.x)}"
          y1="${formatNumber(line.start.y)}"
          x2="${formatNumber(line.end.x)}"
          y2="${formatNumber(line.end.y)}"
          stroke="${escapeSvgAttribute(line.color)}"
          stroke-linecap="round"
          stroke-width="2.25"
          marker-end="url(#transform-lab-axis-arrow-${line.key})"
        />

        <text
          x="${formatNumber(line.labelPosition.x)}"
          y="${formatNumber(line.labelPosition.y)}"
          dominant-baseline="middle"
          fill="${escapeSvgAttribute(line.color)}"
          font-size="11"
          font-weight="700"
          text-anchor="middle">${line.label}</text>`;
    })
    .join("\n");

  return stripIndent`
    <!-- Axis guide lines -->
    <g>
      <circle cx="${formatNumber(origin.x)}" cy="${formatNumber(origin.y)}" r="2.75" fill="#111111"/>
      <text
        x="${formatNumber(origin.x + ORIGIN_MARKER_LABEL_OFFSET.x)}"
        y="${formatNumber(origin.y + ORIGIN_MARKER_LABEL_OFFSET.y)}"
        fill="#111111"
        font-size="10"
        font-weight="600">0,0,0</text>
      ${axisLines}
    </g>`;
}

function serializeFaceUses(
  faces: readonly TransformLabFace[],
  renderTransform: string,
): string {
  return stripIndent`
    <g id="${FACE_RENDER_GROUP_ID}">
      <g transform="${escapeSvgAttribute(renderTransform)}">
        ${faces
          .map((face) => `<use href="#${escapeSvgAttribute(face.rectId)}" />`)
          .join("\n")}
      </g>
    </g>`;
}

function serializeFaceDefinitions(faces: readonly TransformLabFace[]): string {
  return faces
    .map(
      (face) => stripIndent`
        <rect
          id="${face.rectId}"
          x="0"
          y="0"
          width="1"
          height="1"
          fill="${escapeSvgAttribute(face.color)}"
          transform="${escapeSvgAttribute(face.transform)}" />`,
    )
    .join("\n");
}

function serializeFaceDefinitionsGroup(
  faces: readonly TransformLabFace[],
): string {
  return stripIndent`
    <g id="${FACE_DEFINITIONS_GROUP_ID}">
      ${serializeFaceDefinitions(faces)}
    </g>`;
}

export function createTransformLabScene({
  elevationDegrees = 0,
  rotationDegrees = 0,
}: {
  elevationDegrees?: number;
  rotationDegrees?: number;
} = {}): TransformLabScene {
  const { faces, renderTransform } = createTransformLabFaces({
    elevationDegrees,
    rotationDegrees,
  });
  const definitionFaces = getFacesInDefinitionOrder(faces);
  const axisGuideLines = createAxisGuideLines({
    elevationDegrees,
    rotationDegrees,
  });
  const svgMarkup = stripIndent`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TRANSFORM_LAB_VIEW_BOX.width} ${TRANSFORM_LAB_VIEW_BOX.height}" width="${TRANSFORM_LAB_VIEW_BOX.width}" height="${TRANSFORM_LAB_VIEW_BOX.height}">
      <defs>
        ${serializeFaceDefinitionsGroup(definitionFaces)}

        <marker id="transform-lab-axis-arrow-x" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" viewBox="0 0 6 6">
          <path d="M 0 0 L 6 3 L 0 6 z" fill="${AXIS_GUIDE_COLORS.x}"/>
        </marker>
        
        <marker id="transform-lab-axis-arrow-y" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" viewBox="0 0 6 6">
          <path d="M 0 0 L 6 3 L 0 6 z" fill="${AXIS_GUIDE_COLORS.y}"/>
        </marker>
        
        <marker id="transform-lab-axis-arrow-z" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" viewBox="0 0 6 6">
          <path d="M 0 0 L 6 3 L 0 6 z" fill="${AXIS_GUIDE_COLORS.z}"/>
        </marker>

      </defs>

      <!-- Background -->
      <rect x="0" y="0" width="${TRANSFORM_LAB_VIEW_BOX.width}" height="${TRANSFORM_LAB_VIEW_BOX.height}" fill="${BACKGROUND_COLOR}"/>

      ${serializeFaceUses(faces, renderTransform)}

      ${serializeAxisGuideLines(axisGuideLines)}

      </svg>
 `;

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
