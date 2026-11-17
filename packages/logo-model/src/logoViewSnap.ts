import { STATIC_LOGO_ELEVATION_DEGREES } from "./identity.ts";
import { type LogoViewDragConfig } from "./logoViewDrag.ts";

export const LOGO_VIEW_SNAP_THRESHOLD_DEGREES = 1;
export const LOGO_ORTHOGRAPHIC_ROTATION_SNAP_DEGREES = [0, 90, 180, 270] as const;
export const LOGO_DIAGONAL_ROTATION_SNAP_DEGREES = [45, 135, 225, 315] as const;
export const LOGO_ROTATION_SNAP_DEGREES = Array.from({ length: 8 }, (_, index) => index * 45);
export const LOGO_ORTHOGRAPHIC_ELEVATION_SNAP_DEGREES = [
  0, 45, 90, 135, 180, 225, 270, 315,
] as const satisfies readonly number[];
export const LOGO_DIAGONAL_ELEVATION_SNAP_DEGREES = [
  0,
  STATIC_LOGO_ELEVATION_DEGREES,
  90,
  180 - STATIC_LOGO_ELEVATION_DEGREES,
  180,
  180 + STATIC_LOGO_ELEVATION_DEGREES,
  270,
  360 - STATIC_LOGO_ELEVATION_DEGREES,
] as const satisfies readonly number[];
export const LOGO_ELEVATION_SNAP_DEGREES = LOGO_ORTHOGRAPHIC_ELEVATION_SNAP_DEGREES;

/**
The samebase.com landing snap: a drag sticks when the view comes within
`LOGO_VIEW_SNAP_THRESHOLD_DEGREES` of these angles.
*/
export const LOGO_VIEW_SNAP_DRAG_CONFIG: LogoViewDragConfig = {
  snapAngles: {
    elevationDegrees: LOGO_ORTHOGRAPHIC_ELEVATION_SNAP_DEGREES,
    elevationSnapGroups: [
      {
        elevationDegrees: LOGO_DIAGONAL_ELEVATION_SNAP_DEGREES,
        rotationDegrees: LOGO_DIAGONAL_ROTATION_SNAP_DEGREES,
      },
    ],
    rotationDegrees: LOGO_ROTATION_SNAP_DEGREES,
    thresholdDegrees: LOGO_VIEW_SNAP_THRESHOLD_DEGREES,
  },
};
