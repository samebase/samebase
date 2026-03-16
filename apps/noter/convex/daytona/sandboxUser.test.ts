import { describe, expect, it } from "vitest";
import {
  buildEnsureSandboxPreferredInteractiveShellCommand,
  buildSwitchPtySessionToSandboxUserInput,
} from "./sandboxUser";

describe("buildEnsureSandboxPreferredInteractiveShellCommand", () => {
  it("repairs the sandbox fish home directories before opening a PTY", () => {
    const command = buildEnsureSandboxPreferredInteractiveShellCommand();

    expect(command).toContain("bash -lc");
    expect(command).toContain("run_privileged()");
    expect(command).toContain("if ! command -v fish >/dev/null 2>&1; then");
    expect(command).toContain(
      'mkdir -p "$target_home" "$target_home/.config/fish" "$target_home/.cache" "$target_home/.local/share"',
    );
    expect(command).toContain(
      'chown -R "$target_user:$target_group" "$target_home/.config" "$target_home/.cache" "$target_home/.local"',
    );
    expect(command).toContain("ensure_user_shell root root");
    expect(command).toContain("ensure_user_home_dirs root root /root");
    expect(command).toContain("/home/daytona");
  });
});

describe("buildSwitchPtySessionToSandboxUserInput", () => {
  it("wraps the sandbox-user handoff in a single bash command and prefers fish", () => {
    const script = buildSwitchPtySessionToSandboxUserInput({
      cwd: "/home/daytona/workspace/noter",
    });

    expect(script).toContain("exec '/bin/bash' -lc");
    expect(script).toContain("target_cwd=");
    expect(script).toContain("target_shell=");
    expect(script).toContain("/usr/bin/fish");
    expect(script).toContain('if [ ! -x "$target_shell" ]; then');
    expect(script).toContain('cd "$target_cwd"');
    expect(script).toContain('su -m -s "$target_shell"');
    expect(script).toContain("daytona");
    expect(script).toContain("/home/daytona/workspace/noter");
    expect(script).toContain("XDG_CONFIG_HOME=");
    expect(script).toContain("XDG_CACHE_HOME=");
    expect(script).toContain("XDG_DATA_HOME=");
    expect(script).not.toContain(" -c ");
    expect(script).not.toContain('exec "$SHELL" -i');
    expect(script.trimEnd()).not.toContain("\n");
  });
});
