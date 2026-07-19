import {
  FAVICON_ROTATION_DEGREES,
  LOGO_GRID_SIZE_3,
  createFilledVoxelSet,
  serializeVoxelState,
  type LogoGridSize,
  type VoxelCoordinate,
} from "./voxel.ts";

export type LogoFaceHexColors = {
  left: `#${string}`;
  right: `#${string}`;
  top: `#${string}`;
};

export const STATIC_LOGO_GRID_SIZE: LogoGridSize = LOGO_GRID_SIZE_3;
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

export const STATIC_LOGO_ELEVATION_DEGREES = 35.26438968;
export const STATIC_LOGO_ROTATION_DEGREES = FAVICON_ROTATION_DEGREES;
export const DEFAULT_LOGO_FACE_HEX_COLORS = {
  left: "#00b8db",
  right: "#394447",
  top: "#ffffff",
} as const satisfies LogoFaceHexColors;

export const LOGO_IDENTITY_VIEWS = [
  {
    elevationDegrees: 0,
    id: "side-primary",
    rotationDegrees: 0,
    version: 1,
  },
  {
    elevationDegrees: 0,
    id: "side-diagonal",
    rotationDegrees: FAVICON_ROTATION_DEGREES,
    version: 2,
  },
  {
    elevationDegrees: STATIC_LOGO_ELEVATION_DEGREES,
    id: "spatial",
    rotationDegrees: STATIC_LOGO_ROTATION_DEGREES,
    version: 3,
  },
] as const;
export type LogoIdentityViewId = (typeof LOGO_IDENTITY_VIEWS)[number]["id"];

export const STATIC_LOGO_VOXEL_STATE = serializeVoxelState(
  createFilledVoxelSet(STATIC_LOGO_VOXEL_COORDINATES),
  STATIC_LOGO_GRID_SIZE,
);
