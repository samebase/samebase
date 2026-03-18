import { type FaceColors } from "@/components/logoTailwindColors";
import {
  createLogoThreeSvgMarkup,
  LOGO_THREE_SVG_VIEWBOX_SIZE,
} from "@/components/logoThreeSvgRenderer";
import {
  createFilledVoxelSet,
  serializeVoxelState,
  type VoxelCoordinate,
} from "@/components/logoVoxelState";

export const STATIC_LOGO_FACE_COLORS = {
  left: "#394447",
  right: "#ffffff",
  top: "#ecfccb",
} as const satisfies FaceColors;

export const STATIC_LOGO_VOXEL_COORDINATES = [
  [1, 2, 0],
  [0, 2, 1],
  [2, 2, 1],
  [1, 2, 2],
  [0, 1, 0],
  [2, 1, 0],
  [0, 1, 2],
  [2, 1, 2],
  [1, 0, 0],
  [0, 0, 1],
  [2, 0, 1],
  [1, 0, 2],
] as const satisfies readonly VoxelCoordinate[];

export const STATIC_LOGO_BACKGROUND_COLOR = "transparent";
export const STATIC_LOGO_ELEVATION_DEGREES = 35.26438968;
export const STATIC_LOGO_ROTATION_DEGREES = 0;
export const DEFAULT_STATIC_LOGO_SVG_URL = "/favicon.svg";

const staticFilledVoxels = createFilledVoxelSet(STATIC_LOGO_VOXEL_COORDINATES);

export const STATIC_LOGO_VOXEL_STATE = serializeVoxelState(staticFilledVoxels);

export const DEFAULT_STATIC_LOGO_SVG_MARKUP = createLogoThreeSvgMarkup({
  backgroundColor: STATIC_LOGO_BACKGROUND_COLOR,
  elevationDegrees: STATIC_LOGO_ELEVATION_DEGREES,
  faceColors: STATIC_LOGO_FACE_COLORS,
  filledVoxels: staticFilledVoxels,
  rotationDegrees: STATIC_LOGO_ROTATION_DEGREES,
});

export const DEFAULT_STATIC_LOGO_SVG_NATURAL_SIZE = {
  height: LOGO_THREE_SVG_VIEWBOX_SIZE,
  width: LOGO_THREE_SVG_VIEWBOX_SIZE,
} as const;
