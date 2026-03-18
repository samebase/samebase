import {
  DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
  createLogoIsometricSvgMarkup,
} from "@/components/logoIsometricRenderer";
import { DEFAULT_FACE_COLORS } from "@/components/logoTailwindColors";
import {
  createLogoThreeSvgMarkup,
  LOGO_THREE_SVG_VIEWBOX_SIZE,
} from "@/components/logoThreeSvgRenderer";
import { createDefaultFilledVoxelSet } from "@/components/logoVoxelState";

const defaultFilledVoxels = createDefaultFilledVoxelSet();

export const DEFAULT_LOGO_ISOMETRIC_SVG_MARKUP = createLogoIsometricSvgMarkup({
  backgroundColor: "transparent",
  faceColors: DEFAULT_FACE_COLORS,
  filledVoxels: defaultFilledVoxels,
  styleId: DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
});

export const DEFAULT_LOGO_ISOMETRIC_SVG_DATA_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(DEFAULT_LOGO_ISOMETRIC_SVG_MARKUP)}`;

export const DEFAULT_STATIC_LOGO_SVG_MARKUP = createLogoThreeSvgMarkup({
  backgroundColor: "transparent",
  faceColors: DEFAULT_FACE_COLORS,
  filledVoxels: defaultFilledVoxels,
});

export const DEFAULT_STATIC_LOGO_SVG_DATA_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(DEFAULT_STATIC_LOGO_SVG_MARKUP)}`;

export const DEFAULT_STATIC_LOGO_SVG_NATURAL_SIZE = {
  height: LOGO_THREE_SVG_VIEWBOX_SIZE,
  width: LOGO_THREE_SVG_VIEWBOX_SIZE,
} as const;
