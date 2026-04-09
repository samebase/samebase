export function decodeRouteSegmentSafe(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function encodeVaultBranchSegment(branch: string): string {
  return encodeURIComponent(branch);
}

function encodeVaultFilePath(filePath: string): string {
  return filePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

/**
 * Build the shipped `/vault/...` file route shape.
 *
 * This stays path-string based for now because TanStack `_splat` currently
 * double-encodes pre-encoded branch segments like `feature%2Flogin`, which
 * would break branch names that legitimately contain `/`.
 */
export function buildVaultFileRoute(args: {
  owner: string;
  repoName: string;
  branch: string;
  filePath?: string;
}): string {
  const basePath = `/vault/${args.owner}/${args.repoName}/${encodeVaultBranchSegment(args.branch)}`;

  if (!args.filePath || args.filePath.length === 0) {
    return basePath;
  }

  return `${basePath}/${encodeVaultFilePath(args.filePath)}`;
}

export interface VaultCodespaceChatRouteArgs {
  repositoryFullName: string;
  branch: string;
}

export function buildVaultCodespaceChatRoute(
  args: VaultCodespaceChatRouteArgs,
): string {
  return `/vault/${args.repositoryFullName}/codespace/${encodeVaultBranchSegment(args.branch)}/chat`;
}

export function isChatOnlyCodespaceRoute(pathname: string): boolean {
  return /^\/vault\/[^/]+\/[^/]+\/codespace\/[^/]+\/chat\/?$/.test(pathname);
}

export interface ParsedVaultPathContext {
  owner?: string;
  repositoryFullName?: string;
  repoName?: string;
  branch?: string;
  filePath?: string;
  isCodespaceChatRoute?: boolean;
}

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
    return { owner, repositoryFullName, repoName };
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
    return {
      owner,
      repositoryFullName,
      repoName,
      branch,
      isCodespaceChatRoute: true,
    };
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
    owner,
    repositoryFullName,
    repoName,
    branch,
    filePath,
    isCodespaceChatRoute: false,
  };
}
