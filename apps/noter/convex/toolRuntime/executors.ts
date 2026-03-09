"use node";

import { Octokit } from "@octokit/rest";
import { api, internal } from "../_generated/api";
import type { ResolvedToolContext, ToolExecutionOutput } from "./types";
import {
  buildReplaceInFilePlan,
  ReplaceInFileError,
  type ReplaceInFileResolvedEdit,
} from "../agent/replaceInFile";

type ReadFileInput = {
  path: string;
};

type ListFilesInput = {
  directory?: string;
};

type EditFileInput = {
  path: string;
  content: string;
};

type ReplaceInFileReplacement = {
  oldText: string;
  newText: string;
};

type ReplaceInFileInput = {
  path: string;
  replacements: ReplaceInFileReplacement[];
};

type CreateFileInput = {
  path: string;
  content: string;
};

type DeleteFileInput = {
  path: string;
};

type ProdReadScope = "vault" | "global";
type ProdReadProvider = "convex" | "netlify" | "cloudflare";
type ProdReadResourceKind =
  | "deployment_status"
  | "logs"
  | "data_query"
  | "project_inventory"
  | "site_inventory"
  | "account_inventory"
  | "pages_project_inventory";

type AllowedDataTable =
  | "vaults"
  | "vaultInfrastructure"
  | "vaultDomains"
  | "codespaces"
  | "fileStaging"
  | "aiProdAccessRequests"
  | "aiProdAccessAudit";

type ProdReadProposalPayload = {
  type: "prod_read_proposal";
  requestId: string;
  scope: ProdReadScope;
  provider: ProdReadProvider;
  resourceKind: ProdReadResourceKind;
  toolName: string;
  paramsPreview: string;
  summary: string;
  status: "proposed";
};

const PROD_READ_PROVIDER_LABELS: Record<ProdReadProvider, string> = {
  convex: "Convex",
  netlify: "Netlify",
  cloudflare: "Cloudflare",
};

const PROD_READ_RESOURCE_LABELS: Record<ProdReadResourceKind, string> = {
  deployment_status: "deployment status",
  logs: "logs",
  data_query: "data sample",
  project_inventory: "project inventory",
  site_inventory: "site inventory",
  account_inventory: "account inventory",
  pages_project_inventory: "Pages project inventory",
};

const PROD_READ_SCOPE_LABELS: Record<ProdReadScope, string> = {
  vault: "this vault",
  global: "global scope",
};

type RequestConvexLogsReadInput = {
  maxLines?: number;
  allowRawFallback?: boolean;
};

type RequestConvexProjectsReadInput = {
  limit?: number;
  allowRawFallback?: boolean;
};

type RequestNetlifyLogsReadInput = {
  maxEntries?: number;
  allowRawFallback?: boolean;
};

type RequestNetlifyProjectsReadInput = {
  limit?: number;
  allowRawFallback?: boolean;
};

type RequestCloudflareAccountsReadInput = {
  limit?: number;
  allowRawFallback?: boolean;
};

type RequestCloudflarePagesProjectsReadInput = {
  accountId?: string;
  limit?: number;
  allowRawFallback?: boolean;
};

type RequestConvexDataReadInput = {
  table: AllowedDataTable;
  scope?: ProdReadScope;
  limit?: number;
  allowRawFallback?: boolean;
};

type StagedFile = {
  content: string;
  fileDeleted: boolean;
  filePath: string;
  initialFilePath: string;
  parentCommitSha: string | null;
  version: number;
};

type ExistingFileSnapshot = {
  content: string;
  parentCommitSha: string | null;
  isStaged: boolean;
  version: number;
  filePath: string;
};

class FileNotFoundError extends Error {
  readonly status = 404;
}

function requireVault(context: ResolvedToolContext) {
  if (context.vault === null) {
    throw new Error("Vault context is required for this tool.");
  }
  return context.vault;
}

function requireBranch(context: ResolvedToolContext): string {
  const branch =
    typeof context.branch === "string" ? context.branch.trim() : "";
  if (branch.length === 0) {
    throw new Error("Branch context is required for this tool.");
  }
  return branch;
}

function requireThreadId(context: ResolvedToolContext): string {
  const threadId =
    typeof context.threadId === "string" ? context.threadId.trim() : "";
  if (threadId.length === 0) {
    throw new Error("Thread context is required for this tool.");
  }
  return threadId;
}

function requireGithubAccessToken(context: ResolvedToolContext): string {
  if (
    typeof context.githubAccessToken !== "string" ||
    context.githubAccessToken.length === 0
  ) {
    throw new Error("GitHub connection is required for this tool.");
  }
  return context.githubAccessToken;
}

function buildProdReadSummary(args: {
  provider: ProdReadProvider;
  resourceKind: ProdReadResourceKind;
  scope: ProdReadScope;
}): string {
  const provider = PROD_READ_PROVIDER_LABELS[args.provider];
  const resource = PROD_READ_RESOURCE_LABELS[args.resourceKind];
  const scope = PROD_READ_SCOPE_LABELS[args.scope];
  return `I need your approval before reading ${provider} ${resource} for ${scope}.`;
}

