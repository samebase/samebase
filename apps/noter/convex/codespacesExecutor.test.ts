import { describe, expect, it } from "vitest";

import { buildCodespaceAgentRestartCommand } from "./codespacesExecutor";

describe("buildCodespaceAgentRestartCommand", () => {
  it("matches both legacy and current codespace agent entrypoints", () => {
    const command = buildCodespaceAgentRestartCommand({
      lockToken: "lock-token",
      packageChanged: false,
      packageBackupExists: false,
      serverBackupExists: false,
    });

    expect(command).toContain(
      String.raw`server_pid=$(pgrep -f "[n]ode .*(\.codespace-agent/)?server\.(js|ts)([[:space:]]|$)" | head -n 1 || true)`,
    );
  });
});
