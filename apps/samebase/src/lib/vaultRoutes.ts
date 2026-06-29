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
  appRoot: string;
}): string {
  const basePath = `/vault/${args.owner}/${args.repoName}/db/${encodeVaultBranchSegment(args.branch)}`;

  if (args.appRoot === ".") {
    return `${basePath}/root`;
  }

  return `${basePath}/mono/${encodeVaultPathTail(args.appRoot)}`;
}

export interface VaultCodespaceChatRouteArgs {
  repositoryFullName: string;
  branch: string;
}

export function buildVaultCodespaceChatRoute(args: VaultCodespaceChatRouteArgs): string {
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
  isInvalidVaultRoute?: boolean;
}

export interface ParsedVaultDatabasePathContext {
  owner?: string;
  repositoryFullName?: string;
  repoName?: string;
  branch?: string;
  appRoot?: string;
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

  if (routeKind === "codespace" && segments.length === 6 && segments[5] === "chat") {
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
    isCodespaceChatRoute: false,
  };
}

export function parseVaultDatabasePathContext(pathname: string): ParsedVaultDatabasePathContext {
  const segments = pathname.split("/").filter((segment) => segment.length > 0);
  if (segments.length < 6 || segments[0] !== "vault") {
    return {};
  }

  const owner = decodeRouteSegmentSafe(segments[1]);
  const repoName = decodeRouteSegmentSafe(segments[2]);
  if (owner.length === 0 || repoName.length === 0 || segments[3] !== "db") {
    return {};
  }

  const repositoryFullName = `${owner}/${repoName}`;
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
  const appRootKind = segments[5];

  if (appRootKind === "root" && segments.length === 6) {
    return {
      owner,
      repositoryFullName,
      repoName,
      branch,
      appRoot: ".",
    };
  }

  if (appRootKind === "mono" && segments.length > 6) {
    return {
      owner,
      repositoryFullName,
      repoName,
      branch,
      appRoot: segments
        .slice(6)
        .map((segment) => decodeRouteSegmentSafe(segment))
        .join("/"),
    };
  }

  return {
    owner,
    repositoryFullName,
    repoName,
    branch,
    isInvalidVaultRoute: true,
  };
}
