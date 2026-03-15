import { describe, expect, it } from "vitest";
import { buildSwitchPtySessionToSandboxUserInput } from "./sandboxUser";

describe("buildSwitchPtySessionToSandboxUserInput", () => {
  it("prefers fish for interactive PTY sessions", () => {
    const script = buildSwitchPtySessionToSandboxUserInput({
      cwd: "/home/daytona/workspace/noter",
    });

    expect(script).toContain("if command -v fish >/dev/null 2>&1; then");
    expect(script).toContain('target_shell="$(command -v fish)"');
    expect(script).toContain('exec "$target_shell" -i');
    expect(script).not.toContain('SHELL="/bin/bash"');
    expect(script).not.toContain("exec /bin/bash -i");
  });
});
