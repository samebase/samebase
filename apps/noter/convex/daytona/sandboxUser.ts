"use node";

import type { Sandbox } from "@daytonaio/sdk";

export const DAYTONA_WORKSPACE_DIR = "/home/daytona/workspace";
export const DAYTONA_SANDBOX_USER = "daytona";
export const DAYTONA_SANDBOX_GROUP = "daytona";
export const DAYTONA_SANDBOX_HOME = "/home/daytona";
export const DAYTONA_CODEX_HOME = `${DAYTONA_SANDBOX_HOME}/.codex`;
export const DAYTONA_CODEX_SHARED_HOME = `${DAYTONA_SANDBOX_HOME}/.codex-shared`;

const DEFAULT_REPAIR_TIMEOUT_SECONDS = 300;
const DAYTONA_CODEX_LOCAL_DIRS = ["tmp", "log"] as const;
const DAYTONA_CODEX_SHARED_ENTRY_NAMES = [
  "auth.json",
  "config.toml",
  "memories",
] as const;

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
      chown "$target_user:$target_group" "$sandbox_home"
      chown "$target_user:$target_group" "$local_home"
      exit 0
    fi
    if command -v sudo >/dev/null 2>&1; then
      sudo bash -lc "$(declare -f ensure_target_user); ensure_target_user"
      sudo chown "$target_user:$target_group" "$sandbox_home"
      sudo chown "$target_user:$target_group" "$local_home"
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

export function buildSwitchPtySessionToSandboxUserInput(args: {
  cwd: string;
}): string {
  const cwd = args.cwd.trim();
  const userShellCommand = stripIndent`
    export HOME=${quoteForShell(DAYTONA_SANDBOX_HOME)}
    export USER=${quoteForShell(DAYTONA_SANDBOX_USER)}
    export LOGNAME=${quoteForShell(DAYTONA_SANDBOX_USER)}
    export CODEX_HOME=${quoteForShell(DAYTONA_CODEX_HOME)}
    if [ -n ${quoteForShell(cwd)} ]; then
      cd ${quoteForShell(cwd)}
    fi
    exec bash -i
  `;
  const rootShellCommand = stripIndent`
    target_user=${quoteForShell(DAYTONA_SANDBOX_USER)}
    target_cwd=${quoteForShell(cwd)}
    if [ -n "$target_cwd" ] && [ ! -d "$target_cwd" ]; then
      echo "__NOTER_CWD_MISSING__:$target_cwd"
      exit 1
    fi
    if [ "$(id -un)" = "$target_user" ]; then
      ${userShellCommand}
    fi
    exec su -m -s /bin/bash "$target_user" -c ${quoteForShell(userShellCommand)}
  `;
  return `${rootShellCommand}\n`;
}