function buildParamsPreview(params: Record<string, unknown>): string {
  const json = JSON.stringify(params);
  if (json.length <= 200) {
    return json;
  }
  return `${json.slice(0, 200)}...`;
}

function toGitTreeRef(branch: string): string {
  if (branch.startsWith("refs/heads/")) {
    return branch.slice("refs/".length);
  }
  if (branch.startsWith("heads/")) {
    return branch;
  }
  return `heads/${branch}`;
}

async function loadStagedFileByPath(args: {
  context: ResolvedToolContext;
  path: string;
}): Promise<StagedFile | null> {
  const byNewPath = await loadStagedFileByNewPath(args);
  if (byNewPath && !byNewPath.fileDeleted) {
    return byNewPath;
  }
  const byOriginalPath = await loadStagedFileByOriginalPath(args);
  if (!byOriginalPath) {
    return null;
  }
  if (isPathHiddenByStagingChange(byOriginalPath)) {
    return null;
  }
  return byOriginalPath;
}

async function loadStagedFileByOriginalPath(args: {
  context: ResolvedToolContext;
  path: string;
}): Promise<StagedFile | null> {
  const vault = requireVault(args.context);
  const branch = requireBranch(args.context);
  return args.context.ctx.runQuery(internal.fileStaging.getByOriginalPath, {
    vaultId: vault._id,
    originalFilePath: args.path,
    branch,
  });
}

async function loadStagedFileByNewPath(args: {
  context: ResolvedToolContext;
  path: string;
}): Promise<StagedFile | null> {
  const vault = requireVault(args.context);
  const branch = requireBranch(args.context);
  return args.context.ctx.runQuery(api.fileStaging.getByNewPath, {
    vaultId: vault._id,
    branch,
    newPath: args.path,
  });
}

function isPathHiddenByStagingChange(staging: StagedFile): boolean {
  return staging.fileDeleted || staging.filePath !== staging.initialFilePath;
}

async function isPathHiddenByStagingChangeForOriginal(args: {
  context: ResolvedToolContext;
  path: string;
}): Promise<boolean> {
  const byOriginalPath = await loadStagedFileByOriginalPath(args);
  if (!byOriginalPath) {
    return false;
  }
  return isPathHiddenByStagingChange(byOriginalPath);
}

function hasStatusCode(
  error: unknown,
  status: number,
): error is { status: number } {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    error.status === status
  );
}

function createFileNotFoundError(message: string): FileNotFoundError {
  return new FileNotFoundError(message);
}

async function repositoryTreeContainsPath(args: {
  context: ResolvedToolContext;
  path: string;
}): Promise<boolean> {
  const vault = requireVault(args.context);
  const branch = requireBranch(args.context);
  const branchTree = await args.context.ctx.runQuery(
    internal.vault.getVaultBranchTree,
    {
      vaultId: vault._id,
      branch,
    },
  );
  const tree = branchTree?.treeData.tree ?? [];
  return tree.some(
    (entry) => entry.type === "blob" && entry.path === args.path,
  );
}

async function assertCreateFilePathIsAvailable(args: {
  context: ResolvedToolContext;
  path: string;
}): Promise<void> {
  const byOriginalPath = await loadStagedFileByOriginalPath(args);
  if (byOriginalPath) {
    throw new Error(
      `create_file failed: ${args.path} already exists; use edit_file`,
    );
  }
  const byCurrentPath = await loadStagedFileByNewPath(args);
  if (byCurrentPath && !byCurrentPath.fileDeleted) {
    throw new Error(
      `create_file failed: ${args.path} already exists; use edit_file`,
    );
  }
  if (await repositoryTreeContainsPath(args)) {
    throw new Error(
      `create_file failed: ${args.path} already exists; use edit_file`,
    );
  }
}

async function loadExistingFileSnapshot(args: {
  context: ResolvedToolContext;
  path: string;
}): Promise<ExistingFileSnapshot> {
  const vault = requireVault(args.context);
  const branch = requireBranch(args.context);
  const staging = await loadStagedFileByPath({
    context: args.context,
    path: args.path,
  });
  if (staging) {
    return {
      content: staging.content,
      parentCommitSha: staging.parentCommitSha,
      isStaged: true,
      version: staging.version,
      filePath: staging.filePath,
    };
  }
  if (
    await isPathHiddenByStagingChangeForOriginal({
      context: args.context,
      path: args.path,
    })
  ) {
    throw createFileNotFoundError(
      `edit_file failed: ${args.path} does not exist; use create_file`,
    );
  }

  const githubAccessToken = requireGithubAccessToken(args.context);
  const octokit = new Octokit({ auth: githubAccessToken });
  const file = await octokit.rest.repos.getContent({
    owner: vault.ghRepoOwner,
    repo: vault.ghRepoName,
    path: args.path,
    ref: branch,
  });
  if (Array.isArray(file.data) || file.data.type !== "file") {
    throw new Error(
      `edit_file failed: ${args.path} is a directory, not a file`,
    );
  }
  return {
    content: Buffer.from(file.data.content, "base64").toString("utf-8"),
    parentCommitSha: file.data.sha,
    isStaged: false,
    version: 0,
    filePath: args.path,
  };
}

