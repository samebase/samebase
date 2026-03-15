import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * @typedef {{
 *   baseImage: string;
 *   workspaceDir: string;
 *   repoName: string;
 *   pnpmVersion: string;
 *   codexCliVersion: string;
 *   aptPackages: readonly string[];
 *   defaultShell: {
 *     name: string;
 *     users: readonly string[];
 *   };
 * }} DaytonaRuntimeManifest
 */

const runtimeModulePath = fileURLToPath(import.meta.url)
const runtimeModuleDir = path.dirname(runtimeModulePath)
const repoRoot = path.resolve(runtimeModuleDir, '..')
const ensureRepoAutoCdProgramPath = path.join(
  repoRoot,
  'runtime/daytonaSandboxPrograms/ensureRepoAutoCd.js',
)

export const daytonaRuntimeSourcePath = path
  .relative(repoRoot, runtimeModulePath)
  .split(path.sep)
  .join('/')
const daytonaEnsureRepoAutoCdProgramSourcePath = path
  .relative(repoRoot, ensureRepoAutoCdProgramPath)
  .split(path.sep)
  .join('/')

/** @type {DaytonaRuntimeManifest} */
export const daytonaRuntimeManifest = {
  baseImage: 'mcr.microsoft.com/devcontainers/javascript-node:24-bookworm',
  workspaceDir: '/home/daytona/workspace',
  repoName: 'noter',
  pnpmVersion: '9.15.0',
  codexCliVersion: '0.114.0',
  aptPackages: ['fish', 'make', 'tmux'],
  defaultShell: {
    name: 'fish',
    users: ['root', 'daytona'],
  },
}
export const DAYTONA_FISH_ASSETS_IMAGE_PATH = '/tmp/noter-daytona-fish-assets'

/**
 * @param {readonly string[]} values
 * @returns {string}
 */
function renderStringArrayLiteral(values) {
  return values.map(value => JSON.stringify(value)).join(', ')
}

/**
 * @param {string} value
 * @returns {string}
 */
