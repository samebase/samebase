/**
 * GitHub tree/blob URLs keep slash-delimited path structure while encoding each
 * segment so branch and file names with spaces or symbols remain valid links.
 */
export function encodeGitHubPath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function buildGitHubRepositoryAppInstallationsUrl(args: {
  githubRepositoryFullName: string;
}): string {
  return `https://github.com/${encodeGitHubPath(args.githubRepositoryFullName)}/settings/installations`;
}
