import { describe, expect, it } from "vitest";

import {
  buildDirectNoterSyncConnectCommand,
  buildPublishedNoterSyncConnectCommand,
  buildNoterSyncScriptUrl,
  readMachineConnectBootstrapSearch,
} from "@/lib/noterSync";

describe("noterSync", () => {
  it("builds the deploy-scoped noter sync script URL", () => {
    expect(buildNoterSyncScriptUrl("https://preview.noter.md")).toBe(
      "https://preview.noter.md/noter.js",
    );
  });

  it("builds the published package command", () => {
    expect(buildPublishedNoterSyncConnectCommand()).toBe(
      "npx @noter-md/sync connect",
    );
  });

  it("builds the direct hosted-file command", () => {
    expect(
      buildDirectNoterSyncConnectCommand("https://noter.md/noter.js"),
    ).toBe(
      "curl -fsSL 'https://noter.md/noter.js' | node --input-type=module - connect 'https://noter.md/noter.js'",
    );
  });

  it("reads the optional machine-connect bootstrap query params", () => {
    expect(readMachineConnectBootstrapSearch("?openedByCli")).toEqual({
      openedByCli: true,
    });
  });
});
