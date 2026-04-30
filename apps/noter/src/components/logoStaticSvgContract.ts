import {
  FAVICON_ROTATION_DEGREES,
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
export const STATIC_LOGO_ROTATION_DEGREES = FAVICON_ROTATION_DEGREES;
export const DEFAULT_STATIC_LOGO_SVG_URL = "/logo-static.svg";
export const LOGO_IDENTITY_VIEW_CONTRACTS = [
  {
    assetPath: "/logo-v1-side-primary.svg",
    elevationDegrees: 0,
    id: "side-primary",
    label: "Version 1 side-primary mark",
    rotationDegrees: 0,
    version: 1,
  },
  {
    assetPath: "/logo-v2-side-diagonal.svg",
    elevationDegrees: 0,
    id: "side-diagonal",
    label: "Version 2 side-diagonal mark",
    rotationDegrees: FAVICON_ROTATION_DEGREES,
    version: 2,
  },
  {
    assetPath: DEFAULT_STATIC_LOGO_SVG_URL,
    elevationDegrees: STATIC_LOGO_ELEVATION_DEGREES,
    id: "spatial",
    label: "Version 3 spatial mark",
    rotationDegrees: STATIC_LOGO_ROTATION_DEGREES,
    version: 3,
  },
] as const;
export type LogoIdentityViewId =
  (typeof LOGO_IDENTITY_VIEW_CONTRACTS)[number]["id"];
export const LOGO_IDENTITY_EDIT_MARK_VIEW_ID =
  "side-diagonal" satisfies LogoIdentityViewId;
export const LOGO_IDENTITY_EDIT_MARK_SVG_URL = "/logo-v2-side-diagonal.svg";

export const STATIC_LOGO_VOXEL_STATE = serializeVoxelState(
  createFilledVoxelSet(STATIC_LOGO_VOXEL_COORDINATES),
);

export const DEFAULT_STATIC_LOGO_SVG_NATURAL_SIZE = {
  height: LOGO_THREE_SVG_VIEWBOX_SIZE,
  width: LOGO_THREE_SVG_VIEWBOX_SIZE,
} as const;