async function loadExistingFileSnapshotForReplace(args: {
  context: ResolvedToolContext;
  path: string;
}): Promise<ExistingFileSnapshot> {
  const vault = requireVault(args.context);
  const branch = requireBranch(args.context);
  const staging = await loadStagedFileByPath({
    context: args.context,
    path: args.path,
  });
  if (staging) {
    if (staging.fileDeleted === true) {
      throw new ReplaceInFileError(
        `replace_in_file failed: ${args.path} is marked deleted in staging`,
        "deleted",
      );
    }
    return {
      content: staging.content,
      parentCommitSha: staging.parentCommitSha,
      isStaged: true,
      version: staging.version,
      filePath: staging.filePath,
    };
  }

  const githubAccessToken = requireGithubAccessToken(args.context);
  const octokit = new Octokit({ auth: githubAccessToken });
  try {
    const file = await octokit.rest.repos.getContent({
      owner: vault.ghRepoOwner,
      repo: vault.ghRepoName,
      path: args.path,
      ref: branch,
    });
    if (Array.isArray(file.data) || file.data.type !== "file") {
      throw new ReplaceInFileError(
        `replace_in_file failed: ${args.path} is a directory, not a file`,
        "not_file",
      );
    }
    return {
      content: Buffer.from(file.data.content, "base64").toString("utf-8"),
      parentCommitSha: file.data.sha,
      isStaged: false,
      version: 0,
      filePath: args.path,
    };
  } catch (error) {
    if (error instanceof ReplaceInFileError) {
      throw error;
    }
    if (hasStatusCode(error, 404)) {
      throw new ReplaceInFileError(
        `replace_in_file failed: ${args.path} does not exist; use create_file`,
        "not_found",
      );
    }
    throw error;
  }
}

async function loadExistingFileSnapshotOrNull(args: {
  context: ResolvedToolContext;
  path: string;
}): Promise<ExistingFileSnapshot | null> {
  try {
    return await loadExistingFileSnapshot(args);
  } catch (error) {
    if (hasStatusCode(error, 404)) {
      return null;
    }
    throw error;
  }
}

function formatReplaceInFileResult(args: {
  path: string;
  replacements: ReplaceInFileReplacement[];
  resolvedEdits: ReplaceInFileResolvedEdit[];
}): string {
  return JSON.stringify(
    {
      path: args.path,
      applied: args.resolvedEdits.length,
      replacementCount: args.replacements.length,
      resolvedEdits: args.resolvedEdits,
      result: `File edited: ${args.path}`,
    },
    null,
    2,
  );
}

export async function executeVaultsList(
  context: ResolvedToolContext,
): Promise<ToolExecutionOutput> {
  const vaults = await context.ctx.runQuery(
    internal.toolRuntime.queries.listVaultsForUser,
    {
      userId: context.userId,
    },
  );
  const structuredContent = {
    vaults: vaults.map((vault) => ({
      id: vault.vaultId,
      repositoryFullName: vault.repositoryFullName,
      state: vault.state,
      isNoterManaged: vault.isNoterManaged,
      commitSha: vault.commitSha,
      hostingProvider: vault.hostingProvider,
    })),
  };
  return {
    text: JSON.stringify(structuredContent, null, 2),
    structuredContent,
  };
}

export async function executeGetVaultRemoteBranches(
  context: ResolvedToolContext,
): Promise<ToolExecutionOutput> {
  const vault = requireVault(context);
  const branches = await context.ctx.runQuery(
    internal.toolRuntime.queries.listVaultRemoteBranchesForUser,
    {
      userId: context.userId,
      vaultId: vault._id,
    },
  );
  const structuredContent = {
    vaultId: vault._id,
    repositoryFullName: `${vault.ghRepoOwner}/${vault.ghRepoName}`,
    branches,
  };
  return {
    text: JSON.stringify(structuredContent, null, 2),
    structuredContent,
  };
}

export async function executeReadFile(
  context: ResolvedToolContext,
  input: ReadFileInput,
): Promise<ToolExecutionOutput> {
  const vault = requireVault(context);
  const branch = requireBranch(context);

  const staging = await loadStagedFileByPath({
    context,
    path: input.path,
  });
  if (staging) {
    return {
      text: staging.content,
      structuredContent: {
        path: input.path,
        source: "staging",
        content: staging.content,
      },
    };
  }
  if (
    await isPathHiddenByStagingChangeForOriginal({
      context,
      path: input.path,
    })
  ) {
    return {
      text: `Error: ${input.path} does not exist`,
    };
  }

  const githubAccessToken = requireGithubAccessToken(context);
  const octokit = new Octokit({ auth: githubAccessToken });
  const file = await octokit.rest.repos.getContent({
    owner: vault.ghRepoOwner,
    repo: vault.ghRepoName,
    path: input.path,
    ref: branch,
  });
  if (Array.isArray(file.data) || file.data.type !== "file") {
    return {
      text: `Error: ${input.path} is a directory, not a file`,
    };
  }
  const content = Buffer.from(file.data.content, "base64").toString("utf-8");
  return {
    text: content,
    structuredContent: {
      path: input.path,
      source: "repository",
      content,
    },
  };
}

