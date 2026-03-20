import {
  LOGO_THREE_SVG_VIEWBOX_SIZE,
  STATIC_LOGO_ELEVATION_DEGREES,
  STATIC_LOGO_ROTATION_DEGREES,
  STATIC_LOGO_VOXEL_COORDINATES,
} from "@/components/logoStaticSvgContract";
import {
  DEFAULT_FACE_COLORS,
  type FaceColorKey,
} from "@/components/logoTailwindColors";
import { createFilledVoxelSet } from "@/components/logoVoxelState";
import { createLogoThreeProjectedQuads } from "@/components/logoThreeSvgRenderer";

type ProjectedFaceDefinition = {
  color: string;
  colorKey: FaceColorKey;
  corners: readonly Point[];
  key: string;
  stroke: string;
  strokeWidth: number;
  transform: string;
};

type Point = {
  x: number;
  y: number;
};

export type TransformLabFace = ProjectedFaceDefinition;

export const TRANSFORM_LAB_VIEW_BOX = {
  minX: 0,
  minY: 0,
  width: LOGO_THREE_SVG_VIEWBOX_SIZE,
  height: LOGO_THREE_SVG_VIEWBOX_SIZE,
} as const;

function formatNumber(value: number): string {
  return value.toFixed(6);
}

function createTransformString(u: Point, v: Point, origin: Point): string {
  return `matrix(${formatNumber(u.x)} ${formatNumber(u.y)} ${formatNumber(v.x)} ${formatNumber(v.y)} ${formatNumber(origin.x)} ${formatNumber(origin.y)})`;
}

function createProjectedFaceDefinitions(): ProjectedFaceDefinition[] {
  const filledVoxels = createFilledVoxelSet(STATIC_LOGO_VOXEL_COORDINATES);

  return createLogoThreeProjectedQuads({
    elevationDegrees: STATIC_LOGO_ELEVATION_DEGREES,
    faceColors: DEFAULT_FACE_COLORS,
    filledVoxels,
    rotationDegrees: STATIC_LOGO_ROTATION_DEGREES,
    viewBoxSize: LOGO_THREE_SVG_VIEWBOX_SIZE,
  }).map((quad) => {
    const projectedOrigin = quad.points[0];
    const projectedUPoint = quad.points[1];
    const projectedVPoint = quad.points[3];

    return {
      color: quad.color,
      colorKey: quad.colorKey,
      corners: quad.points,
      key: quad.key,
      stroke: quad.color,
      strokeWidth: quad.strokeWidth,
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
  });
}

export function createLogoTransitionTransformFaces(): TransformLabFace[] {
  return createProjectedFaceDefinitions();
}
