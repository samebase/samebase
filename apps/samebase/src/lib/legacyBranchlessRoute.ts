import { type GithubTree } from "../../convex/vault/model";

export function resolveLegacyBranchlessFilePath(args: {
  branchSegment?: string;
  selectedFile: string;
  selectedFileExistsInTree: boolean;
  tree: GithubTree[];
}): string | null {
  if (!args.branchSegment || args.selectedFile.length === 0) {
    return null;
  }
  if (args.selectedFileExistsInTree) {
    return null;
  }

  const candidatePath = `${args.branchSegment}/${args.selectedFile}`;
  const candidateExists = args.tree.some(
    (item) => item.type === "blob" && item.path === candidatePath,
  );
  return candidateExists ? candidatePath : null;
}

/**
 * Preserve the current canonical file path when a bad-branch route is
 * rewritten, but prefer the recovered legacy branchless file path when we
 * explicitly proved that older URL shape against the repository tree.
 */
export function resolveFilePathForResolvedBranch(args: {
  selectedFile: string;
  legacyBranchlessFilePath: string | null;
}): string | undefined {
  if (args.legacyBranchlessFilePath) {
    return args.legacyBranchlessFilePath;
  }

  return args.selectedFile.length > 0 ? args.selectedFile : undefined;
}
