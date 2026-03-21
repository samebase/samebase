import { LOGO_THREE_SVG_VIEWBOX_SIZE } from "@/components/logoStaticSvgContract";
import {
  DEFAULT_FACE_COLORS,
  getTailwindColorHex,
  type FaceColorKey,
} from "@/components/logoTailwindColors";
import {
  createLogoProjector,
  type LogoProjectedPoint,
  type LogoWorldPoint,
} from "@/components/logoThreeSvgRenderer";
import { stripIndent } from "../../shared/stripIndent";
import { HALF_GRID, type VoxelCoordinate } from "./logoVoxelState";

type CubeFaceDefinition = {
  color: string;
  colorKey: FaceColorKey;
  normal: LogoWorldPoint;
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

type TransformLabProjectionMode = "study" | "three";

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

export const TRANSFORM_LAB_VIEW_BOX = {
  minX: 0,
  minY: 0,
  width: LOGO_THREE_SVG_VIEWBOX_SIZE,
  height: LOGO_THREE_SVG_VIEWBOX_SIZE,
} as const;

const FACE_STROKE_WIDTH = 0.14;
const AXIS_GUIDE_LENGTH = 2.25;
const AXIS_GUIDE_LABEL_DISTANCE = 11;
const CAMERA_FRUSTUM_PADDING = 1.12;
const CAMERA_RIGHT_AXIS: LogoWorldPoint = {
  x: 1,
  y: 0,
  z: 0,
};
const AXIS_GUIDE_COLORS = {
  x: "#ef4444",
  y: "#16a34a",
  z: "#2563eb",
} as const;
const BACKGROUND_COLOR = "#fcfbf7";
export const TRANSFORM_LAB_VOXEL_STATE = "ox_oo-xo_ox";
export const TRANSFORM_LAB_VOXEL_COORDINATES = [
  [1, 0, 0],
  [0, 0, 1],
  [1, 1, 1],
] as const satisfies readonly VoxelCoordinate[];
const CUBE_FACE_IDS = {
  posZFront: "posZ-front",
  negZBack: "negZ-back",
  posXRight: "posX-right",
  negXLeft: "negX-left",
  posYDown: "posY-down",
  negYTop: "negY-top",
} as const;
const FACE_DEFINITIONS_GROUP_ID = "transform-lab-face-definitions";
const FACE_RENDER_GROUP_ID = "transform-lab-faces";
const FACE_RECT_DEFINITION_ID = "unit";
const ORIGIN_MARKER_LABEL_OFFSET = {
  x: -12,
  y: 16,
} as const;

const SINGLE_CUBE_FACE_DEFINITIONS = [
  // These are local unit-cube face templates. Multi-cube scenes translate the
  // same faces through integer grid coordinates before projection.
  // Color intent:
  // - posZ-front: primary
  // - X-axis faces (negX-left, posX-right): secondary
  // - Y-axis faces (negY-top, posY-down): top/background
  // - negZ-back: primary
  {
    color: getTailwindColorHex(DEFAULT_FACE_COLORS.right),
    rectId: CUBE_FACE_IDS.posZFront,
    colorKey: "right",
    key: "posZ-front",
    normal: { x: 0, y: 0, z: 1 },
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
    normal: { x: -1, y: 0, z: 0 },
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
    normal: { x: 0, y: -1, z: 0 },
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
    normal: { x: 1, y: 0, z: 0 },
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
    normal: { x: 0, y: 1, z: 0 },
    corners: [
      { x: 0, y: 1, z: 1 },
      { x: 1, y: 1, z: 1 },
      { x: 1, y: 1, z: 0 },
      { x: 0, y: 1, z: 0 },
    ],
  },
  {
    color: getTailwindColorHex(DEFAULT_FACE_COLORS.right),
    rectId: CUBE_FACE_IDS.negZBack,
    colorKey: "right",
    key: "negZ-back",
    normal: { x: 0, y: 0, z: -1 },
    corners: [
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 1, y: 1, z: 0 },
    ],
  },
] as const satisfies readonly CubeFaceDefinition[];

