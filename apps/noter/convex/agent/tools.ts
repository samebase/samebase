// @ts-nocheck
"use node";

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { Octokit } from "@octokit/rest";
import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { TOOL_CATALOG } from "./toolCatalog";

function catalogDescription(name: string): string {
  const entry = TOOL_CATALOG.find((t) => t.name === name);
  if (!entry) throw new Error(`Tool "${name}" not found in catalog`);
  return entry.description;
}

// --- Tool Context ---

export interface ToolContext {
  ctx: ActionCtx;
  vaultId: Id<"vaults">;
  owner: string;
  repo: string;
  userId: Id<"users">;
  accessToken: string;
}

// --- GitHub API Allowlist ---

const GITHUB_API_ALLOWLIST = new Set([
  // Repos
  "repos.get",
  "repos.getContent",
  "repos.listCommits",
  "repos.listBranches",
  "repos.getBranch",
  "repos.listContributors",
  "repos.listLanguages",
  "repos.listTags",
  "repos.listReleases",
  "repos.getRelease",
  "repos.getLatestRelease",
  "repos.compareCommits",
  "repos.compareCommitsWithBasehead",
  // Pulls
  "pulls.list",
  "pulls.get",
  "pulls.create",
  "pulls.update",
  "pulls.listFiles",
  "pulls.listReviews",
  "pulls.listReviewComments",
  "pulls.listCommits",
  "pulls.checkIfMerged",
  "pulls.merge",
  "pulls.requestReviewers",
  // Issues
  "issues.list",
  "issues.get",
  "issues.create",
  "issues.update",
  "issues.listComments",
  "issues.createComment",
  "issues.listLabelsOnIssue",
  "issues.addLabels",
  "issues.listForRepo",
  // Branches
  "branches.list",
  "branches.get",
  // Checks / CI
  "checks.listForRef",
  "checks.listForSuite",
  "checks.get",
  "checks.listSuitesForRef",
  // Actions / Workflows
  "actions.listWorkflowRunsForRepo",
  "actions.getWorkflowRun",
  "actions.listJobsForWorkflowRun",
  "actions.listRepoWorkflows",
  // Git
  "git.getRef",
  "git.getCommit",
  "git.getTree",
  "git.getBlob",
  "git.listMatchingRefs",
  // Users
  "users.getAuthenticated",
  // Search
  "search.issuesAndPullRequests",
  "search.code",
  "search.commits",
]);

// --- Tool Executor Functions ---

export async function executeReadFile(
  toolCtx: ToolContext,
  input: { path: string },
): Promise<string> {
  // 1. Check staging
  const staging = await toolCtx.ctx.runQuery(
    internal.fileStaging.getByOriginalPath,
    { vaultId: toolCtx.vaultId, originalFilePath: input.path },
  );
  if (staging) {
    return staging.content;
  }

  // 2. Check blobs via vault tree
  const vault = await toolCtx.ctx.runQuery(internal.vault.getById, {
    id: toolCtx.vaultId,
  });
  if (vault) {
    const treeSha = vault.treeData.tree.find(
      (t: { path?: string }) => t.path === input.path,
    )?.sha;
    if (treeSha) {
      const blob = await toolCtx.ctx.runQuery(
        internal.gitOperations.getBlobBySha,
        { sha: treeSha },
      );
      if (blob?.text !== undefined) {
        return blob.text;
      }
    }
  }

  // 3. Fall back to GitHub API
  const octokit = new Octokit({ auth: toolCtx.accessToken });
  const file = await octokit.rest.repos.getContent({
    owner: toolCtx.owner,
    repo: toolCtx.repo,
    path: input.path,
  });
  if (Array.isArray(file.data) || file.data.type !== "file") {
    return `Error: ${input.path} is a directory, not a file`;
  }
  return Buffer.from(file.data.content, "base64").toString("utf-8");
}

