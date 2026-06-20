import { describe, expect, it } from "vite-plus/test";

import {
  buildMachinesWorkspacePath,
  buildDirectSamebaseSyncConnectCommand,
  buildDirectSamebaseSyncRunCommand,
  buildSamebaseSyncScriptUrl,
  buildPublishedSamebaseSyncConnectCommand,
  buildPublishedSamebaseSyncRunCommand,
} from "@/lib/samebaseSync";

describe("samebaseSync", () => {
  it("builds the deploy-scoped Samebase sync script URL", () => {
    expect(buildSamebaseSyncScriptUrl("https://preview.samebase.com")).toBe(
      "https://preview.samebase.com/samebase.ts",
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
    expect(buildPublishedSamebaseSyncConnectCommand()).toBe("npx @samebase/sync connect");
  });

  it("builds the published package run command", () => {
    expect(buildPublishedSamebaseSyncRunCommand()).toBe("npx @samebase/sync run");
  });

  it("builds the direct hosted-file command", () => {
    expect(buildDirectSamebaseSyncConnectCommand("https://samebase.com/samebase.ts")).toBe(
      `curl -fsSL 'https://samebase.com/samebase.ts' | node --input-type=module - connect 'https://samebase.com/samebase.ts'`,
    );
  });

  it("builds the direct hosted-file run command", () => {
    expect(buildDirectSamebaseSyncRunCommand("https://samebase.com/samebase.ts")).toBe(
      `curl -fsSL 'https://samebase.com/samebase.ts' | node --input-type=module - run`,
    );
  });

  it("builds PowerShell-safe direct hosted-file commands for Windows", () => {
    expect(
      buildDirectSamebaseSyncConnectCommand("https://samebase.com/samebase.ts", "windows"),
    ).toBe(
      `curl.exe -fsSL 'https://samebase.com/samebase.ts' | node --input-type=module - connect 'https://samebase.com/samebase.ts'`,
    );
    expect(buildDirectSamebaseSyncRunCommand("https://samebase.com/samebase.ts", "windows")).toBe(
      `curl.exe -fsSL 'https://samebase.com/samebase.ts' | node --input-type=module - run`,
    );
  });
});
