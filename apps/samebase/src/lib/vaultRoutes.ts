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

function encodeVaultPathTail(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function buildVaultDashboardRoute(args: { owner: string; repoName: string }): string {
  return `/vault/${args.owner}/${args.repoName}`;
}

export function buildVault2DashboardRoute(args: { owner: string; repoName: string }): string {
  return `/vault2/${args.owner}/${args.repoName}`;
}

export function buildVault2SettingsRoute(args: { owner: string; repoName: string }): string {
  return `${buildVault2DashboardRoute(args)}/settings`;
}

/**
 * Build the shipped `/vault/.../fs/...` file route shape.
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
  const basePath = `/vault/${args.owner}/${args.repoName}/fs/${encodeVaultBranchSegment(args.branch)}`;

  if (!args.filePath || args.filePath.length === 0) {
    return basePath;
  }

  return `${basePath}/${encodeVaultPathTail(args.filePath)}`;
}

export function buildVaultDatabaseRoute(args: {
  owner: string;
  repoName: string;
  branch: string;
  convexProjectId: string;
}): string {
  return `/vault/${args.owner}/${args.repoName}/db/${encodeVaultBranchSegment(args.branch)}/project/${encodeURIComponent(args.convexProjectId)}`;
}

export function buildVaultSchemaRoute(args: {
  owner: string;
  repoName: string;
  branch: string;
  convexProjectId: string;
}): string {
  return `/vault/${args.owner}/${args.repoName}/schema/${encodeVaultBranchSegment(args.branch)}/project/${encodeURIComponent(args.convexProjectId)}`;
}

export interface ParsedVaultPathContext {
  owner?: string;
  repositoryFullName?: string;
  repoName?: string;
  branch?: string;
  filePath?: string;
  isInvalidVaultRoute?: boolean;
}

export function parseVaultPathContext(pathname: string): ParsedVaultPathContext {
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

  if (routeKind !== "fs") {
    return {
      owner,
      repositoryFullName,
      repoName,
      isInvalidVaultRoute: true,
    };
  }

  const encodedBranch = segments[4];
  if (!encodedBranch || encodedBranch.length === 0) {
    return {
      owner,
      repositoryFullName,
      repoName,
      isInvalidVaultRoute: true,
    };
  }

  const branch = decodeRouteSegmentSafe(encodedBranch);
  const filePath =
    segments.length > 5
      ? segments
          .slice(5)
          .map((segment) => decodeRouteSegmentSafe(segment))
          .join("/")
      : undefined;

  return {
    owner,
    repositoryFullName,
    repoName,
    branch,
    filePath,
  };
}
