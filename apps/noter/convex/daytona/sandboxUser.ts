"use node";

import type { Sandbox } from "@daytonaio/sdk";

export const DAYTONA_WORKSPACE_DIR = "/home/daytona/workspace";
export const DAYTONA_SANDBOX_USER = "daytona";
export const DAYTONA_SANDBOX_GROUP = "daytona";
export const DAYTONA_SANDBOX_HOME = "/home/daytona";
export const DAYTONA_CODEX_HOME = `${DAYTONA_SANDBOX_HOME}/.codex`;
export const DAYTONA_CODEX_SHARED_HOME = `${DAYTONA_SANDBOX_HOME}/.codex-shared`;

const DEFAULT_REPAIR_TIMEOUT_SECONDS = 300;
export const DAYTONA_PREFERRED_INTERACTIVE_SHELL = "/usr/bin/fish";
const DAYTONA_FALLBACK_INTERACTIVE_SHELL = "/bin/bash";
const DAYTONA_FISHER_URL =
  "https://raw.githubusercontent.com/jorgebucaran/fisher/4.4.8/functions/fisher.fish";
const DAYTONA_PURE_TARBALL_URL =
  "https://codeload.github.com/pure-fish/pure/tar.gz/v4.9.0";
const DAYTONA_PURE_ARCHIVE_ROOT = "pure-4.9.0";
const DAYTONA_CODEX_LOCAL_DIRS = ["tmp", "log"] as const;
const DAYTONA_CODEX_SHARED_ENTRY_NAMES = ["auth.json", "memories"] as const;
const DAYTONA_CODEX_LOCAL_SYNCED_FILE_NAMES = ["config.toml"] as const;
const DAYTONA_CODEX_SHARED_OWNERSHIP_STAMP = ".noter-owner-ready";

type TemplateValue = string | number | boolean | null | undefined;

