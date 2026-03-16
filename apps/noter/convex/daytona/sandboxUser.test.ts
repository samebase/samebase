import { describe, expect, it } from "vitest";
import {
  buildEnsureSandboxPreferredInteractiveShellCommand,
  buildSwitchPtySessionToSandboxUserInput,
  ensureProjectedCodexHomeInSandbox,
  ensureSandboxFishTooling,
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

describe("ensureProjectedCodexHomeInSandbox", () => {
  it("repairs shared Codex home ownership before projecting shared entries", async () => {
    const commands: string[] = [];
    const sandbox = {
      process: {
        executeCommand: async (command: string) => {
          commands.push(command);
          return {
            exitCode: 0,
            result: "",
          };
        },
      },
    };

    // @ts-expect-error Test double only implements executeCommand used here.
    await ensureProjectedCodexHomeInSandbox({ sandbox, timeoutSeconds: 1 });

    expect(commands).toHaveLength(2);
    expect(commands[0]).toContain(
      'chown -R "$target_user:$target_group" "$shared_home"',
    );
    expect(commands[1]).toContain('mkdir -p "$shared_home/memories"');
  });
});

describe("ensureSandboxFishTooling", () => {
  it("verifies and installs fisher/pure in the sandbox user's fish home", async () => {
    const commands: string[] = [];
    const sandbox = {
      process: {
        executeCommand: async (command: string) => {
          commands.push(command);
          return {
            exitCode: 0,
            result: "",
          };
        },
      },
    };

    // @ts-expect-error Test double only implements executeCommand used here.
    await ensureSandboxFishTooling({ sandbox, timeoutSeconds: 1 });

    expect(commands).toHaveLength(1);
    expect(commands[0]).toContain("if ! command -v fish >/dev/null 2>&1; then");
    expect(commands[0]).toContain('curl -fsSL "$fisher_url" -o "$fisher_path"');
    expect(commands[0]).toContain("fisher install $fisher_plugin $pure_plugin");
    expect(commands[0]).toContain('fish -lc "$verify_command"');
    expect(commands[0]).toContain("pure-fish/pure@v4.9.0");
  });
});
