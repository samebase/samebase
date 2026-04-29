import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type DaytonaRuntimeManifest = {
  baseImage: string;
  workspaceDir: string;
  repoName: string;
  pnpmVersion: string;
  codexCliVersion: string;
  aptPackages: readonly string[];
  defaultShell: {
    name: string;
    users: readonly string[];
  };
};

const runtimeModulePath = fileURLToPath(import.meta.url);
const runtimeModuleDir = path.dirname(runtimeModulePath);
const repoRoot = path.resolve(runtimeModuleDir, "..");
const ensureRepoAutoCdProgramPath = path.join(
  repoRoot,
  "runtime/daytonaSandboxPrograms/ensureRepoAutoCd.ts",
);

export const daytonaRuntimeSourcePath = path
  .relative(repoRoot, runtimeModulePath)
  .split(path.sep)
  .join("/");
const daytonaEnsureRepoAutoCdProgramSourcePath = path
  .relative(repoRoot, ensureRepoAutoCdProgramPath)
  .split(path.sep)
  .join("/");

export const daytonaRuntimeManifest: DaytonaRuntimeManifest = {
  baseImage: "mcr.microsoft.com/devcontainers/javascript-node:24-bookworm",
  workspaceDir: "/home/daytona/workspace",
  repoName: "noter",
  pnpmVersion: "9.15.0",
  codexCliVersion: "0.114.0",
  aptPackages: ["curl", "fish", "tmux"],
  defaultShell: {
    name: "fish",
    users: ["root", "daytona"],
  },
};
export const DAYTONA_FISHER_VERSION = "4.4.8";
export const DAYTONA_PURE_VERSION = "v4.9.0";
export const DAYTONA_PURE_ARCHIVE_ROOT = "pure-4.9.0";

function renderStringArrayLiteral(values: readonly string[]): string {
  return values.map((value) => JSON.stringify(value)).join(", ");
}

export function renderTemplateLiteralString(value: string): string {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
  return `\`${escaped}\``;
}

export function renderDaytonaRuntimeAptPackageList(
  manifest = daytonaRuntimeManifest,
) {
  return manifest.aptPackages.join(" ");
}

export function renderDaytonaRuntimeInstallPackagesRunCommand(
  manifest = daytonaRuntimeManifest,
) {
  return `RUN apt-get update && apt-get install -y --no-install-recommends ${renderDaytonaRuntimeAptPackageList(
    manifest,
  )} && rm -rf /var/lib/apt/lists/*`;
}

export function renderDaytonaSetDefaultShellImageCommand(
  manifest = daytonaRuntimeManifest,
) {
  const shellName = manifest.defaultShell.name;
  const shellPathVar = `${shellName}_path`;
  const shellPathReference = `"$${shellPathVar}"`;
  const shellSetupParts = [
    `${shellPathVar}="$(command -v ${shellName})"`,
    ...manifest.defaultShell.users.map((user) =>
      user === "root"
        ? `usermod -s ${shellPathReference} root`
        : `if id -u ${user} >/dev/null 2>&1; then usermod -s ${shellPathReference} ${user}; else groupadd -f ${user} && useradd -m -s ${shellPathReference} -g ${user} ${user}; fi`,
    ),
  ];
  return shellSetupParts.join(" && ");
}

export function renderDaytonaSetDefaultShellRunCommand(
  manifest = daytonaRuntimeManifest,
) {
  return `RUN ${renderDaytonaSetDefaultShellImageCommand(manifest)}`;
}

export function renderDaytonaCorepackPnpmRunCommand(
  manifest = daytonaRuntimeManifest,
) {
  return `RUN corepack enable && corepack prepare pnpm@${manifest.pnpmVersion} --activate`;
}

