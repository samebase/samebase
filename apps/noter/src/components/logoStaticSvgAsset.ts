import {
  DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
  LOGO_ISOMETRIC_CANVAS_HEIGHT,
  LOGO_ISOMETRIC_CANVAS_WIDTH,
  createLogoIsometricSvgMarkup,
} from "@/components/logoIsometricRenderer";
import { DEFAULT_FACE_COLORS } from "@/components/logoTailwindColors";
import { createDefaultFilledVoxelSet } from "@/components/logoVoxelState";

export const DEFAULT_LOGO_ISOMETRIC_SVG_MARKUP = createLogoIsometricSvgMarkup({
  backgroundColor: "transparent",
  faceColors: DEFAULT_FACE_COLORS,
  filledVoxels: createDefaultFilledVoxelSet(),
  styleId: DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
});

export const DEFAULT_LOGO_ISOMETRIC_SVG_DATA_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(DEFAULT_LOGO_ISOMETRIC_SVG_MARKUP)}`;

export const DEFAULT_STATIC_LOGO_SVG_MARKUP = DEFAULT_LOGO_ISOMETRIC_SVG_MARKUP;

export const DEFAULT_STATIC_LOGO_SVG_DATA_URL =
  DEFAULT_LOGO_ISOMETRIC_SVG_DATA_URL;

export const DEFAULT_STATIC_LOGO_SVG_NATURAL_SIZE = {
  height: LOGO_ISOMETRIC_CANVAS_HEIGHT,
  width: LOGO_ISOMETRIC_CANVAS_WIDTH,
} as const;