export function renderTemplateLiteralString(value) {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${')
  return `\`${escaped}\``
}

export function renderDaytonaRuntimeAptPackageList(
  manifest = daytonaRuntimeManifest,
) {
  return manifest.aptPackages.join(' ')
}

export function renderDaytonaRuntimeInstallPackagesRunCommand(
  manifest = daytonaRuntimeManifest,
) {
  return `RUN apt-get update && apt-get install -y --no-install-recommends ${renderDaytonaRuntimeAptPackageList(
    manifest,
  )} && rm -rf /var/lib/apt/lists/*`
}

export function renderDaytonaSetDefaultShellImageCommand(
  manifest = daytonaRuntimeManifest,
) {
  const shellName = manifest.defaultShell.name
  const shellPathVar = `${shellName}_path`
  const shellPathReference = `"$${shellPathVar}"`
  const shellSetupParts = [
    `${shellPathVar}="$(command -v ${shellName})"`,
    ...manifest.defaultShell.users.map(user =>
      user === 'root'
        ? `usermod -s ${shellPathReference} root`
        : `if id -u ${user} >/dev/null 2>&1; then usermod -s ${shellPathReference} ${user}; else groupadd -f ${user} && useradd -m -s ${shellPathReference} -g ${user} ${user}; fi`,
    ),
  ]
  return shellSetupParts.join(' && ')
}

export function renderDaytonaSetDefaultShellRunCommand(
  manifest = daytonaRuntimeManifest,
) {
  return `RUN ${renderDaytonaSetDefaultShellImageCommand(manifest)}`
}

export function renderDaytonaCorepackPnpmRunCommand(
  manifest = daytonaRuntimeManifest,
) {
  return `RUN corepack enable && corepack prepare pnpm@${manifest.pnpmVersion} --activate`
}

export function renderDaytonaInstallFishToolingScript(
  _manifest = daytonaRuntimeManifest,
) {
  return [
    'set -e',
    'if ! command -v fish >/dev/null 2>&1; then',
    '  echo "__NOTER_FISH_MISSING__"',
    '  exit 1',
    'fi',
    `assets_root=${JSON.stringify(DAYTONA_FISH_ASSETS_IMAGE_PATH)}`,
    'if [ ! -d "$assets_root" ]; then',
    '  echo "__NOTER_FISH_ASSETS_MISSING__"',
    '  exit 1',
    'fi',
    'ensure_fish_home_dirs() {',
    '  target_home="$1"',
    '  target_owner="$2"',
    '  target_group="$3"',
    '  mkdir -p "$target_home" "$target_home/.config/fish/functions" "$target_home/.config/fish/completions" "$target_home/.config/fish/conf.d" "$target_home/.cache" "$target_home/.local/share"',
    '  chown "$target_owner:$target_group" "$target_home"',
    '  chown -R "$target_owner:$target_group" "$target_home/.config" "$target_home/.cache" "$target_home/.local"',
    '}',
    'install_fish_tooling() {',
    '  target_home="$1"',
    '  target_owner="$2"',
    '  target_group="$3"',
    '  ensure_fish_home_dirs "$target_home" "$target_owner" "$target_group"',
    '  cp "$assets_root/fisher/functions/fisher.fish" "$target_home/.config/fish/functions/fisher.fish"',
    '  cp "$assets_root/fisher/completions/fisher.fish" "$target_home/.config/fish/completions/fisher.fish"',
    '  cp -R "$assets_root/pure/conf.d/." "$target_home/.config/fish/conf.d/"',
    '  cp -R "$assets_root/pure/functions/." "$target_home/.config/fish/functions/"',
    '  chown -R "$target_owner:$target_group" "$target_home/.config" "$target_home/.cache" "$target_home/.local"',
    '}',
    'verify_fish_tooling() {',
    '  target_user="$1"',
    '  target_home="$2"',
    '  if [ "$target_user" = "root" ]; then',
    `    HOME="$target_home" XDG_CONFIG_HOME="$target_home/.config" XDG_CACHE_HOME="$target_home/.cache" XDG_DATA_HOME="$target_home/.local/share" fish -lc 'functions -q fisher; and test -f ~/.config/fish/conf.d/pure.fish; and test -f ~/.config/fish/functions/fish_prompt.fish'`,
    '    return 0',
    '  fi',
    `  env HOME="$target_home" USER="$target_user" LOGNAME="$target_user" XDG_CONFIG_HOME="$target_home/.config" XDG_CACHE_HOME="$target_home/.cache" XDG_DATA_HOME="$target_home/.local/share" su -m -s "$(command -v fish)" "$target_user" -c 'functions -q fisher; and test -f ~/.config/fish/conf.d/pure.fish; and test -f ~/.config/fish/functions/fish_prompt.fish'`,
    '}',
    'ensure_fish_home_dirs /root root root',
    'if id -u daytona >/dev/null 2>&1; then',
    '  ensure_fish_home_dirs /home/daytona daytona daytona',
    'fi',
    'if verify_fish_tooling root /root; then',
    '  if ! id -u daytona >/dev/null 2>&1 || verify_fish_tooling daytona /home/daytona; then',
    '    exit 0',
    '  fi',
    'fi',
    'install_fish_tooling /root root root',
    'if id -u daytona >/dev/null 2>&1; then',
    '  install_fish_tooling /home/daytona daytona daytona',
    'fi',
    'verify_fish_tooling root /root',
    'if id -u daytona >/dev/null 2>&1; then',
    '  verify_fish_tooling daytona /home/daytona',
    'fi',
  ].join('\n')
}

export function renderDaytonaInstallFishToolingRunCommand(
  manifest = daytonaRuntimeManifest,
) {
  return `RUN <<'EOF'\n${renderDaytonaInstallFishToolingScript(manifest)}\nEOF`
}

export function renderDaytonaCodexInstallRunCommand(
  manifest = daytonaRuntimeManifest,
) {
  return `RUN npm install -g @openai/codex@${manifest.codexCliVersion}`
}

export function renderDaytonaAuthFallbackDockerfileCommands(
  manifest = daytonaRuntimeManifest,
) {
  return [
    renderDaytonaRuntimeInstallPackagesRunCommand(manifest),
    renderDaytonaSetDefaultShellRunCommand(manifest),
    renderDaytonaInstallFishToolingRunCommand(manifest),
    renderDaytonaCodexInstallRunCommand(manifest),
  ]
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
  ]
}