export function renderDaytonaInstallFishToolingScript(
  _manifest = daytonaRuntimeManifest,
) {
  return [
    "set -e",
    "if ! command -v fish >/dev/null 2>&1; then",
    '  echo "__NOTER_FISH_MISSING__"',
    "  exit 1",
    "fi",
    `fisher_url="https://raw.githubusercontent.com/jorgebucaran/fisher/${DAYTONA_FISHER_VERSION}/functions/fisher.fish"`,
    `pure_tarball_url="https://codeload.github.com/pure-fish/pure/tar.gz/${DAYTONA_PURE_VERSION}"`,
    `pure_archive_root="${DAYTONA_PURE_ARCHIVE_ROOT}"`,
    "ensure_fish_home_dirs() {",
    '  target_home="$1"',
    '  target_owner="$2"',
    '  target_group="$3"',
    '  mkdir -p "$target_home" "$target_home/.config/fish/functions" "$target_home/.config/fish/completions" "$target_home/.config/fish/conf.d" "$target_home/.cache" "$target_home/.local/share"',
    '  chown "$target_owner:$target_group" "$target_home"',
    '  chown -R "$target_owner:$target_group" "$target_home/.config" "$target_home/.cache" "$target_home/.local"',
    "}",
    "install_fish_tooling() {",
    '  target_user="$1"',
    '  target_home="$2"',
    '  target_owner="$3"',
    '  target_group="$4"',
    '  ensure_fish_home_dirs "$target_home" "$target_owner" "$target_group"',
    '  curl -fsSL "$fisher_url" -o "$target_home/.config/fish/functions/fisher.fish"',
    '  chown -R "$target_owner:$target_group" "$target_home/.config" "$target_home/.cache" "$target_home/.local"',
    '  temp_dir="$(mktemp -d)"',
    '  tarball_path="$temp_dir/pure.tar.gz"',
    '  pure_root="$temp_dir/$pure_archive_root"',
    '  curl -fsSL "$pure_tarball_url" -o "$tarball_path"',
    '  tar -xzf "$tarball_path" -C "$temp_dir"',
    '  if [ ! -d "$pure_root/conf.d" ] || [ ! -d "$pure_root/functions" ]; then',
    '    echo "__NOTER_PURE_ARCHIVE_INVALID__"',
    "    exit 1",
    "  fi",
    '  cp -f "$pure_root/conf.d/"*.fish "$target_home/.config/fish/conf.d/"',
    '  cp -f "$pure_root/functions/"*.fish "$target_home/.config/fish/functions/"',
    '  rm -rf "$temp_dir"',
    '  chown -R "$target_owner:$target_group" "$target_home/.config" "$target_home/.cache" "$target_home/.local"',
    "}",
    "verify_fish_tooling() {",
    '  target_user="$1"',
    '  target_home="$2"',
    '  test -f "$target_home/.config/fish/functions/fisher.fish"',
    '  test -f "$target_home/.config/fish/conf.d/_pure_init.fish"',
    '  test -f "$target_home/.config/fish/conf.d/pure.fish"',
    '  test -f "$target_home/.config/fish/functions/fish_prompt.fish"',
    "}",
    "ensure_fish_home_dirs /root root root",
    "if id -u daytona >/dev/null 2>&1; then",
    "  ensure_fish_home_dirs /home/daytona daytona daytona",
    "fi",
    "if verify_fish_tooling root /root; then",
    "  if ! id -u daytona >/dev/null 2>&1 || verify_fish_tooling daytona /home/daytona; then",
    "    exit 0",
    "  fi",
    "fi",
    "install_fish_tooling root /root root root",
    "if id -u daytona >/dev/null 2>&1; then",
    "  install_fish_tooling daytona /home/daytona daytona daytona",
    "fi",
    "verify_fish_tooling root /root",
    "if id -u daytona >/dev/null 2>&1; then",
    "  verify_fish_tooling daytona /home/daytona",
    "fi",
  ].join("\n");
}

export function renderDaytonaInstallFishToolingRunCommand(
  manifest = daytonaRuntimeManifest,
) {
  return `RUN <<'EOF'\n${renderDaytonaInstallFishToolingScript(manifest)}\nEOF`;
}

export function renderDaytonaCodexInstallRunCommand(
  manifest = daytonaRuntimeManifest,
) {
  return `RUN npm install -g @openai/codex@${manifest.codexCliVersion}`;
}

export function renderDaytonaAuthFallbackDockerfileCommands(
  manifest = daytonaRuntimeManifest,
) {
  return [
    renderDaytonaRuntimeInstallPackagesRunCommand(manifest),
    renderDaytonaSetDefaultShellRunCommand(manifest),
    renderDaytonaInstallFishToolingRunCommand(manifest),
    renderDaytonaCodexInstallRunCommand(manifest),
  ];
}

export function renderDaytonaPrebuildDockerfileCommands(
  manifest = daytonaRuntimeManifest,
) {
  return [
    renderDaytonaRuntimeInstallPackagesRunCommand(manifest),
    renderDaytonaSetDefaultShellRunCommand(manifest),
    renderDaytonaInstallFishToolingRunCommand(manifest),
    renderDaytonaCorepackPnpmRunCommand(manifest),
    renderDaytonaCodexInstallRunCommand(manifest),
  ];
}