export async function executeListFiles(
  context: ResolvedToolContext,
  input: ListFilesInput,
): Promise<ToolExecutionOutput> {
  const vault = requireVault(context);
  const branch = requireBranch(context);
  const githubAccessToken = requireGithubAccessToken(context);

  const octokit = new Octokit({ auth: githubAccessToken });
  const tree = await octokit.rest.git.getTree({
    owner: vault.ghRepoOwner,
    repo: vault.ghRepoName,
    tree_sha: toGitTreeRef(branch),
    recursive: "1",
  });
  if (tree.data.truncated) {
    return {
      text: `Error: repository tree is too large to list safely for branch ${branch}`,
    };
  }

  const paths = new Set<string>();
  for (const entry of tree.data.tree) {
    if (entry.type === "blob" && typeof entry.path === "string") {
      paths.add(entry.path);
    }
  }

  const stagedFiles = await context.ctx.runQuery(
    api.fileStaging.listStagedFiles,
    {
      vaultId: vault._id,
      branch,
      includeUnchanged: true,
    },
  );
  for (const stagedFile of stagedFiles) {
    if (
      stagedFile.fileDeleted ||
      stagedFile.filePath !== stagedFile.initialFilePath
    ) {
      paths.delete(stagedFile.initialFilePath);
    }
    if (!stagedFile.fileDeleted) {
      paths.add(stagedFile.filePath);
    }
  }

  let entries = Array.from(paths).sort();
  if (input.directory) {
    const prefix = input.directory.endsWith("/")
      ? input.directory
      : `${input.directory}/`;
    entries = entries.filter((path) => path.startsWith(prefix));
  }

  if (entries.length === 0) {
    return {
      text: input.directory
        ? `No files found in directory: ${input.directory}`
        : "Repository has no files",
      structuredContent: {
        files: [],
        directory: input.directory,
      },
    };
  }

  return {
    text: entries.join("\n"),
    structuredContent: {
      files: entries,
      directory: input.directory,
    },
  };
}

export async function executeEditFile(
  context: ResolvedToolContext,
  input: EditFileInput,
): Promise<ToolExecutionOutput> {
  const vault = requireVault(context);
  const branch = requireBranch(context);

  const staging = await loadStagedFileByPath({
    context,
    path: input.path,
  });
  if (staging) {
    await context.ctx.runMutation(internal.collaborative.pushContentUpdate, {
      vaultId: vault._id,
      filePath: staging.filePath,
      branch,
      expectedVersion: staging.version,
      newContent: input.content,
      userId: context.userId,
    });
  } else {
    const snapshot = await loadExistingFileSnapshotOrNull({
      context,
      path: input.path,
    });
    if (!snapshot) {
      throw new Error(
        `edit_file failed: ${input.path} does not exist; use create_file`,
      );
    }

    await context.ctx.runMutation(internal.fileStaging.saveToStaging, {
      vaultId: vault._id,
      initialFilePath: input.path,
      content: input.content,
      initialContent: snapshot.content,
      parentCommitSha: snapshot.parentCommitSha,
      branch,
      userId: context.userId,
    });
  }

  const resultText = `File edited: ${input.path}`;
  return {
    text: resultText,
    structuredContent: {
      path: input.path,
      result: resultText,
    },
  };
}

export async function executeReplaceInFile(
  context: ResolvedToolContext,
  input: ReplaceInFileInput,
): Promise<ToolExecutionOutput> {
  const vault = requireVault(context);
  const branch = requireBranch(context);
  const snapshot = await loadExistingFileSnapshotForReplace({
    context,
    path: input.path,
  });
  const plan = buildReplaceInFilePlan({
    sourceContent: snapshot.content,
    replacements: input.replacements,
  });

  if (snapshot.isStaged) {
    await context.ctx.runMutation(
      internal.collaborative.pushSerializedChangeSetUpdate,
      {
        vaultId: vault._id,
        filePath: snapshot.filePath,
        branch,
        expectedVersion: snapshot.version,
        serializedChangeSet: plan.serializedChangeSet,
        userId: context.userId,
      },
    );
  } else {
    await context.ctx.runMutation(internal.fileStaging.saveToStaging, {
      vaultId: vault._id,
      initialFilePath: input.path,
      content: plan.finalContent,
      initialContent: snapshot.content,
      parentCommitSha: snapshot.parentCommitSha,
      branch,
      userId: context.userId,
    });
  }

  const resultText = formatReplaceInFileResult({
    path: input.path,
    replacements: input.replacements,
    resolvedEdits: plan.resolvedEdits,
  });
  return {
    text: resultText,
    structuredContent: {
      path: input.path,
      replacements: input.replacements.length,
      resolvedEdits: plan.resolvedEdits,
      result: `File edited: ${input.path}`,
    },
  };
}

