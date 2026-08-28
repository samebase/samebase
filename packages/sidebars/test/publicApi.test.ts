import { describe, expect, it } from "vite-plus/test";
import * as geometry from "../src/SidebarLayoutGeometry.ts";
import * as runtime from "../src/SidebarRuntime.ts";

describe("sidebar layout public facades", () => {
  it("keeps geometry limited to the consumer constant", () => {
    expect(Object.keys(geometry).sort()).toEqual(["SIDEBAR_LAYOUT_MOBILE_MAIN_MIN_WIDTH_PX"]);
  });

  it("keeps runtime mutations behind the public pane actions hook", () => {
    expect(Object.keys(runtime).sort()).toEqual([
      "SidebarRuntimeProvider",
      "useSidebarActions",
      "useSidebarLayoutPresentation",
    ]);
  });
});
