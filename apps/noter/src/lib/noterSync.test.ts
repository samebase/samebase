import { describe, expect, it } from "vitest";

import {
  buildDirectNoterSyncConnectCommand,
  buildDirectNoterSyncRunCommand,
  buildNoterSyncScriptUrl,
  buildPublishedNoterSyncConnectCommand,
  buildPublishedNoterSyncRunCommand,
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

  it("builds the published package run command", () => {
    expect(buildPublishedNoterSyncRunCommand()).toBe("npx @noter-md/sync run");
  });

  it("builds the direct hosted-file command", () => {
    expect(
      buildDirectNoterSyncConnectCommand("https://noter.md/noter.js"),
    ).toBe(
      `SCRIPT_URL='https://noter.md/noter.js'; SCRIPT_CONTENT="$(curl -fsSL "$SCRIPT_URL")" && printf '%s\\n' "$SCRIPT_CONTENT" | node --input-type=module - connect "$SCRIPT_URL"`,
    );
  });

  it("builds the direct hosted-file run command", () => {
    expect(buildDirectNoterSyncRunCommand("https://noter.md/noter.js")).toBe(
      `SCRIPT_URL='https://noter.md/noter.js'; SCRIPT_CONTENT="$(curl -fsSL "$SCRIPT_URL")" && printf '%s\\n' "$SCRIPT_CONTENT" | node --input-type=module - run`,
    );
  });

  it("reads the optional machine-connect bootstrap query params", () => {
    expect(
      readMachineConnectBootstrapSearch("?openedByCli&requestId=request-123"),
    ).toEqual({
      openedByCli: true,
      requestId: "request-123",
    });
    expect(readMachineConnectBootstrapSearch("")).toEqual({
      openedByCli: false,
      requestId: null,
    });
  });
});
