import {
  FAVICON_ROTATION_DEGREES,
  LOGO_GRID_SIZE_3,
  createFilledVoxelSet,
  serializeVoxelState,
  type LogoGridSize,
  type VoxelCoordinate,
} from "./logoVoxelState";
import { type LogoFaceTreatment } from "./logoFaceTreatment";

export const LOGO_THREE_SVG_VIEWBOX_SIZE = 360;
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

export const STATIC_LOGO_BACKGROUND_COLOR = "transparent";
export const STATIC_LOGO_ELEVATION_DEGREES = 35.26438968;
export const STATIC_LOGO_ROTATION_DEGREES = FAVICON_ROTATION_DEGREES;
export const DEFAULT_STATIC_LOGO_SVG_URL = "/logo-static.svg";
export const LOGO_BRAND_ASSET_ROOT = "/brand";
export const LOGO_IDENTITY_TREATMENT_ASSET_PATHS = {
  "side-primary": {
    duotone: `${LOGO_BRAND_ASSET_ROOT}/logo/v1-side-primary-duotone.svg`,
    striped: `${LOGO_BRAND_ASSET_ROOT}/logo/v1-side-primary-striped.svg`,
  },
  "side-diagonal": {
    duotone: `${LOGO_BRAND_ASSET_ROOT}/logo/v2-side-diagonal-duotone.svg`,
    striped: `${LOGO_BRAND_ASSET_ROOT}/logo/v2-side-diagonal-striped.svg`,
  },
  spatial: {
    duotone: `${LOGO_BRAND_ASSET_ROOT}/logo/v3-spatial-duotone.svg`,
    striped: `${LOGO_BRAND_ASSET_ROOT}/logo/v3-spatial-striped.svg`,
  },
} as const satisfies Record<string, Record<LogoFaceTreatment, string>>;
export const LOGO_IDENTITY_VIEW_CONTRACTS = [
  {
    assetPath: "/logo-v1-side-primary.svg",
    elevationDegrees: 0,
    id: "side-primary",
    label: "Version 1 side-primary mark",
    rotationDegrees: 0,
    treatmentAssetPaths: LOGO_IDENTITY_TREATMENT_ASSET_PATHS["side-primary"],
    version: 1,
  },
  {
    assetPath: "/logo-v2-side-diagonal.svg",
    elevationDegrees: 0,
    id: "side-diagonal",
    label: "Version 2 side-diagonal mark",
    rotationDegrees: FAVICON_ROTATION_DEGREES,
    treatmentAssetPaths: LOGO_IDENTITY_TREATMENT_ASSET_PATHS["side-diagonal"],
    version: 2,
  },
  {
    assetPath: DEFAULT_STATIC_LOGO_SVG_URL,
    elevationDegrees: STATIC_LOGO_ELEVATION_DEGREES,
    id: "spatial",
    label: "Version 3 spatial mark",
    rotationDegrees: STATIC_LOGO_ROTATION_DEGREES,
    treatmentAssetPaths: LOGO_IDENTITY_TREATMENT_ASSET_PATHS.spatial,
    version: 3,
  },
] as const;
export type LogoIdentityViewId = (typeof LOGO_IDENTITY_VIEW_CONTRACTS)[number]["id"];

export function getLogoIdentityAssetPath({
  treatment,
  viewId,
}: {
  treatment: LogoFaceTreatment;
  viewId: LogoIdentityViewId;
}): string {
  for (const view of LOGO_IDENTITY_VIEW_CONTRACTS) {
    if (view.id === viewId) {
      return view.treatmentAssetPaths[treatment];
    }
  }

  throw new Error(`Unknown logo identity view: ${viewId}`);
}

export const STATIC_LOGO_VOXEL_STATE = serializeVoxelState(
  createFilledVoxelSet(STATIC_LOGO_VOXEL_COORDINATES),
  STATIC_LOGO_GRID_SIZE,
);

export const DEFAULT_STATIC_LOGO_SVG_NATURAL_SIZE = {
  height: LOGO_THREE_SVG_VIEWBOX_SIZE,
  width: LOGO_THREE_SVG_VIEWBOX_SIZE,
} as const;
