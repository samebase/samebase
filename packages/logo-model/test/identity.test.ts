import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_LOGO_FACE_HEX_COLORS,
  LOGO_IDENTITY_VIEWS,
  STATIC_LOGO_ELEVATION_DEGREES,
  STATIC_LOGO_GRID_SIZE,
  STATIC_LOGO_VOXEL_COORDINATES,
  STATIC_LOGO_VOXEL_STATE,
} from "../src/identity";

describe("logo identity", () => {
  it("keeps the canonical shape, colors, and camera views renderer-independent", () => {
    expect(STATIC_LOGO_GRID_SIZE).toBe(3);
    expect(STATIC_LOGO_VOXEL_COORDINATES).toHaveLength(12);
    expect(STATIC_LOGO_VOXEL_STATE).toBe("oxo_xox_oxo-xox_ooo_xox-oxo_xox_oxo");
    expect(DEFAULT_LOGO_FACE_HEX_COLORS).toEqual({
      left: "#00b8db",
      right: "#394447",
      top: "#ffffff",
    });
    expect(LOGO_IDENTITY_VIEWS).toEqual([
      { elevationDegrees: 0, id: "side-primary", rotationDegrees: 0, version: 1 },
      { elevationDegrees: 0, id: "side-diagonal", rotationDegrees: 45, version: 2 },
      {
        elevationDegrees: STATIC_LOGO_ELEVATION_DEGREES,
        id: "spatial",
        rotationDegrees: 45,
        version: 3,
      },
    ]);
  });
});