export async function executeCreateFile(
  context: ResolvedToolContext,
  input: CreateFileInput,
): Promise<ToolExecutionOutput> {
  const vault = requireVault(context);
  const branch = requireBranch(context);
  await assertCreateFilePathIsAvailable({
    context,
    path: input.path,
  });
  await context.ctx.runMutation(internal.fileStaging.saveToStaging, {
    vaultId: vault._id,
    initialFilePath: input.path,
    content: input.content,
    initialContent: "",
    parentCommitSha: null,
    branch,
    userId: context.userId,
  });

  const resultText = `File created: ${input.path}`;
  return {
    text: resultText,
    structuredContent: {
      path: input.path,
      result: resultText,
    },
  };
}

export async function executeDeleteFile(
  context: ResolvedToolContext,
  input: DeleteFileInput,
): Promise<ToolExecutionOutput> {
  const vault = requireVault(context);
  const branch = requireBranch(context);
  const snapshot = await loadExistingFileSnapshotOrNull({
    context,
    path: input.path,
  });
  const sha = snapshot?.parentCommitSha ?? null;

  await context.ctx.runMutation(
    internal.fileStaging.internalMarkFileForDeletion,
    {
      vaultId: vault._id,
      filePath: snapshot?.filePath ?? input.path,
      parentCommitSha: sha,
      branch,
      userId: context.userId,
    },
  );

  const resultText = `File marked for deletion: ${input.path}`;
  return {
    text: resultText,
    structuredContent: {
      path: input.path,
      result: resultText,
    },
  };
}

async function executeProdReadRequest(args: {
  context: ResolvedToolContext;
  scope: ProdReadScope;
  provider: ProdReadProvider;
  resourceKind: ProdReadResourceKind;
  toolName: string;
  params: Record<string, unknown>;
  allowRawFallback?: boolean;
}): Promise<ToolExecutionOutput> {
  const threadId = requireThreadId(args.context);
  const proposal = await args.context.ctx.runMutation(
    internal.chat.index.proposeProdReadInternal,
    {
      threadId,
      requesterUserId: args.context.userId,
      vaultId:
        args.scope === "vault" ? requireVault(args.context)._id : undefined,
      scope: args.scope,
      provider: args.provider,
      resourceKind: args.resourceKind,
      toolName: args.toolName,
      paramsJson: JSON.stringify(args.params),
      allowRawFallback: args.allowRawFallback,
    },
  );

  const structuredContent: ProdReadProposalPayload = {
    type: "prod_read_proposal",
    requestId: proposal.requestId,
    scope: args.scope,
    provider: args.provider,
    resourceKind: args.resourceKind,
    toolName: args.toolName,
    paramsPreview: buildParamsPreview(args.params),
    summary: buildProdReadSummary({
      scope: args.scope,
      provider: args.provider,
      resourceKind: args.resourceKind,
    }),
    status: "proposed",
  };

  return {
    text: structuredContent.summary,
    structuredContent,
  };
}

async function executeRequestConvexStatusRead(
  context: ResolvedToolContext,
): Promise<ToolExecutionOutput> {
  return executeProdReadRequest({
    context,
    scope: "vault",
    provider: "convex",
    resourceKind: "deployment_status",
    toolName: "request_convex_status_read",
    params: {},
  });
}

async function executeRequestConvexLogsRead(
  context: ResolvedToolContext,
  input: RequestConvexLogsReadInput,
): Promise<ToolExecutionOutput> {
  return executeProdReadRequest({
    context,
    scope: "vault",
    provider: "convex",
    resourceKind: "logs",
    toolName: "request_convex_logs_read",
    params: {
      ...(typeof input.maxLines === "number"
        ? { maxLines: input.maxLines }
        : {}),
    },
    allowRawFallback: input.allowRawFallback,
  });
}

async function executeRequestConvexProjectsRead(
  context: ResolvedToolContext,
  input: RequestConvexProjectsReadInput,
): Promise<ToolExecutionOutput> {
  return executeProdReadRequest({
    context,
    scope: "global",
    provider: "convex",
    resourceKind: "project_inventory",
    toolName: "request_convex_projects_read",
    params: {
      ...(typeof input.limit === "number" ? { limit: input.limit } : {}),
    },
    allowRawFallback: input.allowRawFallback,
  });
}

async function executeRequestNetlifyStatusRead(
  context: ResolvedToolContext,
): Promise<ToolExecutionOutput> {
  return executeProdReadRequest({
    context,
    scope: "vault",
    provider: "netlify",
    resourceKind: "deployment_status",
    toolName: "request_netlify_status_read",
    params: {},
  });
}

