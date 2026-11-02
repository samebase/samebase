export function decodeRouteSegmentSafe(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function encodeRepositoryBranchSegment(branch: string): string {
  return encodeURIComponent(branch);
}

function encodeRepositoryPathTail(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function buildRepositoryDashboardRoute(args: { owner: string; repoName: string }): string {
  return `/repo/${args.owner}/${args.repoName}`;
}

export function buildRepositorySettingsRoute(args: { owner: string; repoName: string }): string {
  return `${buildRepositoryDashboardRoute(args)}/settings`;
}

/**
 * Build the shipped `/repo/.../fs/...` file route shape.
 *
 * This stays path-string based for now because TanStack `_splat` currently
 * double-encodes pre-encoded branch segments like `feature%2Flogin`, which
 * would break branch names that legitimately contain `/`.
 */
export function buildRepositoryFileRoute(args: {
  owner: string;
  repoName: string;
  branch: string;
  filePath?: string;
}): string {
  const basePath = `/repo/${args.owner}/${args.repoName}/fs/${encodeRepositoryBranchSegment(args.branch)}`;

  if (!args.filePath || args.filePath.length === 0) {
    return basePath;
  }

  return `${basePath}/${encodeRepositoryPathTail(args.filePath)}`;
}

export function buildRepositoryDatabaseRoute(args: {
  owner: string;
  repoName: string;
  branch: string;
  convexProjectId: string;
}): string {
  return `/repo/${args.owner}/${args.repoName}/db/${encodeRepositoryBranchSegment(args.branch)}/project/${encodeURIComponent(args.convexProjectId)}`;
}

export function buildRepositoryComponentsRoute(args: {
  owner: string;
  repoName: string;
  deploymentName: string;
}): string {
  return `/repo/${args.owner}/${args.repoName}/components/${encodeURIComponent(args.deploymentName)}`;
}

export interface ParsedRepositoryPathContext {
  owner?: string;
  githubRepositoryFullName?: string;
  repoName?: string;
  branch?: string;
  filePath?: string;
  isInvalidRepositoryRoute?: boolean;
}

export function parseRepositoryPathContext(pathname: string): ParsedRepositoryPathContext {
  const segments = pathname.split("/").filter((segment) => segment.length > 0);
  if (segments.length < 3 || segments[0] !== "repo") {
    return {};
  }

  const owner = decodeRouteSegmentSafe(segments[1]);
  const repoName = decodeRouteSegmentSafe(segments[2]);
  if (owner.length === 0 || repoName.length === 0) {
    return {};
  }

  const githubRepositoryFullName = `${owner}/${repoName}`;
  const routeKind = segments[3];

  if (!routeKind) {
    return { owner, githubRepositoryFullName, repoName };
  }

  if (routeKind !== "fs") {
    return {
      owner,
      githubRepositoryFullName,
      repoName,
      isInvalidRepositoryRoute: true,
    };
  }

  const encodedBranch = segments[4];
  if (!encodedBranch || encodedBranch.length === 0) {
    return {
      owner,
      githubRepositoryFullName,
      repoName,
      isInvalidRepositoryRoute: true,
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
    githubRepositoryFullName,
    repoName,
    branch,
    filePath,
  };
}
