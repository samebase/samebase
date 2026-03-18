import {
  STATIC_LOGO_BACKGROUND_COLOR,
  STATIC_LOGO_ELEVATION_DEGREES,
  STATIC_LOGO_FACE_COLORS,
  STATIC_LOGO_ROTATION_DEGREES,
  STATIC_LOGO_VOXEL_COORDINATES,
} from "@/components/logoStaticSvgContract";
import { createLogoThreeSvgMarkup } from "@/components/logoThreeSvgRenderer";
import { createFilledVoxelSet } from "@/components/logoVoxelState";

const staticFilledVoxels = createFilledVoxelSet(STATIC_LOGO_VOXEL_COORDINATES);

export const DEFAULT_STATIC_LOGO_SVG_MARKUP = createLogoThreeSvgMarkup({
  backgroundColor: STATIC_LOGO_BACKGROUND_COLOR,
  elevationDegrees: STATIC_LOGO_ELEVATION_DEGREES,
  faceColors: STATIC_LOGO_FACE_COLORS,
  filledVoxels: staticFilledVoxels,
  rotationDegrees: STATIC_LOGO_ROTATION_DEGREES,
});
