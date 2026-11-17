import { describe, expect, it } from "vite-plus/test";

import { STATIC_LOGO_VOXEL_STATE } from "../src/identity";

describe("logo identity", () => {
  it("keeps the static logo on the canonical 3x3 checker lattice", () => {
    expect(STATIC_LOGO_VOXEL_STATE).toBe("oxo_xox_oxo-xox_ooo_xox-oxo_xox_oxo");
  });
});