type TransformLabVoxel = {
  x: number;
  y: number;
  z: number;
};

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

  // Keep rotation=0 as the literal front view. The earlier diagonal X/Z basis
  // baked in an implicit 45deg yaw, which made the cube start already turned.
  const cameraDirection = normalizeVector({
    x: 0,
    y: verticalComponent,
    z: horizontalComponent,
  });
  const forward = {
    x: -cameraDirection.x,
    y: -cameraDirection.y,
    z: -cameraDirection.z,
  };
  const up = normalizeVector(crossVectors(CAMERA_RIGHT_AXIS, forward));

  return {
    cameraDirection,
    right: normalizeVector(CAMERA_RIGHT_AXIS),
    up,
  };
}

function createLabLogoProjector({
  elevationDegrees,
  projectionMode,
  rotationDegrees,
  scenePoints,
  unitScale,
}: {
  elevationDegrees: number;
  projectionMode: TransformLabProjectionMode;
  rotationDegrees: number;
  scenePoints: readonly LogoWorldPoint[];
  unitScale: number;
}): {
  cameraDirection: LogoWorldPoint;
  projectWorldPoint: (point: LogoWorldPoint) => LogoProjectedPoint;
  projectRotatedPoint: (point: LogoWorldPoint) => LogoProjectedPoint;
  rotateWorldPoint: (point: LogoWorldPoint) => LogoWorldPoint;
} {
  if (projectionMode === "three") {
    const projector = createLogoProjector({
      elevationDegrees,
      rotationDegrees,
      scenePoints,
      viewBoxSize: unitScale,
    });

    return {
      cameraDirection: projector.cameraDirection,
      projectWorldPoint: (point) =>
        projector.projectRotatedPoint(projector.rotateWorldPoint(point)),
      projectRotatedPoint: projector.projectRotatedPoint,
      rotateWorldPoint: projector.rotateWorldPoint,
    };
  }

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
    projectWorldPoint: (point) =>
      orientToSvgPoint(
        projectPoint(
          rotateWorldPoint(point),
          right,
          up,
          frustumHalfHeight,
          unitScale,
        ),
        TRANSFORM_LAB_VIEW_BOX.height,
      ),
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

function createVoxelKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function translateWorldPoint(
  point: LogoWorldPoint,
  voxel: TransformLabVoxel,
): LogoWorldPoint {
  return {
    x: point.x + voxel.x,
    y: point.y + voxel.y,
    z: point.z + voxel.z,
  };
}

function normalizeTransformLabVoxels(
  voxelCoordinates: readonly VoxelCoordinate[],
): TransformLabVoxel[] {
  return voxelCoordinates.map(([x, y, z]) => ({
    x,
    y,
    z,
  }));
}

function toThreeWorldPoint(point: LogoWorldPoint): LogoWorldPoint {
  return {
    x: point.x - HALF_GRID,
    y: point.y - HALF_GRID,
    z: point.z - HALF_GRID,
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
  projectionMode: TransformLabProjectionMode;
  rotationDegrees: number;
}): AxisGuideLine[] {
  const origin = { x: 0, y: 0, z: 0 };
  const xEnd = { x: AXIS_GUIDE_LENGTH, y: 0, z: 0 };
  const yEnd = { x: 0, y: AXIS_GUIDE_LENGTH, z: 0 };
  const zEnd = { x: 0, y: 0, z: AXIS_GUIDE_LENGTH };
  const worldOrigin =
    args.projectionMode === "three" ? toThreeWorldPoint(origin) : origin;
  const worldXEnd =
    args.projectionMode === "three" ? toThreeWorldPoint(xEnd) : xEnd;
  const worldYEnd =
    args.projectionMode === "three" ? toThreeWorldPoint(yEnd) : yEnd;
  const worldZEnd =
    args.projectionMode === "three" ? toThreeWorldPoint(zEnd) : zEnd;
  const projector = createLabLogoProjector({
    elevationDegrees: args.elevationDegrees,
    projectionMode: args.projectionMode,
    rotationDegrees: args.rotationDegrees,
    scenePoints: [worldOrigin, worldXEnd, worldYEnd, worldZEnd],
    unitScale: TRANSFORM_LAB_VIEW_BOX.width,
  });
  const projectToViewBox = (point: LogoWorldPoint): LogoProjectedPoint =>
    projector.projectWorldPoint(point);
  const projectedOrigin = projectToViewBox(worldOrigin);

  return [
    {
      color: AXIS_GUIDE_COLORS.x,
      end: projectToViewBox(worldXEnd),
      key: "x" as const,
      label: "X",
    },
    {
      color: AXIS_GUIDE_COLORS.y,
      end: projectToViewBox(worldYEnd),
      key: "y" as const,
      label: "Y",
    },
    {
      color: AXIS_GUIDE_COLORS.z,
      end: projectToViewBox(worldZEnd),
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

function getThreeFaceColor(face: CubeFaceDefinition): {
  color: string;
  colorKey: FaceColorKey;
} {
  if (face.normal.y !== 0) {
    return {
      color: getTailwindColorHex(DEFAULT_FACE_COLORS.top),
      colorKey: "top",
    };
  }

  if (face.normal.x !== 0) {
    return {
      color: getTailwindColorHex(DEFAULT_FACE_COLORS.right),
      colorKey: "right",
    };
  }

  return {
    color: getTailwindColorHex(DEFAULT_FACE_COLORS.left),
    colorKey: "left",
  };
}

function createTransformLabFaces(args: {
  elevationDegrees: number;
  projectionMode: TransformLabProjectionMode;
  rotationDegrees: number;
  voxelCoordinates?: readonly VoxelCoordinate[];
}): TransformLabFace[] {
  const voxels = normalizeTransformLabVoxels(
    args.voxelCoordinates ?? TRANSFORM_LAB_VOXEL_COORDINATES,
  );
  const filledVoxelKeys = new Set(
    voxels.map((voxel) => createVoxelKey(voxel.x, voxel.y, voxel.z)),
  );
  const scenePoints = voxels.flatMap((voxel) =>
    SINGLE_CUBE_FACE_DEFINITIONS.flatMap((face) =>
      face.corners.map((point) => {
        const translatedPoint = translateWorldPoint(point, voxel);
        return args.projectionMode === "three"
          ? toThreeWorldPoint(translatedPoint)
          : translatedPoint;
      }),
    ),
  );
  const projector = createLabLogoProjector({
    elevationDegrees: args.elevationDegrees,
    projectionMode: args.projectionMode,
    rotationDegrees: args.rotationDegrees,
    scenePoints,
    unitScale: TRANSFORM_LAB_VIEW_BOX.width,
  });
  const projectedFaces = voxels.flatMap((voxel) =>
    SINGLE_CUBE_FACE_DEFINITIONS.flatMap((face) => {
      const neighborX = voxel.x + face.normal.x;
      const neighborY = voxel.y + face.normal.y;
      const neighborZ = voxel.z + face.normal.z;

      if (
        filledVoxelKeys.has(createVoxelKey(neighborX, neighborY, neighborZ))
      ) {
        return [];
      }

      const corners = face.corners.map((point) =>
        translateWorldPoint(point, voxel),
      );
      const worldCorners =
        args.projectionMode === "three"
          ? corners.map(toThreeWorldPoint)
          : corners;
      const projectedCorners = worldCorners.map((point) =>
        projector.projectWorldPoint(point),
      );
      const centeredFacePoint = calculateFaceCenter(worldCorners);
      const rotatedCenter = projector.rotateWorldPoint(centeredFacePoint);
      const rectId = `${face.rectId}-${voxel.x}-${voxel.y}-${voxel.z}`;
      const isDebugFrontFace =
        args.projectionMode === "study" &&
        voxel.x === 1 &&
        voxel.y === 0 &&
        voxel.z === 0 &&
        face.key === CUBE_FACE_IDS.posZFront;
      const resolvedFaceColor =
        args.projectionMode === "three"
          ? getThreeFaceColor(face)
          : {
              color: face.color,
              colorKey: face.colorKey,
            };

      return [
        {
          // Temporary debug marker: highlight one known front face so the voxel
          // coordinate mapping stays easy to verify while iterating on the scene.
          color: isDebugFrontFace ? "#ef4444" : resolvedFaceColor.color,
          rectId,
          colorKey: resolvedFaceColor.colorKey,
          corners: projectedCorners,
          depth: dotWorldPoints(rotatedCenter, projector.cameraDirection),
          key: rectId,
          stroke: face.color,
          strokeWidth: FACE_STROKE_WIDTH,
          // Keep each exposed voxel face in direct projected screen space. This
          // stays readable and avoids the unstable basis-switching experiment.
          transform: createRectTransformFromCorners(projectedCorners),
        },
      ];
    }),
  );

  return projectedFaces.sort((left, right) => left.depth - right.depth);
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

function serializeFaceRenderGroup(faces: readonly TransformLabFace[]): string {
  return stripIndent`
    <g id="${FACE_RENDER_GROUP_ID}">
      ${faces
        .map((face) => `<use href="#${escapeSvgAttribute(face.rectId)}" />`)
        .join("\n")}
    </g>`;
}

function serializeFaceDefinitions(faces: readonly TransformLabFace[]): string {
  return faces
    .map(
      (face) => stripIndent`
        <use
          href="#${FACE_RECT_DEFINITION_ID}"
          id="${face.rectId}"
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
      <!-- Reuse one canonical unit rect so face defs only carry color + transform. -->
      <rect id="${FACE_RECT_DEFINITION_ID}" x="0" y="0" width="1" height="1" />
      ${serializeFaceDefinitions(faces)}
    </g>`;
}

export function createTransformLabScene({
  elevationDegrees = 0,
  rotationDegrees = 0,
  includeAxes = true,
  includeBackground = true,
  backgroundColor = BACKGROUND_COLOR,
  projectionMode = "study",
  voxelCoordinates,
}: {
  elevationDegrees?: number;
  rotationDegrees?: number;
  includeAxes?: boolean;
  includeBackground?: boolean;
  backgroundColor?: string;
  projectionMode?: TransformLabProjectionMode;
  voxelCoordinates?: readonly VoxelCoordinate[];
} = {}): TransformLabScene {
  const faces = createTransformLabFaces({
    elevationDegrees,
    projectionMode,
    rotationDegrees,
    voxelCoordinates,
  });
  const definitionFaces = faces;
  // Axes are a study aid only. The final exported cube SVG can omit them while
  // reusing the exact same face geometry.
  const axisGuideLines = includeAxes
    ? createAxisGuideLines({
        elevationDegrees,
        projectionMode,
        rotationDegrees,
      })
    : [];
  const svgMarkup = stripIndent`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TRANSFORM_LAB_VIEW_BOX.width} ${TRANSFORM_LAB_VIEW_BOX.height}" width="${TRANSFORM_LAB_VIEW_BOX.width}" height="${TRANSFORM_LAB_VIEW_BOX.height}">
      <defs>
        ${serializeFaceDefinitionsGroup(definitionFaces)}
        ${serializeFaceRenderGroup(faces)}

        ${
          includeAxes
            ? stripIndent`
              <marker id="transform-lab-axis-arrow-x" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" viewBox="0 0 6 6">
                <path d="M 0 0 L 6 3 L 0 6 z" fill="${AXIS_GUIDE_COLORS.x}"/>
              </marker>

              <marker id="transform-lab-axis-arrow-y" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" viewBox="0 0 6 6">
                <path d="M 0 0 L 6 3 L 0 6 z" fill="${AXIS_GUIDE_COLORS.y}"/>
              </marker>

              <marker id="transform-lab-axis-arrow-z" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" viewBox="0 0 6 6">
                <path d="M 0 0 L 6 3 L 0 6 z" fill="${AXIS_GUIDE_COLORS.z}"/>
              </marker>`
            : ""
        }
      </defs>

      ${
        includeBackground
          ? stripIndent`
            <!-- Background -->
            <rect x="0" y="0" width="${TRANSFORM_LAB_VIEW_BOX.width}" height="${TRANSFORM_LAB_VIEW_BOX.height}" fill="${escapeSvgAttribute(backgroundColor)}"/>`
          : ""
      }

      <!-- Draw the reusable face stack after defs so the same ordered cube can be reused later. -->
      <use href="#${FACE_RENDER_GROUP_ID}" />

      ${includeAxes ? serializeAxisGuideLines(axisGuideLines) : ""}

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
  includeAxes?: boolean;
  includeBackground?: boolean;
  backgroundColor?: string;
  projectionMode?: TransformLabProjectionMode;
  voxelCoordinates?: readonly VoxelCoordinate[];
}): string {
  return createTransformLabScene(args).svgMarkup;
}
