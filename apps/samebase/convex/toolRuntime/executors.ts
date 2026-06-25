"use node";

import { Octokit } from "@octokit/rest";
import type { ObjectType, PropertyValidators } from "convex/values";
import { internal } from "../_generated/api";
import type { ResolvedToolContext, ToolExecutionOutput } from "./types";
import {
  buildReplaceInFilePlan,
  ReplaceInFileError,
  type ReplaceInFileResolvedEdit,
} from "../agent/replaceInFile";
import {
  createRepositoryContract,
  type CreateRepositoryArgs,
} from "../vault/createRepositoryContract";
import {
  createFileInputArgs,
  deleteFileInputArgs,
  editFileInputArgs,
  emptyToolInputArgs,
  listFilesInputArgs,
  readFileInputArgs,
  replaceInFileInputArgs,
  requestCloudflareAccountsReadInputArgs,
  requestCloudflareLogsReadInputArgs,
  requestCloudflareWorkersInventoryReadInputArgs,
  requestConvexDataReadInputArgs,
  requestConvexLogsReadInputArgs,
  requestConvexProjectsReadInputArgs,
} from "./catalog";
import { parseConvexArgs } from "./convexSchemas";

type CreateRepositoryInput = CreateRepositoryArgs;
type ReadFileInput = ObjectType<typeof readFileInputArgs>;
type ListFilesInput = ObjectType<typeof listFilesInputArgs>;
type EditFileInput = ObjectType<typeof editFileInputArgs>;
type ReplaceInFileInput = ObjectType<typeof replaceInFileInputArgs>;
type ReplaceInFileReplacement = ReplaceInFileInput["replacements"][number];
type CreateFileInput = ObjectType<typeof createFileInputArgs>;
type DeleteFileInput = ObjectType<typeof deleteFileInputArgs>;
type RequestConvexLogsReadInput = ObjectType<typeof requestConvexLogsReadInputArgs>;
type RequestConvexProjectsReadInput = ObjectType<typeof requestConvexProjectsReadInputArgs>;
type RequestCloudflareLogsReadInput = ObjectType<typeof requestCloudflareLogsReadInputArgs>;
type RequestCloudflareAccountsReadInput = ObjectType<typeof requestCloudflareAccountsReadInputArgs>;
type RequestCloudflareWorkersInventoryReadInput = ObjectType<
  typeof requestCloudflareWorkersInventoryReadInputArgs
>;
type RequestConvexDataReadInput = ObjectType<typeof requestConvexDataReadInputArgs>;

type ProdReadScope = "vault" | "global";
type ProdReadProvider = "convex" | "cloudflare";
type ProdReadResourceKind =
  | "deployment_status"
  | "logs"
  | "data_query"
  | "project_inventory"
  | "account_inventory"
  | "workers_inventory";

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
  cloudflare: "Cloudflare",
};

const PROD_READ_RESOURCE_LABELS: Record<ProdReadResourceKind, string> = {
  deployment_status: "deployment status",
  logs: "logs",
  data_query: "data sample",
  project_inventory: "project inventory",
  account_inventory: "account inventory",
  workers_inventory: "Workers inventory",
};

const PROD_READ_SCOPE_LABELS: Record<ProdReadScope, string> = {
  vault: "this vault",
  global: "global scope",
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
  const branch = typeof context.branch === "string" ? context.branch.trim() : "";
  if (branch.length === 0) {
    throw new Error("Branch context is required for this tool.");
  }
  return branch;
}

function requireThreadId(context: ResolvedToolContext): string {
  const threadId = typeof context.threadId === "string" ? context.threadId.trim() : "";
  if (threadId.length === 0) {
    throw new Error("Thread context is required for this tool.");
  }
  return threadId;
}

