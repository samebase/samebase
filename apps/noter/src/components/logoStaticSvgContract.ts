import {
  createFilledVoxelSet,
  serializeVoxelState,
  type VoxelCoordinate,
} from "./logoVoxelState";

export const LOGO_THREE_SVG_VIEWBOX_SIZE = 360;

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
export const DEFAULT_STATIC_LOGO_SVG_URL = "/logo-static.svg";

export const STATIC_LOGO_VOXEL_STATE = serializeVoxelState(
  createFilledVoxelSet(STATIC_LOGO_VOXEL_COORDINATES),
);

export const DEFAULT_STATIC_LOGO_SVG_NATURAL_SIZE = {
  height: LOGO_THREE_SVG_VIEWBOX_SIZE,
  width: LOGO_THREE_SVG_VIEWBOX_SIZE,
} as const;
