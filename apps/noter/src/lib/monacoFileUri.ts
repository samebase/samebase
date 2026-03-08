function encodeUriPathSegments(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export interface MonacoFileUriArgs {
  vaultId: string;
  branch: string;
  filePath: string;
}

export function buildMonacoFileUri(args: MonacoFileUriArgs): string {
  return `file:///${encodeURIComponent(args.vaultId)}/${encodeURIComponent(args.branch)}/${encodeUriPathSegments(args.filePath)}`;
}
