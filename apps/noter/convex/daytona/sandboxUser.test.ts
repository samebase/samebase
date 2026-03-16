import { describe, expect, it } from "vitest";
import {
  buildEnsureSandboxFishToolingCommand,
  buildEnsureSandboxPreferredInteractiveShellCommand,
  buildRunPtySessionAsSandboxUserInput,
  buildSwitchPtySessionToSandboxUserInput,
  buildVerifySandboxFishToolingCommand,
  ensureProjectedCodexHomeInSandbox,
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

describe("buildRunPtySessionAsSandboxUserInput", () => {
  it("routes explicit bootstrap commands through bash and stops if cd fails", () => {
    const script = buildRunPtySessionAsSandboxUserInput({
      cwd: "/home/daytona/workspace/noter",
      command:
        "if command -v tmux >/dev/null 2>&1; then tmux new-session -A -s noter-shell; fi",
    });

    expect(script).toContain("target_command=");
    expect(script).toContain("/home/daytona/workspace/noter");
    expect(script).toContain("&& exec");
    expect(script).toContain("/bin/bash");
    expect(script).toContain('su -m -s "$target_shell"');
    expect(script).toContain(
      "if command -v tmux >/dev/null 2>&1; then tmux new-session -A -s noter-shell; fi",
    );
  });
});

describe("ensureProjectedCodexHomeInSandbox", () => {
  it("does not try to chown the mounted shared Codex home", async () => {
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
    const combinedCommands = commands.join("\n");
    expect(combinedCommands).not.toContain(
      'chown "$target_user:$target_group" "$shared_home"',
    );
    expect(combinedCommands).not.toContain(
      'sudo chown "$target_user:$target_group" "$shared_home"',
    );
    expect(combinedCommands).not.toContain("noter-owner-ready");
    expect(commands[1]).toContain('mkdir -p "$shared_home/memories"');
  });
});

describe("buildVerifySandboxFishToolingCommand", () => {
  it("verifies fisher/pure without mutating the sandbox fish home", () => {
    const command = buildVerifySandboxFishToolingCommand();

    expect(command).toContain("if ! command -v fish >/dev/null 2>&1; then");
    expect(command).toContain('test -f "$config_home/functions/fisher.fish"');
    expect(command).toContain('test -f "$config_home/conf.d/_pure_init.fish"');
    expect(command).toContain('test -f "$config_home/conf.d/pure.fish"');
    expect(command).not.toContain("curl -fsSL");
    expect(command).not.toContain("codeload.github.com");
    expect(command).not.toContain("fish -lc");
  });
});

describe("buildEnsureSandboxFishToolingCommand", () => {
  it("verifies and installs fisher/pure in the sandbox user's fish home", () => {
    const command = buildEnsureSandboxFishToolingCommand();

    expect(command).toContain("if ! command -v fish >/dev/null 2>&1; then");
    expect(command).toContain('curl -fsSL "$fisher_url" -o "$fisher_path"');
    expect(command).toContain(
      'curl -fsSL "$pure_tarball_url" -o "$tarball_path"',
    );
    expect(command).toContain('tar -xzf "$tarball_path" -C "$temp_dir"');
    expect(command).toContain(
      'cp -f "$pure_root/conf.d/"*.fish "$config_home/conf.d/"',
    );
    expect(command).toContain(
      "https://codeload.github.com/pure-fish/pure/tar.gz/v4.9.0",
    );
    expect(command).toContain(
      'test -f "$config_home/functions/fish_prompt.fish"',
    );
  });
});
