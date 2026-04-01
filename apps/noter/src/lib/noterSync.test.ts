import { describe, expect, it } from "vitest";

import {
  buildMachinesWorkspacePath,
  buildMachineLiveControlPath,
  buildDirectNoterSyncConnectCommand,
  buildDirectNoterSyncRunCommand,
  buildNoterSyncScriptUrl,
  buildPublishedNoterSyncConnectCommand,
  buildPublishedNoterSyncRunCommand,
  readMachineLiveControlPath,
  readMachineConnectBootstrapSearch,
} from "@/lib/noterSync";

describe("noterSync", () => {
  it("builds the deploy-scoped noter sync script URL", () => {
    expect(buildNoterSyncScriptUrl("https://preview.noter.md")).toBe(
      "https://preview.noter.md/noter.js",
    );
  });

  it("builds the machine live-control route", () => {
    expect(buildMachineLiveControlPath("machine:123")).toBe(
      "/machines/machine%3A123/live",
    );
  });

  it("builds the machines workspace route", () => {
    expect(
      buildMachinesWorkspacePath({
        machineId: "machine:123",
        threadId: "thread-123",
      }),
    ).toBe("/machines?machineId=machine%3A123&threadId=thread-123");
    expect(buildMachinesWorkspacePath()).toBe("/machines");
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
      `curl -fsSL 'https://noter.md/noter.js' | node --input-type=module - connect 'https://noter.md/noter.js'`,
    );
  });

  it("builds the direct hosted-file run command", () => {
    expect(buildDirectNoterSyncRunCommand("https://noter.md/noter.js")).toBe(
      `curl -fsSL 'https://noter.md/noter.js' | node --input-type=module - run`,
    );
  });

  it("builds PowerShell-safe direct hosted-file commands for Windows", () => {
    expect(
      buildDirectNoterSyncConnectCommand(
        "https://noter.md/noter.js",
        "windows",
      ),
    ).toBe(
      `curl.exe -fsSL 'https://noter.md/noter.js' | node --input-type=module - connect 'https://noter.md/noter.js'`,
    );
    expect(
      buildDirectNoterSyncRunCommand("https://noter.md/noter.js", "windows"),
    ).toBe(
      `curl.exe -fsSL 'https://noter.md/noter.js' | node --input-type=module - run`,
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

  it("reads the machine id from a live-control route pathname", () => {
    expect(readMachineLiveControlPath("/machines/machine%3A123/live")).toEqual({
      machineId: "machine:123",
    });
    expect(readMachineLiveControlPath("/machines/%ZZ/live")).toBeNull();
    expect(readMachineLiveControlPath("/machines/connect")).toBeNull();
  });
});