async function executeRequestNetlifyLogsRead(
  context: ResolvedToolContext,
  input: RequestNetlifyLogsReadInput,
): Promise<ToolExecutionOutput> {
  return executeProdReadRequest({
    context,
    scope: "vault",
    provider: "netlify",
    resourceKind: "logs",
    toolName: "request_netlify_logs_read",
    params: {
      ...(typeof input.maxEntries === "number"
        ? { maxEntries: input.maxEntries }
        : {}),
    },
    allowRawFallback: input.allowRawFallback,
  });
}

async function executeRequestNetlifyProjectsRead(
  context: ResolvedToolContext,
  input: RequestNetlifyProjectsReadInput,
): Promise<ToolExecutionOutput> {
  return executeProdReadRequest({
    context,
    scope: "global",
    provider: "netlify",
    resourceKind: "site_inventory",
    toolName: "request_netlify_projects_read",
    params: {
      ...(typeof input.limit === "number" ? { limit: input.limit } : {}),
    },
    allowRawFallback: input.allowRawFallback,
  });
}

async function executeRequestCloudflareAccountsRead(
  context: ResolvedToolContext,
  input: RequestCloudflareAccountsReadInput,
): Promise<ToolExecutionOutput> {
  return executeProdReadRequest({
    context,
    scope: "global",
    provider: "cloudflare",
    resourceKind: "account_inventory",
    toolName: "request_cloudflare_accounts_read",
    params: {
      ...(typeof input.limit === "number" ? { limit: input.limit } : {}),
    },
    allowRawFallback: input.allowRawFallback,
  });
}

async function executeRequestCloudflarePagesProjectsRead(
  context: ResolvedToolContext,
  input: RequestCloudflarePagesProjectsReadInput,
): Promise<ToolExecutionOutput> {
  return executeProdReadRequest({
    context,
    scope: "global",
    provider: "cloudflare",
    resourceKind: "pages_project_inventory",
    toolName: "request_cloudflare_pages_projects_read",
    params: {
      ...(typeof input.accountId === "string"
        ? { accountId: input.accountId }
        : {}),
      ...(typeof input.limit === "number" ? { limit: input.limit } : {}),
    },
    allowRawFallback: input.allowRawFallback,
  });
}

async function executeRequestConvexDataRead(
  context: ResolvedToolContext,
  input: RequestConvexDataReadInput,
): Promise<ToolExecutionOutput> {
  const scope = input.scope ?? "vault";
  return executeProdReadRequest({
    context,
    scope,
    provider: "convex",
    resourceKind: "data_query",
    toolName: "request_convex_data_read",
    params: {
      table: input.table,
      ...(typeof input.limit === "number" ? { limit: input.limit } : {}),
    },
    allowRawFallback: input.allowRawFallback,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) {
    return null;
  }
  return value;
}

function parseReadFileInput(value: unknown): ReadFileInput | null {
  const record = toRecord(value);
  if (!record) {
    return null;
  }
  const path = record.path;
  if (typeof path !== "string") {
    return null;
  }
  return { path };
}

function parseListFilesInput(value: unknown): ListFilesInput | null {
  const record = toRecord(value);
  if (!record) {
    return null;
  }
  const directory = record.directory;
  if (directory !== undefined && typeof directory !== "string") {
    return null;
  }
  return {
    ...(typeof directory === "string" ? { directory } : {}),
  };
}

function parseEditFileInput(value: unknown): EditFileInput | null {
  const record = toRecord(value);
  if (!record) {
    return null;
  }
  const path = record.path;
  const content = record.content;
  if (typeof path !== "string" || typeof content !== "string") {
    return null;
  }
  return {
    path,
    content,
  };
}

function parseReplaceInFileReplacement(
  value: unknown,
): ReplaceInFileReplacement | null {
  const record = toRecord(value);
  if (!record) {
    return null;
  }
  const oldText = record.oldText;
  const newText = record.newText;
  if (typeof oldText !== "string" || typeof newText !== "string") {
    return null;
  }
  return {
    oldText,
    newText,
  };
}

function parseReplaceInFileInput(value: unknown): ReplaceInFileInput | null {
  const record = toRecord(value);
  if (!record) {
    return null;
  }
  const path = record.path;
  const replacements = record.replacements;
  if (typeof path !== "string" || !Array.isArray(replacements)) {
    return null;
  }
  if (replacements.length === 0) {
    return null;
  }
  const parsed: ReplaceInFileReplacement[] = [];
  for (const replacement of replacements) {
    const parsedReplacement = parseReplaceInFileReplacement(replacement);
    if (!parsedReplacement) {
      return null;
    }
    parsed.push(parsedReplacement);
  }
  return {
    path,
    replacements: parsed,
  };
}

function parseCreateFileInput(value: unknown): CreateFileInput | null {
  const record = toRecord(value);
  if (!record) {
    return null;
  }
  const path = record.path;
  const content = record.content;
  if (typeof path !== "string" || typeof content !== "string") {
    return null;
  }
  return {
    path,
    content,
  };
}

function parseDeleteFileInput(value: unknown): DeleteFileInput | null {
  const record = toRecord(value);
  if (!record) {
    return null;
  }
  const path = record.path;
  if (typeof path !== "string") {
    return null;
  }
  return {
    path,
  };
}

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  return typeof value === "boolean" ? value : undefined;
}

