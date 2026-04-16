export function decodeRouteSegmentSafe(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function encodeRepositoryRefSegment(ref: string): string {
  return encodeURIComponent(ref);
}

function encodeRepositoryFilePath(filePath: string): string {
  return filePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function buildRepositoryFileRoute(args: {
  routePrefix: "/vault" | "/p";
  owner: string;
  repoName: string;
  ref: string;
  filePath?: string;
}): string {
  const basePath = `${args.routePrefix}/${args.owner}/${args.repoName}/${encodeRepositoryRefSegment(args.ref)}`;

  if (!args.filePath || args.filePath.length === 0) {
    return basePath;
  }

  return `${basePath}/${encodeRepositoryFilePath(args.filePath)}`;
}

function parseRepositoryFilePathContext(args: {
  pathname: string;
  routePrefix: "vault" | "p";
}): {
  owner?: string;
  repositoryFullName?: string;
  repoName?: string;
  ref?: string;
  filePath?: string;
} {
  const segments = args.pathname
    .split("/")
    .filter((segment) => segment.length > 0);
  if (segments.length < 3 || segments[0] !== args.routePrefix) {
    return {};
  }

  const owner = decodeRouteSegmentSafe(segments[1]);
  const repoName = decodeRouteSegmentSafe(segments[2]);
  if (owner.length === 0 || repoName.length === 0) {
    return {};
  }

  const repositoryFullName = `${owner}/${repoName}`;
  const encodedRef = segments[3];
  if (!encodedRef) {
    return { owner, repositoryFullName, repoName };
  }

  const ref = decodeRouteSegmentSafe(encodedRef);
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
    ref,
    filePath,
  };
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
  return buildRepositoryFileRoute({
    routePrefix: "/vault",
    owner: args.owner,
    repoName: args.repoName,
    ref: args.branch,
    filePath: args.filePath,
  });
}

/**
 * Build the shipped `/p/...` public file route so published links keep the
 * exact same transparent owner/repo/ref/path contract as the private editor.
 */
export function buildPublishedFileRoute(args: {
  owner: string;
  repoName: string;
  ref: string;
  filePath: string;
}): string {
  return buildRepositoryFileRoute({
    routePrefix: "/p",
    owner: args.owner,
    repoName: args.repoName,
    ref: args.ref,
    filePath: args.filePath,
  });
}

export interface VaultCodespaceChatRouteArgs {
  repositoryFullName: string;
  branch: string;
}

export function buildVaultCodespaceChatRoute(
  args: VaultCodespaceChatRouteArgs,
): string {
  return `/vault/${args.repositoryFullName}/codespace/${encodeRepositoryRefSegment(args.branch)}/chat`;
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
  const parsedContext = parseRepositoryFilePathContext({
    pathname,
    routePrefix: "vault",
  });
  const segments = pathname.split("/").filter((segment) => segment.length > 0);
  if (
    !parsedContext.owner ||
    !parsedContext.repositoryFullName ||
    !parsedContext.repoName
  ) {
    return {};
  }

  const routeKind = segments[3];

  if (!routeKind) {
    return {
      owner: parsedContext.owner,
      repositoryFullName: parsedContext.repositoryFullName,
      repoName: parsedContext.repoName,
    };
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
      owner: parsedContext.owner,
      repositoryFullName: parsedContext.repositoryFullName,
      repoName: parsedContext.repoName,
      branch,
      isCodespaceChatRoute: true,
    };
  }

  return {
    owner: parsedContext.owner,
    repositoryFullName: parsedContext.repositoryFullName,
    repoName: parsedContext.repoName,
    branch: parsedContext.ref,
    filePath: parsedContext.filePath,
    isCodespaceChatRoute: false,
  };
}

export interface ParsedPublishedPathContext {
  owner?: string;
  repositoryFullName?: string;
  repoName?: string;
  ref?: string;
  filePath?: string;
}

export function parsePublishedPathContext(
  pathname: string,
): ParsedPublishedPathContext {
  return parseRepositoryFilePathContext({
    pathname,
    routePrefix: "p",
  });
}
