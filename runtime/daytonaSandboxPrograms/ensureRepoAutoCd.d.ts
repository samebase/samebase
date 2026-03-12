export type EnsureRepoAutoCdArgs = {
  repoPath: string
  bashProfileFiles?: readonly string[]
  fishProfileFiles?: readonly string[]
}

export declare const DEFAULT_BASH_PROFILE_FILES: readonly string[]
export declare const DEFAULT_FISH_PROFILE_FILES: readonly string[]

export declare function ensureRepoAutoCd(
  args: EnsureRepoAutoCdArgs,
): Promise<void>
