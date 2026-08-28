import { describe, expect, it } from "vite-plus/test";
import {
  buildWorkspaceLayoutV2DesktopPrehydrationScript,
  buildWorkspaceLayoutV2MobilePanePrehydrationScript,
} from "../src/WorkspaceLayoutV2Prehydration.ts";

describe("workspace layout prehydration", () => {
  it("uses package part attributes instead of test selectors", () => {
    const script = buildWorkspaceLayoutV2MobilePanePrehydrationScript(
      {
        desktopStyleElementId: "workspace-layout-prehydration",
      },
      () => null,
    );

    expect(script).toContain("data-workspace-layout-part");
    expect(script).toContain("data-pane-side");
    expect(script).not.toContain("data-testid");
  });

  it("leaves storage and visible border choices to the consumer", () => {
    const args = { desktopStyleElementId: "workspace-layout-prehydration" };
    const scripts = [
      buildWorkspaceLayoutV2DesktopPrehydrationScript(args, () => null),
      buildWorkspaceLayoutV2MobilePanePrehydrationScript(args, () => null),
    ];

    for (const script of scripts) {
      expect(script).not.toContain("localStorage");
      expect(script).not.toContain("storageKey");
      expect(script).not.toContain("storageVersion");
      expect(script).not.toContain("border-left-width");
      expect(script).not.toContain("border-right-width");
    }
    expect(scripts[0]).toContain("::before");
    expect(scripts[0]).toContain("::after");
    expect(scripts[0]).toContain("content: none !important");
  });
});