async function executeListFiles(
  toolCtx: ToolContext,
  input: { directory?: string },
): Promise<string> {
  const vault = await toolCtx.ctx.runQuery(internal.vault.getById, {
    id: toolCtx.vaultId,
  });
  if (!vault) return "Error: vault not found";

  let entries = vault.treeData.tree.filter(
    (t: { type?: string }) => t.type === "blob",
  );
  if (input.directory) {
    const prefix = input.directory.endsWith("/")
      ? input.directory
      : input.directory + "/";
    entries = entries.filter((t: { path?: string }) =>
      t.path?.startsWith(prefix),
    );
  }
  if (entries.length === 0) {
    return input.directory
      ? `No files found in directory: ${input.directory}`
      : "Repository has no files";
  }
  return entries.map((t: { path?: string }) => t.path).join("\n");
}

async function executeEditFile(
  toolCtx: ToolContext,
  input: { path: string; content: string },
): Promise<string> {
  // Check if file is already staged (i.e. editor is open)
  const staging = await toolCtx.ctx.runQuery(
    internal.fileStaging.getByOriginalPath,
    { vaultId: toolCtx.vaultId, originalFilePath: input.path },
  );

  if (staging) {
    // File is staged — push through the collaborative editing stream
    // so open editors update in real-time.
    await toolCtx.ctx.runMutation(internal.collaborative.pushContentUpdate, {
      vaultId: toolCtx.vaultId,
      filePath: input.path,
      newContent: input.content,
      userId: toolCtx.userId,
    });
  } else {
    // Not yet staged — read current content for proper diffs, then create staging
    let initialContent = "";
    try {
      initialContent = await executeReadFile(toolCtx, { path: input.path });
    } catch {
      initialContent = "";
    }

    const vault = await toolCtx.ctx.runQuery(internal.vault.getById, {
      id: toolCtx.vaultId,
    });
    const parentCommitSha =
      vault?.treeData.tree.find(
        (t: { path?: string }) => t.path === input.path,
      )?.sha ?? null;

    await toolCtx.ctx.runMutation(internal.fileStaging.saveToStaging, {
      vaultId: toolCtx.vaultId,
      initialFilePath: input.path,
      content: input.content,
      initialContent,
      parentCommitSha,
      branch: "main",
      userId: toolCtx.userId,
    });
  }

  return `File edited: ${input.path}`;
}

async function executeCreateFile(
  toolCtx: ToolContext,
  input: { path: string; content: string },
): Promise<string> {
  // Use saveToStaging with empty initialContent (new file has no prior content)
  await toolCtx.ctx.runMutation(internal.fileStaging.saveToStaging, {
    vaultId: toolCtx.vaultId,
    initialFilePath: input.path,
    content: input.content,
    initialContent: "",
    parentCommitSha: null,
    branch: "main",
    userId: toolCtx.userId,
  });
  return `File created: ${input.path}`;
}

async function executeDeleteFile(
  toolCtx: ToolContext,
  input: { path: string },
): Promise<string> {
  const vault = await toolCtx.ctx.runQuery(internal.vault.getById, {
    id: toolCtx.vaultId,
  });
  const sha =
    vault?.treeData.tree.find((t: { path?: string }) => t.path === input.path)
      ?.sha ?? null;

  await toolCtx.ctx.runMutation(internal.fileStaging.internalMarkFileForDeletion, {
    vaultId: toolCtx.vaultId,
    filePath: input.path,
    parentCommitSha: sha,
    branch: "main",
    userId: toolCtx.userId,
  });
  return `File marked for deletion: ${input.path}`;
}