function parseOptionalPositiveInteger(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return undefined;
  }
  return value > 0 ? value : undefined;
}

function parseOptionalString(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return typeof value === "string" ? value : undefined;
}

function parseRequestConvexLogsReadInput(
  value: unknown,
): RequestConvexLogsReadInput | null {
  const record = toRecord(value);
  if (!record) {
    return null;
  }

  const maxLines = parseOptionalPositiveInteger(record.maxLines);
  if (record.maxLines !== undefined && maxLines === undefined) {
    return null;
  }
  const allowRawFallback = parseOptionalBoolean(record.allowRawFallback);
  if (record.allowRawFallback !== undefined && allowRawFallback === undefined) {
    return null;
  }

  return {
    ...(maxLines !== undefined ? { maxLines } : {}),
    ...(allowRawFallback !== undefined ? { allowRawFallback } : {}),
  };
}

function parseRequestConvexProjectsReadInput(
  value: unknown,
): RequestConvexProjectsReadInput | null {
  const record = toRecord(value);
  if (!record) {
    return null;
  }

  const limit = parseOptionalPositiveInteger(record.limit);
  if (record.limit !== undefined && limit === undefined) {
    return null;
  }
  const allowRawFallback = parseOptionalBoolean(record.allowRawFallback);
  if (record.allowRawFallback !== undefined && allowRawFallback === undefined) {
    return null;
  }

  return {
    ...(limit !== undefined ? { limit } : {}),
    ...(allowRawFallback !== undefined ? { allowRawFallback } : {}),
  };
}

function parseRequestNetlifyLogsReadInput(
  value: unknown,
): RequestNetlifyLogsReadInput | null {
  const record = toRecord(value);
  if (!record) {
    return null;
  }

  const maxEntries = parseOptionalPositiveInteger(record.maxEntries);
  if (record.maxEntries !== undefined && maxEntries === undefined) {
    return null;
  }
  const allowRawFallback = parseOptionalBoolean(record.allowRawFallback);
  if (record.allowRawFallback !== undefined && allowRawFallback === undefined) {
    return null;
  }

  return {
    ...(maxEntries !== undefined ? { maxEntries } : {}),
    ...(allowRawFallback !== undefined ? { allowRawFallback } : {}),
  };
}

function parseRequestNetlifyProjectsReadInput(
  value: unknown,
): RequestNetlifyProjectsReadInput | null {
  const record = toRecord(value);
  if (!record) {
    return null;
  }

  const limit = parseOptionalPositiveInteger(record.limit);
  if (record.limit !== undefined && limit === undefined) {
    return null;
  }
  const allowRawFallback = parseOptionalBoolean(record.allowRawFallback);
  if (record.allowRawFallback !== undefined && allowRawFallback === undefined) {
    return null;
  }

  return {
    ...(limit !== undefined ? { limit } : {}),
    ...(allowRawFallback !== undefined ? { allowRawFallback } : {}),
  };
}

function parseRequestCloudflareAccountsReadInput(
  value: unknown,
): RequestCloudflareAccountsReadInput | null {
  const record = toRecord(value);
  if (!record) {
    return null;
  }

  const limit = parseOptionalPositiveInteger(record.limit);
  if (record.limit !== undefined && limit === undefined) {
    return null;
  }
  const allowRawFallback = parseOptionalBoolean(record.allowRawFallback);
  if (record.allowRawFallback !== undefined && allowRawFallback === undefined) {
    return null;
  }

  return {
    ...(limit !== undefined ? { limit } : {}),
    ...(allowRawFallback !== undefined ? { allowRawFallback } : {}),
  };
}

