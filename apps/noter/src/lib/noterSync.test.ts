import { describe, expect, it } from "vitest";

import {
  buildNoterSyncConnectCommand,
  buildNoterSyncScriptUrl,
  readMachineConnectBootstrapSearch,
} from "@/lib/noterSync";

describe("noterSync", () => {
  it("builds the deploy-scoped noter sync script URL", () => {
    expect(buildNoterSyncScriptUrl("https://preview.noter.md")).toBe(
      "https://preview.noter.md/noter.js",
    );
  });

  it("builds the default npm executor command", () => {
    expect(buildNoterSyncConnectCommand()).toBe("npx @noter-md/sync connect");
  });

  it("reads the optional machine-connect bootstrap query params", () => {
    expect(
      readMachineConnectBootstrapSearch(
        "?source=https%3A%2F%2Fpreview.noter.md%2Fnoter.js&installation=install-123&openedByCli=1",
      ),
    ).toEqual({
      installationId: "install-123",
      openedByCli: true,
      sourceUrl: "https://preview.noter.md/noter.js",
    });
  });
});
