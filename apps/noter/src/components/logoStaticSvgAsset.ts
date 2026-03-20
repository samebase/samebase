import {
  STATIC_LOGO_BACKGROUND_COLOR,
  STATIC_LOGO_ELEVATION_DEGREES,
  STATIC_LOGO_ROTATION_DEGREES,
  STATIC_LOGO_VOXEL_COORDINATES,
} from "./logoStaticSvgContract";
import { DEFAULT_FACE_COLORS } from "./logoTailwindColors";
import { createLogoThreeSvgMarkup } from "./logoThreeSvgRenderer";
import { createFilledVoxelSet } from "./logoVoxelState";

type StaticLogoSvgOptions = {
  filledVoxels?: ReadonlySet<string>;
};

export function createStaticLogoSvgMarkup(options: StaticLogoSvgOptions = {}) {
  const filledVoxels =
    options.filledVoxels ?? createFilledVoxelSet(STATIC_LOGO_VOXEL_COORDINATES);

  return createLogoThreeSvgMarkup({
    backgroundColor: STATIC_LOGO_BACKGROUND_COLOR,
    elevationDegrees: STATIC_LOGO_ELEVATION_DEGREES,
    faceColors: DEFAULT_FACE_COLORS,
    filledVoxels,
    rotationDegrees: STATIC_LOGO_ROTATION_DEGREES,
  });
}

export function createStaticLogoSvgDataUrl(options: StaticLogoSvgOptions = {}) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(createStaticLogoSvgMarkup(options))}`;
}