function quoteForShell(input: string): string {
  return `'${input.replace(/'/g, `'\\''`)}'`;
}

function stripIndent(
  strings: TemplateStringsArray,
  ...values: TemplateValue[]
): string {
  let combined = "";
  for (let index = 0; index < strings.length; index += 1) {
    combined += strings[index];
    if (index < values.length) {
      combined += String(values[index]);
    }
  }

  const trimmed = combined.trim();
  if (trimmed.length === 0) {
    return "";
  }

  const lines = trimmed.split("\n");
  let minIndent: number | null = null;
  for (const line of lines) {
    if (line.trim().length === 0) {
      continue;
    }
    const match = line.match(/^ +/);
    const indent = match ? match[0].length : 0;
    if (minIndent === null || indent < minIndent) {
      minIndent = indent;
      if (minIndent === 0) {
        break;
      }
    }
  }

  if (!minIndent) {
    return trimmed;
  }

  return lines.map((line) => line.slice(minIndent)).join("\n");
}

export function buildRunCommandAsSandboxUser(args: {
  command: string;
  cwd?: string;
}): string {
  const cwd = args.cwd?.trim() ?? "";
  const innerCommand = stripIndent`
    export HOME=${quoteForShell(DAYTONA_SANDBOX_HOME)}
    export USER=${quoteForShell(DAYTONA_SANDBOX_USER)}
    export LOGNAME=${quoteForShell(DAYTONA_SANDBOX_USER)}
    export CODEX_HOME=${quoteForShell(DAYTONA_CODEX_HOME)}
    if [ -n ${quoteForShell(cwd)} ]; then
      cd ${quoteForShell(cwd)}
    fi
    exec bash -lc ${quoteForShell(args.command)}
  `;
  const outerCommand = stripIndent`
    set -e
    target_user=${quoteForShell(DAYTONA_SANDBOX_USER)}
    target_cwd=${quoteForShell(cwd)}
    if [ -n "$target_cwd" ] && [ ! -d "$target_cwd" ]; then
      echo "__NOTER_CWD_MISSING__:$target_cwd"
      exit 1
    fi
    if [ "$(id -un)" = "$target_user" ]; then
      exec bash -lc ${quoteForShell(innerCommand)}
    fi
    if [ "$(id -u)" = "0" ]; then
      exec su -m -s /bin/bash "$target_user" -c ${quoteForShell(innerCommand)}
    fi
    if command -v sudo >/dev/null 2>&1; then
      exec sudo -E -u "$target_user" bash -lc ${quoteForShell(innerCommand)}
    fi
    echo "__NOTER_SANDBOX_USER_EXEC_FAILED__:$target_user"
    exit 1
  `;
  return `bash -lc ${quoteForShell(outerCommand)}`;
}

export async function executeCommandAsSandboxUser(args: {
  sandbox: Sandbox;
  command: string;
  cwd?: string;
  envs?: Record<string, string>;
  timeoutSeconds: number;
}): Promise<Awaited<ReturnType<Sandbox["process"]["executeCommand"]>>> {
  return args.sandbox.process.executeCommand(
    buildRunCommandAsSandboxUser({
      command: args.command,
      cwd: args.cwd,
    }),
    undefined,
    args.envs,
    args.timeoutSeconds,
  );
}

export async function ensureSandboxPathWritableByUser(args: {
  sandbox: Sandbox;
  path: string;
  timeoutSeconds?: number;
}): Promise<void> {
  const targetPath = args.path.trim();
  const timeoutSeconds = args.timeoutSeconds ?? DEFAULT_REPAIR_TIMEOUT_SECONDS;

  const prepareScript = stripIndent`
    set -e
    target_user=${quoteForShell(DAYTONA_SANDBOX_USER)}
    target_group=${quoteForShell(DAYTONA_SANDBOX_GROUP)}
    target_path=${quoteForShell(targetPath)}
    if [ ! -d "$target_path" ]; then
      echo "__NOTER_TARGET_PATH_MISSING__:$target_path"
      exit 1
    fi
    ensure_target_user() {
      if id -u "$target_user" >/dev/null 2>&1; then
        return 0
      fi
      if ! getent group "$target_group" >/dev/null 2>&1; then
        groupadd "$target_group"
      fi
      useradd -m -s /bin/bash -g "$target_group" "$target_user"
    }
    if [ "$(id -u)" = "0" ]; then
      ensure_target_user
      chown -R "$target_user:$target_group" "$target_path"
      exit 0
    fi
    if command -v sudo >/dev/null 2>&1; then
      sudo bash -lc "$(declare -f ensure_target_user); ensure_target_user"
      sudo chown -R "$target_user:$target_group" "$target_path"
      exit 0
    fi
  `;
  const prepareResult = await args.sandbox.process.executeCommand(
    `bash -lc ${quoteForShell(prepareScript)}`,
    undefined,
    undefined,
    timeoutSeconds,
  );
  if (prepareResult.exitCode !== 0) {
    throw new Error(
      prepareResult.result.trim() ||
        `Failed to repair sandbox path ownership for ${targetPath}.`,
    );
  }

  const verifyScript = stripIndent`
    set -e
    target_path=${quoteForShell(targetPath)}
    if [ ! -d "$target_path" ]; then
      echo "__NOTER_TARGET_PATH_MISSING__:$target_path"
      exit 1
    fi
    if [ ! -w "$target_path" ]; then
      echo "__NOTER_TARGET_PATH_NOT_WRITABLE__:$target_path"
      exit 1
    fi
    probe_path="$target_path/.noter-write-check"
    : > "$probe_path"
    rm -f "$probe_path"
  `;
  const verifyResult = await executeCommandAsSandboxUser({
    sandbox: args.sandbox,
    command: verifyScript,
    timeoutSeconds,
  });
  if (verifyResult.exitCode !== 0) {
    throw new Error(
      verifyResult.result.trim() ||
        `Sandbox path is not writable as ${DAYTONA_SANDBOX_USER}: ${targetPath}.`,
    );
  }
}

export async function ensureProjectedCodexHomeInSandbox(args: {
  sandbox: Sandbox;
  timeoutSeconds?: number;
}): Promise<void> {
  const timeoutSeconds = args.timeoutSeconds ?? DEFAULT_REPAIR_TIMEOUT_SECONDS;

  const prepareScript = stripIndent`
    set -e
    sandbox_home=${quoteForShell(DAYTONA_SANDBOX_HOME)}
    local_home=${quoteForShell(DAYTONA_CODEX_HOME)}
    shared_home=${quoteForShell(DAYTONA_CODEX_SHARED_HOME)}
    shared_ownership_stamp="$shared_home/${DAYTONA_CODEX_SHARED_OWNERSHIP_STAMP}"
    target_user=${quoteForShell(DAYTONA_SANDBOX_USER)}
    target_group=${quoteForShell(DAYTONA_SANDBOX_GROUP)}
    ensure_target_user() {
      if id -u "$target_user" >/dev/null 2>&1; then
        return 0
      fi
      if ! getent group "$target_group" >/dev/null 2>&1; then
        groupadd "$target_group"
      fi
      useradd -m -s /bin/bash -g "$target_group" "$target_user"
    }
    mkdir -p "$sandbox_home" "$local_home" "$shared_home"
    if [ "$(id -u)" = "0" ]; then
      ensure_target_user
      expected_shared_owner="$(id -u "$target_user"):$(id -g "$target_user")"
      stamp_owner="$(stat -c '%u:%g' "$shared_ownership_stamp" 2>/dev/null || printf '%s' missing)"
      chown "$target_user:$target_group" "$sandbox_home"
      chown "$target_user:$target_group" "$local_home"
      chown "$target_user:$target_group" "$shared_home"
      if [ "$stamp_owner" != "$expected_shared_owner" ]; then
        chown -R "$target_user:$target_group" "$shared_home"
      fi
      touch "$shared_ownership_stamp"
      chown "$target_user:$target_group" "$shared_ownership_stamp"
      chmod 600 "$shared_ownership_stamp"
      exit 0
    fi
    if command -v sudo >/dev/null 2>&1; then
      sudo bash -lc "$(declare -f ensure_target_user); ensure_target_user"
      expected_shared_owner="$(id -u "$target_user"):$(id -g "$target_user")"
      stamp_owner="$(sudo stat -c '%u:%g' "$shared_ownership_stamp" 2>/dev/null || printf '%s' missing)"
      sudo chown "$target_user:$target_group" "$sandbox_home"
      sudo chown "$target_user:$target_group" "$local_home"
      sudo chown "$target_user:$target_group" "$shared_home"
      if [ "$stamp_owner" != "$expected_shared_owner" ]; then
        sudo chown -R "$target_user:$target_group" "$shared_home"
      fi
      sudo touch "$shared_ownership_stamp"
      sudo chown "$target_user:$target_group" "$shared_ownership_stamp"
      sudo chmod 600 "$shared_ownership_stamp"
      exit 0
    fi
  `;
  const prepareResult = await args.sandbox.process.executeCommand(
    `bash -lc ${quoteForShell(prepareScript)}`,
    undefined,
    undefined,
    timeoutSeconds,
  );
  if (prepareResult.exitCode !== 0) {
    throw new Error(
      prepareResult.result.trim() ||
        "Failed to prepare the projected Codex home in the sandbox.",
    );
  }

  const projectScript = stripIndent`
    set -e
    local_home=${quoteForShell(DAYTONA_CODEX_HOME)}
    shared_home=${quoteForShell(DAYTONA_CODEX_SHARED_HOME)}
    write_file_copy() {
      source_path="$1"
      target_path="$2"
      mkdir -p "$(dirname "$target_path")"
      rm -f "$target_path"
      umask 077
      cat "$source_path" > "$target_path"
    }
    for dir_name in ${DAYTONA_CODEX_LOCAL_DIRS.map((value) => quoteForShell(value)).join(" ")}; do
      local_path="$local_home/$dir_name"
      if [ -L "$local_path" ] || [ -f "$local_path" ]; then
        rm -rf "$local_path"
      fi
      mkdir -p "$local_path"
    done
    mkdir -p "$shared_home/memories"
    for entry_name in ${DAYTONA_CODEX_SHARED_ENTRY_NAMES.map((value) => quoteForShell(value)).join(" ")}; do
      local_path="$local_home/$entry_name"
      shared_path="$shared_home/$entry_name"
      if [ -e "$local_path" ] && [ ! -L "$local_path" ]; then
        if [ -d "$local_path" ]; then
          mkdir -p "$shared_path"
          cp -a "$local_path"/. "$shared_path"/
        else
          cp -f "$local_path" "$shared_path"
        fi
        rm -rf "$local_path"
      fi
      if [ -L "$local_path" ]; then
        linked_target="$(readlink "$local_path" || true)"
        if [ "$linked_target" != "$shared_path" ]; then
          rm -f "$local_path"
        fi
      fi
      if [ ! -e "$local_path" ] && [ ! -L "$local_path" ]; then
        ln -s "$shared_path" "$local_path"
      fi
    done
    for file_name in ${DAYTONA_CODEX_LOCAL_SYNCED_FILE_NAMES.map((value) => quoteForShell(value)).join(" ")}; do
      local_path="$local_home/$file_name"
      shared_path="$shared_home/$file_name"
      if [ -L "$local_path" ] || [ -d "$local_path" ]; then
        rm -rf "$local_path"
      fi
      if [ -d "$shared_path" ]; then
        rm -rf "$shared_path"
      fi
      if [ -f "$shared_path" ] && { [ ! -f "$local_path" ] || [ "$shared_path" -nt "$local_path" ]; }; then
        write_file_copy "$shared_path" "$local_path"
      fi
      if [ -f "$local_path" ] && { [ ! -f "$shared_path" ] || [ "$local_path" -nt "$shared_path" ]; }; then
        write_file_copy "$local_path" "$shared_path"
      fi
      if [ -f "$local_path" ] && [ ! -w "$local_path" ]; then
        echo "__NOTER_CODEX_LOCAL_FILE_NOT_WRITABLE__:$local_path"
        exit 1
      fi
    done
    for local_path in "$local_home" "$local_home/tmp" "$local_home/log"; do
      if [ ! -w "$local_path" ]; then
        echo "__NOTER_CODEX_LOCAL_HOME_NOT_WRITABLE__:$local_path"
        exit 1
      fi
    done
    probe_path="$local_home/tmp/.noter-write-check"
    : > "$probe_path"
    rm -f "$probe_path"
  `;
  const projectResult = await executeCommandAsSandboxUser({
    sandbox: args.sandbox,
    command: projectScript,
    timeoutSeconds,
  });
  if (projectResult.exitCode !== 0) {
    throw new Error(
      projectResult.result.trim() ||
        "Failed to project the shared Codex home into a writable local home.",
    );
  }
}

export async function syncCodexConfigToSharedInSandbox(args: {
  sandbox: Sandbox;
  timeoutSeconds?: number;
}): Promise<void> {
  const timeoutSeconds = args.timeoutSeconds ?? DEFAULT_REPAIR_TIMEOUT_SECONDS;
  const syncScript = stripIndent`
    set -e
    local_path=${quoteForShell(`${DAYTONA_CODEX_HOME}/config.toml`)}
    shared_path=${quoteForShell(`${DAYTONA_CODEX_SHARED_HOME}/config.toml`)}
    if [ -L "$local_path" ]; then
      exit 0
    fi
    if [ ! -f "$local_path" ]; then
      exit 0
    fi
    mkdir -p "$(dirname "$shared_path")"
    rm -f "$shared_path"
    umask 077
    cat "$local_path" > "$shared_path"
  `;
  const result = await executeCommandAsSandboxUser({
    sandbox: args.sandbox,
    command: syncScript,
    timeoutSeconds,
  });
  if (result.exitCode !== 0) {
    throw new Error(
      result.result.trim() ||
        "Failed to sync Codex config back to the shared Daytona volume.",
    );
  }
}

export async function ensureSandboxPreferredInteractiveShell(args: {
  sandbox: Sandbox;
  timeoutSeconds?: number;
}): Promise<void> {
  const timeoutSeconds = args.timeoutSeconds ?? DEFAULT_REPAIR_TIMEOUT_SECONDS;
  const command = buildEnsureSandboxPreferredInteractiveShellCommand();
  const result = await args.sandbox.process.executeCommand(
    command,
    undefined,
    undefined,
    timeoutSeconds,
  );
  if (result.exitCode !== 0) {
    if (
      result.result.includes("__NOTER_INTERACTIVE_SHELL_PRIVILEGE_MISSING__")
    ) {
      throw new Error(
        "Failed to set the preferred interactive shell because this sandbox cannot elevate privileges.",
      );
    }
    throw new Error(
      result.result.trim() ||
        "Failed to set the preferred interactive shell in the sandbox.",
    );
  }
}

export function buildVerifySandboxFishToolingCommand(): string {
  return stripIndent`
    if ! command -v fish >/dev/null 2>&1; then
      echo "__NOTER_FISH_MISSING__"
      exit 1
    fi
    config_home="$HOME/.config/fish"
    test -f "$config_home/functions/fisher.fish"
    test -f "$config_home/conf.d/_pure_init.fish"
    test -f "$config_home/conf.d/pure.fish"
    test -f "$config_home/functions/fish_prompt.fish"
  `;
}

export function buildEnsureSandboxFishToolingCommand(): string {
  const verifyCommand = buildVerifySandboxFishToolingCommand();
  return stripIndent`
    set -e
    if ! command -v fish >/dev/null 2>&1; then
      echo "__NOTER_FISH_MISSING__"
      exit 1
    fi
    config_home="$HOME/.config/fish"
    mkdir -p "$config_home/functions" "$config_home/completions" "$config_home/conf.d" "$HOME/.cache" "$HOME/.local/share"
    fisher_path="$config_home/functions/fisher.fish"
    fisher_url=${quoteForShell(DAYTONA_FISHER_URL)}
    pure_tarball_url=${quoteForShell(DAYTONA_PURE_TARBALL_URL)}
    pure_archive_root=${quoteForShell(DAYTONA_PURE_ARCHIVE_ROOT)}
    if [ ! -f "$fisher_path" ]; then
      curl -fsSL "$fisher_url" -o "$fisher_path"
    fi
    if (
      ${verifyCommand}
    ) >/dev/null 2>&1; then
      exit 0
    fi
    temp_dir="$(mktemp -d)"
    tarball_path="$temp_dir/pure.tar.gz"
    pure_root="$temp_dir/$pure_archive_root"
    curl -fsSL "$pure_tarball_url" -o "$tarball_path"
    tar -xzf "$tarball_path" -C "$temp_dir"
    if [ ! -d "$pure_root/conf.d" ] || [ ! -d "$pure_root/functions" ]; then
      echo "__NOTER_PURE_ARCHIVE_INVALID__"
      exit 1
    fi
    cp -f "$pure_root/conf.d/"*.fish "$config_home/conf.d/"
    cp -f "$pure_root/functions/"*.fish "$config_home/functions/"
    rm -rf "$temp_dir"
    ${verifyCommand}
  `;
}

export function buildEnsureSandboxPreferredInteractiveShellCommand(): string {
  const ensureScript = stripIndent`
    set -e
    run_privileged() {
      if [ "$(id -u)" = "0" ]; then
        "$@"
        return 0
      fi
      if command -v sudo >/dev/null 2>&1; then
        sudo "$@"
        return 0
      fi
      echo "__NOTER_INTERACTIVE_SHELL_PRIVILEGE_MISSING__"
      exit 1
    }
    if ! command -v fish >/dev/null 2>&1; then
      exit 0
    fi
    target_shell="$(command -v fish)"
    ensure_user_shell() {
      target_user="$1"
      target_group="$2"
      current_shell="$(grep "^${"$"}target_user:" /etc/passwd | cut -d: -f7 | head -n 1 || true)"
      if [ -n "$current_shell" ]; then
        if [ "$current_shell" != "$target_shell" ]; then
          run_privileged usermod -s "$target_shell" "$target_user"
        fi
        return 0
      fi
      if [ "$target_user" = "root" ]; then
        return 0
      fi
      run_privileged groupadd -f "$target_group"
      run_privileged useradd -m -s "$target_shell" -g "$target_group" "$target_user"
    }
    ensure_user_home_dirs() {
      target_user="$1"
      target_group="$2"
      target_home="$3"
      run_privileged mkdir -p "$target_home" "$target_home/.config/fish" "$target_home/.cache" "$target_home/.local/share"
      run_privileged chown "$target_user:$target_group" "$target_home"
      run_privileged chown -R "$target_user:$target_group" "$target_home/.config" "$target_home/.cache" "$target_home/.local"
    }
    ensure_user_shell root root
    ensure_user_home_dirs root root /root
    ensure_user_shell ${quoteForShell(DAYTONA_SANDBOX_USER)} ${quoteForShell(DAYTONA_SANDBOX_GROUP)}
    ensure_user_home_dirs ${quoteForShell(DAYTONA_SANDBOX_USER)} ${quoteForShell(DAYTONA_SANDBOX_GROUP)} ${quoteForShell(DAYTONA_SANDBOX_HOME)}
  `;
  return `bash -lc ${quoteForShell(ensureScript)}`;
}

export function buildSwitchPtySessionToSandboxUserInput(args: {
  cwd: string;
}): string {
  return buildRunPtySessionAsSandboxUserInput(args);
}

export function buildRunPtySessionAsSandboxUserInput(args: {
  cwd: string;
  command?: string;
}): string {
  const sandboxUserCommand =
    args.command && args.command.trim().length > 0
      ? `cd ${quoteForShell(args.cwd)} && exec ${quoteForShell(
          DAYTONA_FALLBACK_INTERACTIVE_SHELL,
        )} -lc ${quoteForShell(args.command)}`
      : null;
  const handoffCommand = [
    `target_cwd=${quoteForShell(args.cwd)}`,
    `target_shell=${quoteForShell(DAYTONA_PREFERRED_INTERACTIVE_SHELL)}`,
    `if [ ! -x "$target_shell" ]; then target_shell=${quoteForShell(DAYTONA_FALLBACK_INTERACTIVE_SHELL)}; fi`,
    sandboxUserCommand
      ? `target_command=${quoteForShell(sandboxUserCommand)}`
      : null,
    sandboxUserCommand
      ? `exec env HOME=${quoteForShell(DAYTONA_SANDBOX_HOME)} USER=${quoteForShell(DAYTONA_SANDBOX_USER)} LOGNAME=${quoteForShell(DAYTONA_SANDBOX_USER)} CODEX_HOME=${quoteForShell(DAYTONA_CODEX_HOME)} SHELL="$target_shell" XDG_CONFIG_HOME=${quoteForShell(`${DAYTONA_SANDBOX_HOME}/.config`)} XDG_CACHE_HOME=${quoteForShell(`${DAYTONA_SANDBOX_HOME}/.cache`)} XDG_DATA_HOME=${quoteForShell(`${DAYTONA_SANDBOX_HOME}/.local/share`)} su -m -s "$target_shell" ${quoteForShell(DAYTONA_SANDBOX_USER)} -c "$target_command"`
      : `cd "$target_cwd" && exec env HOME=${quoteForShell(DAYTONA_SANDBOX_HOME)} USER=${quoteForShell(DAYTONA_SANDBOX_USER)} LOGNAME=${quoteForShell(DAYTONA_SANDBOX_USER)} CODEX_HOME=${quoteForShell(DAYTONA_CODEX_HOME)} SHELL="$target_shell" XDG_CONFIG_HOME=${quoteForShell(`${DAYTONA_SANDBOX_HOME}/.config`)} XDG_CACHE_HOME=${quoteForShell(`${DAYTONA_SANDBOX_HOME}/.cache`)} XDG_DATA_HOME=${quoteForShell(`${DAYTONA_SANDBOX_HOME}/.local/share`)} su -m -s "$target_shell" ${quoteForShell(DAYTONA_SANDBOX_USER)}`,
  ]
    .filter((value): value is string => value !== null)
    .join("; ");

  return `exec ${quoteForShell(DAYTONA_FALLBACK_INTERACTIVE_SHELL)} -lc ${quoteForShell(handoffCommand)}\n`;
}