export function renderDaytonaRuntimeGeneratedTsModule(
  manifest = daytonaRuntimeManifest,
) {
  const defaultBaseImage = JSON.stringify(manifest.baseImage);
  const pnpmVersion = JSON.stringify(manifest.pnpmVersion);
  const codexCliVersion = JSON.stringify(manifest.codexCliVersion);
  const aptPackages = `[${renderStringArrayLiteral(manifest.aptPackages)}]`;
  const aptPackageList = JSON.stringify(
    renderDaytonaRuntimeAptPackageList(manifest),
  );
  const setDefaultShellImageCommand = JSON.stringify(
    renderDaytonaSetDefaultShellImageCommand(manifest),
  );
  const installPackagesRunCommand = JSON.stringify(
    renderDaytonaRuntimeInstallPackagesRunCommand(manifest),
  );
  const setDefaultShellRunCommand = JSON.stringify(
    renderDaytonaSetDefaultShellRunCommand(manifest),
  );
  const corepackPnpmRunCommand = JSON.stringify(
    renderDaytonaCorepackPnpmRunCommand(manifest),
  );
  const codexInstallRunCommand = JSON.stringify(
    renderDaytonaCodexInstallRunCommand(manifest),
  );
  const authFallbackDockerfileCommands = JSON.stringify(
    renderDaytonaAuthFallbackDockerfileCommands(manifest),
    null,
    2,
  );
  const prebuildDockerfileCommands = JSON.stringify(
    renderDaytonaPrebuildDockerfileCommands(manifest),
    null,
    2,
  );

  return `// @generated by ${daytonaRuntimeSourcePath}

export const DEFAULT_BASE_IMAGE = ${defaultBaseImage};
export const DAYTONA_PNPM_VERSION = ${pnpmVersion};
export const DAYTONA_CODEX_CLI_VERSION = ${codexCliVersion};
export const DAYTONA_RUNTIME_APT_PACKAGES = ${aptPackages} as const;
export const DAYTONA_RUNTIME_APT_PACKAGE_LIST = ${aptPackageList};
export const DAYTONA_SET_DEFAULT_SHELL_IMAGE_COMMAND = ${setDefaultShellImageCommand};
export const DAYTONA_RUNTIME_INSTALL_PACKAGES_RUN_COMMAND = ${installPackagesRunCommand};
export const DAYTONA_RUNTIME_SET_DEFAULT_SHELL_RUN_COMMAND = ${setDefaultShellRunCommand};
export const DAYTONA_RUNTIME_COREPACK_PNPM_RUN_COMMAND = ${corepackPnpmRunCommand};
export const DAYTONA_RUNTIME_CODEX_INSTALL_RUN_COMMAND = ${codexInstallRunCommand};
export const DAYTONA_RUNTIME_AUTH_FALLBACK_DOCKERFILE_COMMANDS = ${authFallbackDockerfileCommands} as const;
export const DAYTONA_RUNTIME_PREBUILD_DOCKERFILE_COMMANDS = ${prebuildDockerfileCommands} as const;
`;
}

export function renderDaytonaSandboxProgramsGeneratedTsModule() {
  const ensureRepoAutoCdProgramSource = renderTemplateLiteralString(
    fs.readFileSync(ensureRepoAutoCdProgramPath, "utf8"),
  );

  return `// @generated by ${daytonaRuntimeSourcePath}
// Source file: ${daytonaEnsureRepoAutoCdProgramSourcePath}

export const DAYTONA_ENSURE_REPO_AUTO_CD_PROGRAM_SOURCE = ${ensureRepoAutoCdProgramSource};
`;
}

export function renderDockerfileDaytonaDeps(manifest = daytonaRuntimeManifest) {
  const installPackagesRunCommand =
    renderDaytonaRuntimeInstallPackagesRunCommand(manifest);
  const setDefaultShellRunCommand =
    renderDaytonaSetDefaultShellRunCommand(manifest);
  const installFishToolingRunCommand =
    renderDaytonaInstallFishToolingRunCommand(manifest);
  const corepackPnpmRunCommand = renderDaytonaCorepackPnpmRunCommand(manifest);
  const codexInstallRunCommand = renderDaytonaCodexInstallRunCommand(manifest);

  return `# @generated by ${daytonaRuntimeSourcePath}
# syntax=docker/dockerfile:1.7
ARG BASE_IMAGE=${manifest.baseImage}
FROM \${BASE_IMAGE}

ARG WORKSPACE_DIR=${manifest.workspaceDir}
ARG REPO_NAME=${manifest.repoName}

WORKDIR \${WORKSPACE_DIR}/\${REPO_NAME}

${installPackagesRunCommand}
${setDefaultShellRunCommand}
${installFishToolingRunCommand}

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY eslint-rules/package.json eslint-rules/package.json
COPY apps/noter/package.json apps/noter/package.json

${corepackPnpmRunCommand}
${codexInstallRunCommand}
RUN --mount=type=cache,id=noter-pnpm-store,target=/root/.local/share/pnpm/store \\
    pnpm install --prod=false --force --node-linker=hoisted
`;
}
