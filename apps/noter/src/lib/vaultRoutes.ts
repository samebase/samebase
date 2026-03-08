export function decodeRouteSegmentSafe(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function encodeVaultBranchSegment(branch: string): string {
  return encodeURIComponent(branch);
}

export function buildVaultCodespaceChatRoute(args: {
  repositoryFullName: string;
  branch: string;
}): string {
  return `/vault/${args.repositoryFullName}/codespace/${encodeVaultBranchSegment(args.branch)}/chat`;
}

export function isChatOnlyCodespaceRoute(pathname: string): boolean {
  return /^\/vault\/[^/]+\/[^/]+\/codespace\/[^/]+\/chat\/?$/.test(pathname);
}

type ParsedVaultPathContext = {
  repositoryFullName?: string;
  branch?: string;
  filePath?: string;
};

export function parseVaultPathContext(
  pathname: string,
): ParsedVaultPathContext {
  const segments = pathname.split("/").filter((segment) => segment.length > 0);
  if (segments.length < 3 || segments[0] !== "vault") {
    return {};
  }

  const owner = decodeRouteSegmentSafe(segments[1]);
  const repoName = decodeRouteSegmentSafe(segments[2]);
  if (owner.length === 0 || repoName.length === 0) {
    return {};
  }

  const repositoryFullName = `${owner}/${repoName}`;
  const routeKind = segments[3];

  if (!routeKind) {
    return { repositoryFullName };
  }

  if (
    routeKind === "codespace" &&
    segments.length === 6 &&
    segments[5] === "chat"
  ) {
    const encodedBranch = segments[4];
    const branch =
      typeof encodedBranch === "string" && encodedBranch.length > 0
        ? decodeRouteSegmentSafe(encodedBranch)
        : undefined;
    return { repositoryFullName, branch };
  }

  const branch = decodeRouteSegmentSafe(routeKind);
  const filePath =
    segments.length > 4
      ? segments
          .slice(4)
          .map((segment) => decodeRouteSegmentSafe(segment))
          .join("/")
      : undefined;

  return {
    repositoryFullName,
    branch,
    filePath,
  };
}
