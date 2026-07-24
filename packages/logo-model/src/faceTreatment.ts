import {
  LOGO_SECONDARY_LEFT_FACE_STYLE,
  LOGO_SINGLE_COLOR_STRIPED_LEFT_FACE_STYLE,
  type LogoLeftFaceStyle,
} from "./leftFaceStyle.ts";

export const LOGO_FACE_TREATMENTS = ["duotone", "striped"] as const;
export type LogoFaceTreatment = (typeof LOGO_FACE_TREATMENTS)[number];

export const DEFAULT_LOGO_FACE_TREATMENT = "duotone" satisfies LogoFaceTreatment;

export function getLogoLeftFaceStyleForTreatment(treatment: LogoFaceTreatment): LogoLeftFaceStyle {
  switch (treatment) {
    case "duotone":
      return LOGO_SECONDARY_LEFT_FACE_STYLE;
    case "striped":
      return LOGO_SINGLE_COLOR_STRIPED_LEFT_FACE_STYLE;
    default: {
      const unreachable = treatment satisfies never;
      return unreachable;
    }
  }
}
