import { describe, expect, it } from "vite-plus/test";
import * as geometry from "../src/WorkspaceLayoutV2GeometryPublic.ts";
import * as runtime from "../src/WorkspacePaneRuntimePublic.ts";

describe("workspace layout public facades", () => {
  it("keeps geometry limited to the consumer constant", () => {
    expect(Object.keys(geometry).sort()).toEqual(["WORKSPACE_LAYOUT_V2_MOBILE_MAIN_MIN_WIDTH_PX"]);
  });

  it("keeps runtime mutations behind the public pane actions hook", () => {
    expect(Object.keys(runtime).sort()).toEqual([
      "WorkspacePaneRuntimeProvider",
      "useWorkspaceLayoutPresentation",
      "useWorkspacePaneActions",
    ]);
  });
});