export function renderDaytonaRuntimeGeneratedTsModule(
  manifest = daytonaRuntimeManifest,
) {
  const defaultBaseImage = JSON.stringify(manifest.baseImage)
  const fishAssetsImagePath = JSON.stringify(DAYTONA_FISH_ASSETS_IMAGE_PATH)
  const pnpmVersion = JSON.stringify(manifest.pnpmVersion)
  const codexCliVersion = JSON.stringify(manifest.codexCliVersion)
  const aptPackages = `[${renderStringArrayLiteral(manifest.aptPackages)}]`
  const aptPackageList = JSON.stringify(
    renderDaytonaRuntimeAptPackageList(manifest),
  )
  const setDefaultShellImageCommand = JSON.stringify(
    renderDaytonaSetDefaultShellImageCommand(manifest),
  )
  const installPackagesRunCommand = JSON.stringify(
    renderDaytonaRuntimeInstallPackagesRunCommand(manifest),
  )
  const setDefaultShellRunCommand = JSON.stringify(
    renderDaytonaSetDefaultShellRunCommand(manifest),
  )
  const corepackPnpmRunCommand = JSON.stringify(
    renderDaytonaCorepackPnpmRunCommand(manifest),
  )
  const codexInstallRunCommand = JSON.stringify(
    renderDaytonaCodexInstallRunCommand(manifest),
  )
  const authFallbackDockerfileCommands = JSON.stringify(
    renderDaytonaAuthFallbackDockerfileCommands(manifest),
    null,
    2,
  )
  const prebuildDockerfileCommands = JSON.stringify(
    renderDaytonaPrebuildDockerfileCommands(manifest),
    null,
    2,
  )

  return `// @generated by ${daytonaRuntimeSourcePath}

export const DEFAULT_BASE_IMAGE = ${defaultBaseImage};
export const DAYTONA_FISH_ASSETS_IMAGE_PATH = ${fishAssetsImagePath};
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
`
}

export function renderDaytonaSandboxProgramsGeneratedTsModule() {
  const ensureRepoAutoCdProgramSource = renderTemplateLiteralString(
    fs.readFileSync(ensureRepoAutoCdProgramPath, 'utf8'),
  )

  return `// @generated by ${daytonaRuntimeSourcePath}
// Source file: ${daytonaEnsureRepoAutoCdProgramSourcePath}

export const DAYTONA_ENSURE_REPO_AUTO_CD_PROGRAM_SOURCE = ${ensureRepoAutoCdProgramSource};
`
}

export function renderDockerfileDaytonaDeps(manifest = daytonaRuntimeManifest) {
  const installPackagesRunCommand =
    renderDaytonaRuntimeInstallPackagesRunCommand(manifest)
  const setDefaultShellRunCommand =
    renderDaytonaSetDefaultShellRunCommand(manifest)
  const installFishToolingRunCommand =
    renderDaytonaInstallFishToolingRunCommand(manifest)
  const corepackPnpmRunCommand = renderDaytonaCorepackPnpmRunCommand(manifest)
  const codexInstallRunCommand = renderDaytonaCodexInstallRunCommand(manifest)

  return `# @generated by ${daytonaRuntimeSourcePath}
# syntax=docker/dockerfile:1.7
ARG BASE_IMAGE=${manifest.baseImage}
FROM \${BASE_IMAGE}

ARG WORKSPACE_DIR=${manifest.workspaceDir}
ARG REPO_NAME=${manifest.repoName}

WORKDIR \${WORKSPACE_DIR}/\${REPO_NAME}

${installPackagesRunCommand}
${setDefaultShellRunCommand}
COPY runtime/daytonaFishAssets ${DAYTONA_FISH_ASSETS_IMAGE_PATH}
${installFishToolingRunCommand}

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches patches
COPY apps/noter/package.json apps/noter/package.json
COPY apps/noter-starter-template/package.json apps/noter-starter-template/package.json

${corepackPnpmRunCommand}
${codexInstallRunCommand}
RUN --mount=type=cache,id=noter-pnpm-store,target=/root/.local/share/pnpm/store \\
    pnpm install --prod=false --force --node-linker=hoisted
`
}