function parseRequestCloudflarePagesProjectsReadInput(
  value: unknown,
): RequestCloudflarePagesProjectsReadInput | null {
  const record = toRecord(value);
  if (!record) {
    return null;
  }

  const accountId = parseOptionalString(record.accountId);
  if (record.accountId !== undefined && accountId === undefined) {
    return null;
  }
  const limit = parseOptionalPositiveInteger(record.limit);
  if (record.limit !== undefined && limit === undefined) {
    return null;
  }
  const allowRawFallback = parseOptionalBoolean(record.allowRawFallback);
  if (record.allowRawFallback !== undefined && allowRawFallback === undefined) {
    return null;
  }

  return {
    ...(accountId !== undefined ? { accountId } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(allowRawFallback !== undefined ? { allowRawFallback } : {}),
  };
}

function parseConvexDataTable(value: unknown): AllowedDataTable | undefined {
  if (
    value === "vaults" ||
    value === "vaultInfrastructure" ||
    value === "vaultDomains" ||
    value === "codespaces" ||
    value === "fileStaging" ||
    value === "aiProdAccessRequests" ||
    value === "aiProdAccessAudit"
  ) {
    return value;
  }
  return undefined;
}

function parseProdReadScope(value: unknown): ProdReadScope | undefined {
  if (value === "vault" || value === "global") {
    return value;
  }
  return undefined;
}

function parseRequestConvexDataReadInput(
  value: unknown,
): RequestConvexDataReadInput | null {
  const record = toRecord(value);
  if (!record) {
    return null;
  }

  const table = parseConvexDataTable(record.table);
  if (!table) {
    return null;
  }
  const scope = parseProdReadScope(record.scope);
  if (record.scope !== undefined && scope === undefined) {
    return null;
  }
  const limit = parseOptionalPositiveInteger(record.limit);
  if (record.limit !== undefined && limit === undefined) {
    return null;
  }
  const allowRawFallback = parseOptionalBoolean(record.allowRawFallback);
  if (record.allowRawFallback !== undefined && allowRawFallback === undefined) {
    return null;
  }

  return {
    table,
    ...(scope !== undefined ? { scope } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(allowRawFallback !== undefined ? { allowRawFallback } : {}),
  };
}

export async function executeRuntimeTool(args: {
  toolName: string;
  context: ResolvedToolContext;
  input: unknown;
}): Promise<ToolExecutionOutput> {
  switch (args.toolName) {
    case "vaults.list":
      return executeVaultsList(args.context);
    case "get_vault_remote_branches":
      return executeGetVaultRemoteBranches(args.context);
    case "read_file": {
      const input = parseReadFileInput(args.input);
      if (!input) {
        throw new Error("Invalid read_file input.");
      }
      return executeReadFile(args.context, input);
    }
    case "list_files": {
      const input = parseListFilesInput(args.input);
      if (!input) {
        throw new Error("Invalid list_files input.");
      }
      return executeListFiles(args.context, input);
    }
    case "edit_file": {
      const input = parseEditFileInput(args.input);
      if (!input) {
        throw new Error("Invalid edit_file input.");
      }
      return executeEditFile(args.context, input);
    }
    case "replace_in_file": {
      const input = parseReplaceInFileInput(args.input);
      if (!input) {
        throw new Error("Invalid replace_in_file input.");
      }
      return executeReplaceInFile(args.context, input);
    }
    case "create_file": {
      const input = parseCreateFileInput(args.input);
      if (!input) {
        throw new Error("Invalid create_file input.");
      }
      return executeCreateFile(args.context, input);
    }
    case "delete_file": {
      const input = parseDeleteFileInput(args.input);
      if (!input) {
        throw new Error("Invalid delete_file input.");
      }
      return executeDeleteFile(args.context, input);
    }
    case "request_convex_status_read":
      return executeRequestConvexStatusRead(args.context);
    case "request_convex_logs_read": {
      const input = parseRequestConvexLogsReadInput(args.input);
      if (!input) {
        throw new Error("Invalid request_convex_logs_read input.");
      }
      return executeRequestConvexLogsRead(args.context, input);
    }
    case "request_convex_projects_read": {
      const input = parseRequestConvexProjectsReadInput(args.input);
      if (!input) {
        throw new Error("Invalid request_convex_projects_read input.");
      }
      return executeRequestConvexProjectsRead(args.context, input);
    }
    case "request_netlify_status_read":
      return executeRequestNetlifyStatusRead(args.context);
    case "request_netlify_logs_read": {
      const input = parseRequestNetlifyLogsReadInput(args.input);
      if (!input) {
        throw new Error("Invalid request_netlify_logs_read input.");
      }
      return executeRequestNetlifyLogsRead(args.context, input);
    }
    case "request_netlify_projects_read": {
      const input = parseRequestNetlifyProjectsReadInput(args.input);
      if (!input) {
        throw new Error("Invalid request_netlify_projects_read input.");
      }
      return executeRequestNetlifyProjectsRead(args.context, input);
    }
    case "request_cloudflare_accounts_read": {
      const input = parseRequestCloudflareAccountsReadInput(args.input);
      if (!input) {
        throw new Error("Invalid request_cloudflare_accounts_read input.");
      }
      return executeRequestCloudflareAccountsRead(args.context, input);
    }
    case "request_cloudflare_pages_projects_read": {
      const input = parseRequestCloudflarePagesProjectsReadInput(args.input);
      if (!input) {
        throw new Error(
          "Invalid request_cloudflare_pages_projects_read input.",
        );
      }
      return executeRequestCloudflarePagesProjectsRead(args.context, input);
    }
    case "request_convex_data_read": {
      const input = parseRequestConvexDataReadInput(args.input);
      if (!input) {
        throw new Error("Invalid request_convex_data_read input.");
      }
      return executeRequestConvexDataRead(args.context, input);
    }
    default:
      throw new Error(`No executor for tool: ${args.toolName}`);
  }
}
