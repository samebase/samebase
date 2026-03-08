import { type GithubTreeType } from "convex/schema";

export function resolveLegacyBranchlessFilePath(args: {
  branchSegment?: string;
  selectedFile: string;
  selectedFileExistsInTree: boolean;
  tree: GithubTreeType[];
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
