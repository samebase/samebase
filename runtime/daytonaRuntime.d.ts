export type DaytonaRuntimeManifest = {
  baseImage: string
  workspaceDir: string
  repoName: string
  pnpmVersion: string
  codexCliVersion: string
  aptPackages: readonly string[]
}

export const daytonaRuntimeManifest: DaytonaRuntimeManifest

export function renderDaytonaRuntimeAptPackageList(
  manifest?: DaytonaRuntimeManifest,
): string

export function renderDaytonaRuntimeInstallPackagesRunCommand(
  manifest?: DaytonaRuntimeManifest,
): string

export function renderDaytonaCorepackPnpmRunCommand(
  manifest?: DaytonaRuntimeManifest,
): string

export function renderDaytonaCodexInstallRunCommand(
  manifest?: DaytonaRuntimeManifest,
): string

export function renderDaytonaAuthFallbackDockerfileCommands(
  manifest?: DaytonaRuntimeManifest,
): readonly string[]

export function renderDaytonaPrebuildDockerfileCommands(
  manifest?: DaytonaRuntimeManifest,
): readonly string[]

export function renderDaytonaRuntimeGeneratedTsModule(
  manifest?: DaytonaRuntimeManifest,
): string

export function renderDaytonaSandboxProgramsGeneratedTsModule(): string

export function renderDockerfileDaytonaDeps(
  manifest?: DaytonaRuntimeManifest,
): string
