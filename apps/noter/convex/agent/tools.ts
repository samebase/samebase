"use node";

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { Octokit } from "@octokit/rest";
import { api, internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

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

async function executeReadFile(
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
  const repoFullName = `${toolCtx.owner}/${toolCtx.repo}`;
  await toolCtx.ctx.runAction(api.fileStagingActions.getFileForEditing, {
    repositoryFullName: repoFullName,
    originalFilePath: input.path,
  });

  await toolCtx.ctx.runMutation(internal.fileStaging.saveToStaging, {
    vaultId: toolCtx.vaultId,
    initialFilePath: input.path,
    content: input.content,
    initialContent: "",
    parentCommitSha: null,
    branch: "main",
  });

  return `File edited: ${input.path}`;
}

async function executeCreateFile(
  toolCtx: ToolContext,
  input: { path: string; content: string },
): Promise<string> {
  await toolCtx.ctx.runMutation(api.fileStaging.createFileInStaging, {
    vaultId: toolCtx.vaultId,
    filePath: input.path,
    content: input.content,
    branch: "main",
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

  await toolCtx.ctx.runMutation(api.fileStaging.markFileForDeletion, {
    vaultId: toolCtx.vaultId,
    filePath: input.path,
    parentCommitSha: sha,
    branch: "main",
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
      description:
        "Read the contents of a file in the repository. Returns the file content as text.",
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
      description:
        "List files in the repository, optionally filtered to a directory.",
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
      description:
        "Edit an existing file by replacing its entire content. The file must already exist.",
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
      description: "Create a new file in the repository.",
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
      description: "Mark a file for deletion in the repository.",
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
      description: `Call the GitHub REST API. Owner and repo are auto-filled from the current vault context.

Common endpoints:
- pulls.list — List pull requests
- pulls.get — Get a single PR (params: { pull_number })
- pulls.create — Create a PR (params: { title, head, base, body? })
- issues.list — List issues
- issues.get — Get a single issue (params: { issue_number })
- issues.create — Create an issue (params: { title, body? })
- checks.listForRef — Get CI status (params: { ref })
- branches.list — List branches
- actions.listWorkflowRunsForRepo — List workflow runs`,
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
      description:
        "Propose committing all currently staged file changes and pushing to the main branch. The user will see an approval button — changes are NOT committed until approved.",
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