function requireGithubAccessToken(context: ResolvedToolContext): string {
  if (typeof context.githubAccessToken !== "string" || context.githubAccessToken.length === 0) {
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
  return args.context.ctx.runQuery(internal.fileStaging.getByNewPathInternal, {
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

// eslint-disable-next-line samebase/no-hand-written-type-predicate -- property-presence over unknown: the in-check narrows the property reference, not the error object
function hasStatusCode(error: unknown, status: number): error is { status: number } {
  return (
    typeof error === "object" && error !== null && "status" in error && error.status === status
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
  const branchTree = await args.context.ctx.runQuery(internal.vault.branches.getVaultBranchTree, {
    vaultId: vault._id,
    branch,
  });
  const tree = branchTree?.treeData.tree ?? [];
  return tree.some((entry) => entry.type === "blob" && entry.path === args.path);
}

async function assertCreateFilePathIsAvailable(args: {
  context: ResolvedToolContext;
  path: string;
}): Promise<void> {
  const byOriginalPath = await loadStagedFileByOriginalPath(args);
  if (byOriginalPath) {
    throw new Error(`create_file failed: ${args.path} already exists; use edit_file`);
  }
  const byCurrentPath = await loadStagedFileByNewPath(args);
  if (byCurrentPath && !byCurrentPath.fileDeleted) {
    throw new Error(`create_file failed: ${args.path} already exists; use edit_file`);
  }
  if (await repositoryTreeContainsPath(args)) {
    throw new Error(`create_file failed: ${args.path} already exists; use edit_file`);
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
    throw createFileNotFoundError(`edit_file failed: ${args.path} does not exist; use create_file`);
  }

  const githubAccessToken = requireGithubAccessToken(args.context);
  const octokit = new Octokit({ auth: githubAccessToken });
  const file = await octokit.rest.repos.getContent({
    owner: vault.owner,
    repo: vault.name,
    path: args.path,
    ref: branch,
  });
  if (Array.isArray(file.data) || file.data.type !== "file") {
    throw new Error(`edit_file failed: ${args.path} is a directory, not a file`);
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
      owner: vault.owner,
      repo: vault.name,
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

export async function executeCreateRepository(
  context: ResolvedToolContext,
  input: CreateRepositoryInput,
): Promise<ToolExecutionOutput> {
  const result = await context.ctx.runAction(internal.vault.actions.createAppForUserInternal, {
    userId: context.userId,
    name: input.name,
    owner: input.owner,
    convexProjectName: input.convexProjectName,
    cloudflareWorkerName: input.cloudflareWorkerName,
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.private !== undefined ? { private: input.private } : {}),
  });
  const structuredContent = {
    vaultId: result.vaultId,
    runId: result.runId,
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
    repositoryFullName: `${vault.owner}/${vault.name}`,
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
    owner: vault.owner,
    repo: vault.name,
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
    owner: vault.owner,
    repo: vault.name,
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

  const stagedFiles = await context.ctx.runQuery(internal.fileStaging.listAllStagedFiles, {
    vaultId: vault._id,
    branch,
    includeUnchanged: true,
  });
  for (const stagedFile of stagedFiles) {
    if (stagedFile.fileDeleted || stagedFile.filePath !== stagedFile.initialFilePath) {
      paths.delete(stagedFile.initialFilePath);
    }
    if (!stagedFile.fileDeleted) {
      paths.add(stagedFile.filePath);
    }
  }

  let entries = Array.from(paths).sort();
  if (input.directory) {
    const prefix = input.directory.endsWith("/") ? input.directory : `${input.directory}/`;
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
      throw new Error(`edit_file failed: ${input.path} does not exist; use create_file`);
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
    await context.ctx.runMutation(internal.collaborative.pushSerializedChangeSetUpdate, {
      vaultId: vault._id,
      filePath: snapshot.filePath,
      branch,
      expectedVersion: snapshot.version,
      serializedChangeSet: plan.serializedChangeSet,
      userId: context.userId,
    });
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

  await context.ctx.runMutation(internal.fileStaging.internalMarkFileForDeletion, {
    vaultId: vault._id,
    filePath: snapshot?.filePath ?? input.path,
    parentCommitSha: sha,
    branch,
    userId: context.userId,
  });

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
  const proposal = await args.context.ctx.runMutation(internal.chat.index.proposeProdReadInternal, {
    threadId,
    requesterUserId: args.context.userId,
    vaultId: args.scope === "vault" ? requireVault(args.context)._id : undefined,
    scope: args.scope,
    provider: args.provider,
    resourceKind: args.resourceKind,
    toolName: args.toolName,
    paramsJson: JSON.stringify(args.params),
    allowRawFallback: args.allowRawFallback,
  });

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
      ...(typeof input.maxLines === "number" ? { maxLines: input.maxLines } : {}),
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

async function executeRequestCloudflareStatusRead(
  context: ResolvedToolContext,
): Promise<ToolExecutionOutput> {
  return executeProdReadRequest({
    context,
    scope: "vault",
    provider: "cloudflare",
    resourceKind: "deployment_status",
    toolName: "request_cloudflare_status_read",
    params: {},
  });
}

async function executeRequestCloudflareLogsRead(
  context: ResolvedToolContext,
  input: RequestCloudflareLogsReadInput,
): Promise<ToolExecutionOutput> {
  return executeProdReadRequest({
    context,
    scope: "vault",
    provider: "cloudflare",
    resourceKind: "logs",
    toolName: "request_cloudflare_logs_read",
    params: {
      ...(typeof input.maxEntries === "number" ? { maxEntries: input.maxEntries } : {}),
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

async function executeRequestCloudflareWorkersInventoryRead(
  context: ResolvedToolContext,
  input: RequestCloudflareWorkersInventoryReadInput,
): Promise<ToolExecutionOutput> {
  const accountId = await resolveCloudflareWorkersInventoryAccountId(context, input.accountId);

  return executeProdReadRequest({
    context,
    scope: "global",
    provider: "cloudflare",
    resourceKind: "workers_inventory",
    toolName: "request_cloudflare_workers_inventory_read",
    params: {
      accountId,
      ...(typeof input.limit === "number" ? { limit: input.limit } : {}),
    },
    allowRawFallback: input.allowRawFallback,
  });
}

/**
 * Stores a concrete Cloudflare account in the approval request. Execution
 * should not re-resolve the user's default account because the selection could
 * change between proposal, approval, and the provider read.
 */
async function resolveCloudflareWorkersInventoryAccountId(
  context: ResolvedToolContext,
  accountId: string | undefined,
): Promise<string> {
  const explicitAccountId = accountId?.trim();
  if (explicitAccountId) {
    return explicitAccountId;
  }

  const cloudflareConnection = await context.ctx.runAction(
    internal.cloudflareOAuth.resolveConnectionForUser,
    {
      userId: context.userId,
    },
  );
  if (cloudflareConnection?.defaultAccount.state === "selected") {
    return cloudflareConnection.defaultAccount.accountId;
  }

  throw new Error(
    "Cloudflare accountId is required to list Workers. Select a default account or pass accountId.",
  );
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

function parseToolInput<Args extends PropertyValidators>(
  toolName: string,
  inputArgs: Args,
  input: unknown,
): ObjectType<Args> {
  const parsed = parseConvexArgs(inputArgs, input);
  if (!parsed.ok) {
    throw new Error(`Invalid ${toolName} input.`);
  }
  return parsed.value;
}

export async function executeRuntimeTool(args: {
  toolName: string;
  context: ResolvedToolContext;
  input: unknown;
}): Promise<ToolExecutionOutput> {
  switch (args.toolName) {
    case createRepositoryContract.mcp.name: {
      const input = parseToolInput(
        createRepositoryContract.mcp.name,
        createRepositoryContract.args,
        args.input,
      );
      return executeCreateRepository(args.context, input);
    }
    case "get_vault_remote_branches":
      parseToolInput("get_vault_remote_branches", emptyToolInputArgs, args.input);
      return executeGetVaultRemoteBranches(args.context);
    case "read_file": {
      const input = parseToolInput("read_file", readFileInputArgs, args.input);
      return executeReadFile(args.context, input);
    }
    case "list_files": {
      const input = parseToolInput("list_files", listFilesInputArgs, args.input);
      return executeListFiles(args.context, input);
    }
    case "edit_file": {
      const input = parseToolInput("edit_file", editFileInputArgs, args.input);
      return executeEditFile(args.context, input);
    }
    case "replace_in_file": {
      const input = parseToolInput("replace_in_file", replaceInFileInputArgs, args.input);
      return executeReplaceInFile(args.context, input);
    }
    case "create_file": {
      const input = parseToolInput("create_file", createFileInputArgs, args.input);
      return executeCreateFile(args.context, input);
    }
    case "delete_file": {
      const input = parseToolInput("delete_file", deleteFileInputArgs, args.input);
      return executeDeleteFile(args.context, input);
    }
    case "request_convex_status_read":
      parseToolInput("request_convex_status_read", emptyToolInputArgs, args.input);
      return executeRequestConvexStatusRead(args.context);
    case "request_convex_logs_read": {
      const input = parseToolInput(
        "request_convex_logs_read",
        requestConvexLogsReadInputArgs,
        args.input,
      );
      return executeRequestConvexLogsRead(args.context, input);
    }
    case "request_convex_projects_read": {
      const input = parseToolInput(
        "request_convex_projects_read",
        requestConvexProjectsReadInputArgs,
        args.input,
      );
      return executeRequestConvexProjectsRead(args.context, input);
    }
    case "request_cloudflare_status_read":
      parseToolInput("request_cloudflare_status_read", emptyToolInputArgs, args.input);
      return executeRequestCloudflareStatusRead(args.context);
    case "request_cloudflare_logs_read": {
      const input = parseToolInput(
        "request_cloudflare_logs_read",
        requestCloudflareLogsReadInputArgs,
        args.input,
      );
      return executeRequestCloudflareLogsRead(args.context, input);
    }
    case "request_cloudflare_accounts_read": {
      const input = parseToolInput(
        "request_cloudflare_accounts_read",
        requestCloudflareAccountsReadInputArgs,
        args.input,
      );
      return executeRequestCloudflareAccountsRead(args.context, input);
    }
    case "request_cloudflare_workers_inventory_read": {
      const input = parseToolInput(
        "request_cloudflare_workers_inventory_read",
        requestCloudflareWorkersInventoryReadInputArgs,
        args.input,
      );
      return executeRequestCloudflareWorkersInventoryRead(args.context, input);
    }
    case "request_convex_data_read": {
      const input = parseToolInput(
        "request_convex_data_read",
        requestConvexDataReadInputArgs,
        args.input,
      );
      return executeRequestConvexDataRead(args.context, input);
    }
    default:
      throw new Error(`No executor for tool: ${args.toolName}`);
  }
}
