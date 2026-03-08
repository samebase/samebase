function encodeUriPathSegments(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function buildMonacoFileUri(args: {
  vaultId: string;
  branch: string;
  filePath: string;
}): string {
  return `file:///${encodeURIComponent(args.vaultId)}/${encodeURIComponent(args.branch)}/${encodeUriPathSegments(args.filePath)}`;
}