async function executeGithubApi(
  toolCtx: ToolContext,
  input: { endpoint: string; params?: Record<string, unknown> },
): Promise<string> {
  if (!GITHUB_API_ALLOWLIST.has(input.endpoint)) {
    return `Error: endpoint "${input.endpoint}" is not allowed. Use only allowlisted GitHub API endpoints.`;
  }

  const [category, method] = input.endpoint.split(".");
  if (!category || !method) {
    return `Error: invalid endpoint format "${input.endpoint}". Expected "category.method" (e.g. "pulls.list")`;
  }

  const octokit = new Octokit({ auth: toolCtx.accessToken });

  const params = {
    owner: toolCtx.owner,
    repo: toolCtx.repo,
    ...(input.params ?? {}),
  };

  // @ts-expect-error — dynamic dispatch on Octokit.rest
  const categoryObj = octokit.rest[category];
  if (!categoryObj) {
    return `Error: unknown GitHub API category "${category}"`;
  }
  const fn = categoryObj[method];
  if (typeof fn !== "function") {
    return `Error: unknown method "${method}" on category "${category}"`;
  }

  const response = await fn(params);

  const json = JSON.stringify(response.data, null, 2);
  if (json.length > 15000) {
    return json.slice(0, 15000) + "\n\n... (response truncated)";
  }
  return json;
}

// --- LangGraph Tool Definitions ---

/**
 * Creates LangGraph tool instances bound to a specific ToolContext.
 * Each tool wraps the executor functions above.
 */
export function createTools(toolCtx: ToolContext) {
  const readFile = tool(
    async (input) => {
      return await executeReadFile(toolCtx, input);
    },
    {
      name: "read_file",
      description: catalogDescription("read_file"),
      schema: z.object({
        path: z.string().describe("File path relative to repository root"),
      }),
    },
  );

  const listFiles = tool(
    async (input) => {
      return await executeListFiles(toolCtx, input);
    },
    {
      name: "list_files",
      description: catalogDescription("list_files"),
      schema: z.object({
        directory: z
          .string()
          .optional()
          .describe(
            "Optional directory path to filter by (e.g. 'src/components'). Omit to list all files.",
          ),
      }),
    },
  );

  const editFile = tool(
    async (input) => {
      return await executeEditFile(toolCtx, input);
    },
    {
      name: "edit_file",
      description: catalogDescription("edit_file"),
      schema: z.object({
        path: z.string().describe("File path relative to repository root"),
        content: z.string().describe("The new full content of the file"),
      }),
    },
  );

  const createFile = tool(
    async (input) => {
      return await executeCreateFile(toolCtx, input);
    },
    {
      name: "create_file",
      description: catalogDescription("create_file"),
      schema: z.object({
        path: z.string().describe("File path relative to repository root"),
        content: z.string().describe("The content of the new file"),
      }),
    },
  );

  const deleteFile = tool(
    async (input) => {
      return await executeDeleteFile(toolCtx, input);
    },
    {
      name: "delete_file",
      description: catalogDescription("delete_file"),
      schema: z.object({
        path: z.string().describe("File path relative to repository root"),
      }),
    },
  );

  const githubApi = tool(
    async (input) => {
      return await executeGithubApi(toolCtx, input);
    },
    {
      name: "github_api",
      description: catalogDescription("github_api"),
      schema: z.object({
        endpoint: z
          .string()
          .describe(
            'GitHub REST API endpoint in "category.method" format, e.g. "pulls.list", "issues.get"',
          ),
        params: z
          .record(z.string(), z.unknown())
          .optional()
          .describe(
            "Parameters passed to the GitHub API method. Owner and repo are auto-injected.",
          ),
      }),
    },
  );

  const commitAndPush = tool(
    async (input) => {
      // This tool's result is a signal — the graph handles early termination
      return `__COMMIT_PROPOSAL__:${input.message}`;
    },
    {
      name: "commit_and_push",
      description: catalogDescription("commit_and_push"),
      schema: z.object({
        message: z
          .string()
          .describe("A short commit message describing the changes"),
      }),
    },
  );

  return [
    readFile,
    listFiles,
    editFile,
    createFile,
    deleteFile,
    githubApi,
    commitAndPush,
  ];
}
