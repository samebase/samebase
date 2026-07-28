import {
  LOGO_THREE_SVG_CAMERA_FRUSTUM_PADDING,
  STATIC_LOGO_BACKGROUND_COLOR,
  LOGO_IDENTITY_VIEW_CONTRACTS,
} from "./logoStaticSvgContract";
import {
  STATIC_LOGO_ELEVATION_DEGREES,
  STATIC_LOGO_GRID_SIZE,
  STATIC_LOGO_ROTATION_DEGREES,
  STATIC_LOGO_VOXEL_COORDINATES,
  type LogoIdentityViewId,
} from "@samebase/logo-model/identity";
import {
  DEFAULT_LOGO_FACE_TREATMENT,
  LOGO_FACE_TREATMENTS,
  getLogoLeftFaceStyleForTreatment,
  type LogoFaceTreatment,
} from "@samebase/logo-model/face-treatment";
import { type LogoLeftFaceStyle } from "@samebase/logo-model/left-face-style";
import { DEFAULT_FACE_COLORS, type FaceColors } from "./logoTailwindColors";
import { createLogoThreeSvgMarkup } from "./logoThreeSvgRenderer";
import { createFilledVoxelSet } from "@samebase/logo-model/voxel";

type StaticLogoSvgOptions = {
  cameraFrustumPadding?: number;
  depth?: number;
  faceColors?: FaceColors;
  faceTreatment?: LogoFaceTreatment;
  filledVoxels?: ReadonlySet<string>;
  gridSize?: number;
  leftFaceStyle?: LogoLeftFaceStyle;
  view?: {
    elevationDegrees: number;
    rotationDegrees: number;
  };
};

function readStaticLogoLeftFaceStyle(options: StaticLogoSvgOptions): LogoLeftFaceStyle {
  return (
    options.leftFaceStyle ??
    getLogoLeftFaceStyleForTreatment(options.faceTreatment ?? DEFAULT_LOGO_FACE_TREATMENT)
  );
}

export function createStaticLogoSvgMarkup(options: StaticLogoSvgOptions = {}) {
  const filledVoxels = options.filledVoxels ?? createFilledVoxelSet(STATIC_LOGO_VOXEL_COORDINATES);
  const view = options.view ?? {
    elevationDegrees: STATIC_LOGO_ELEVATION_DEGREES,
    rotationDegrees: STATIC_LOGO_ROTATION_DEGREES,
  };

  return createLogoThreeSvgMarkup({
    backgroundColor: STATIC_LOGO_BACKGROUND_COLOR,
    cameraFrustumPadding: options.cameraFrustumPadding ?? LOGO_THREE_SVG_CAMERA_FRUSTUM_PADDING,
    depth: options.depth,
    elevationDegrees: view.elevationDegrees,
    faceColors: options.faceColors ?? DEFAULT_FACE_COLORS,
    filledVoxels,
    gridSize: options.gridSize ?? STATIC_LOGO_GRID_SIZE,
    leftFaceStyle: readStaticLogoLeftFaceStyle(options),
    rotationDegrees: view.rotationDegrees,
  });
}

export function createLogoIdentityViewSvgMarkup(
  viewId: LogoIdentityViewId,
  options: StaticLogoSvgOptions = {},
) {
  const filledVoxels = options.filledVoxels ?? createFilledVoxelSet(STATIC_LOGO_VOXEL_COORDINATES);
  const view = getLogoIdentityViewContract(viewId);

  return createLogoThreeSvgMarkup({
    backgroundColor: STATIC_LOGO_BACKGROUND_COLOR,
    cameraFrustumPadding: options.cameraFrustumPadding ?? LOGO_THREE_SVG_CAMERA_FRUSTUM_PADDING,
    depth: options.depth,
    elevationDegrees: view.elevationDegrees,
    faceColors: options.faceColors ?? DEFAULT_FACE_COLORS,
    filledVoxels,
    gridSize: options.gridSize ?? STATIC_LOGO_GRID_SIZE,
    leftFaceStyle: readStaticLogoLeftFaceStyle(options),
    rotationDegrees: view.rotationDegrees,
  });
}

export function createStaticLogoSvgDataUrl(options: StaticLogoSvgOptions = {}) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(createStaticLogoSvgMarkup(options))}`;
}

export function createLogoIdentitySvgAssets() {
  return LOGO_IDENTITY_VIEW_CONTRACTS.flatMap((view) => {
    const treatmentAssets = LOGO_FACE_TREATMENTS.map((faceTreatment) => ({
      assetPath: view.treatmentAssetPaths[faceTreatment],
      markup: createLogoIdentityViewSvgMarkup(view.id, {
        faceTreatment,
      }),
      treatment: faceTreatment,
      viewId: view.id,
    }));

    return [
      ...treatmentAssets,
      {
        assetPath: view.assetPath,
        markup: createLogoIdentityViewSvgMarkup(view.id),
        treatment: DEFAULT_LOGO_FACE_TREATMENT,
        viewId: view.id,
      },
    ];
  });
}

function getLogoIdentityViewContract(viewId: LogoIdentityViewId) {
  for (const view of LOGO_IDENTITY_VIEW_CONTRACTS) {
    if (view.id === viewId) {
      return view;
    }
  }

  throw new Error(`Unknown logo identity view: ${viewId}`);
}
