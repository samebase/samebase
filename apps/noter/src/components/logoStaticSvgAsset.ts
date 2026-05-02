import {
  STATIC_LOGO_BACKGROUND_COLOR,
  STATIC_LOGO_ELEVATION_DEGREES,
  LOGO_IDENTITY_VIEW_CONTRACTS,
  STATIC_LOGO_ROTATION_DEGREES,
  STATIC_LOGO_VOXEL_COORDINATES,
  type LogoIdentityViewId,
} from "./logoStaticSvgContract";
import { DEFAULT_FACE_COLORS, type FaceColors } from "./logoTailwindColors";
import { createLogoThreeSvgMarkup } from "./logoThreeSvgRenderer";
import { createFilledVoxelSet } from "./logoVoxelState";

type StaticLogoSvgOptions = {
  faceColors?: FaceColors;
  filledVoxels?: ReadonlySet<string>;
  view?: {
    elevationDegrees: number;
    rotationDegrees: number;
  };
};

export function createStaticLogoSvgMarkup(options: StaticLogoSvgOptions = {}) {
  const filledVoxels =
    options.filledVoxels ?? createFilledVoxelSet(STATIC_LOGO_VOXEL_COORDINATES);
  const view = options.view ?? {
    elevationDegrees: STATIC_LOGO_ELEVATION_DEGREES,
    rotationDegrees: STATIC_LOGO_ROTATION_DEGREES,
  };

  return createLogoThreeSvgMarkup({
    backgroundColor: STATIC_LOGO_BACKGROUND_COLOR,
    elevationDegrees: view.elevationDegrees,
    faceColors: options.faceColors ?? DEFAULT_FACE_COLORS,
    filledVoxels,
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
    elevationDegrees: view.elevationDegrees,
    faceColors: options.faceColors ?? DEFAULT_FACE_COLORS,
    filledVoxels,
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

function getLogoIdentityViewContract(viewId: LogoIdentityViewId) {
  for (const view of LOGO_IDENTITY_VIEW_CONTRACTS) {
    if (view.id === viewId) {
      return view;
    }
  }

  throw new Error(`Unknown logo identity view: ${viewId}`);
}
