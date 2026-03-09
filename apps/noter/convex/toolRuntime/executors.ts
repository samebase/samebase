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

function requireGithubAccessToken(context: ResolvedToolContext): string {
  if (
    typeof context.githubAccessToken !== "string" ||
    context.githubAccessToken.length === 0
  ) {
    throw new Error("GitHub connection is required for this tool.");
  }
  return context.githubAccessToken;
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
  const vault = requireVault(args.context);
  const branch = requireBranch(args.context);
  const byOriginalPath = await args.context.ctx.runQuery(
    internal.fileStaging.getByOriginalPath,
    {
      vaultId: vault._id,
      originalFilePath: args.path,
      branch,
    },
  );
  if (byOriginalPath) {
    return byOriginalPath;
  }
  return args.context.ctx.runQuery(api.fileStaging.getByNewPath, {
    vaultId: vault._id,
    branch,
    newPath: args.path,
  });
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
    const initialContent = snapshot?.content ?? "";
    const parentCommitSha = snapshot?.parentCommitSha ?? null;

    await context.ctx.runMutation(internal.fileStaging.saveToStaging, {
      vaultId: vault._id,
      initialFilePath: input.path,
      content: input.content,
      initialContent,
      parentCommitSha,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
    default:
      throw new Error(`No executor for tool: ${args.toolName}`);
  }
}
