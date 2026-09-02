function encodeUriPathSegments(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export interface MonacoFileUriArgs {
  repositoryId: string;
  branch: string;
  filePath: string;
}

export function buildMonacoFileUri(args: MonacoFileUriArgs): string {
  return `file:///${encodeURIComponent(args.repositoryId)}/${encodeURIComponent(args.branch)}/${encodeUriPathSegments(args.filePath)}`;
}
