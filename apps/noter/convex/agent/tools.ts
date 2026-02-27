"use node";

import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { Octokit } from "@octokit/rest";
import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { TOOL_CATALOG } from "./toolCatalog";

const PROD_READ_SENTINEL = "__PROD_READ_PROPOSAL__:";
type AllowedDataTable =
  | "vaults"
  | "vaultInfrastructure"
  | "vaultDomains"
  | "codespaces"
  | "fileStaging"
  | "aiProdAccessRequests"
  | "aiProdAccessAudit";

const dataTableSchema = z.union([
  z.literal("vaults"),
  z.literal("vaultInfrastructure"),
  z.literal("vaultDomains"),
  z.literal("codespaces"),
  z.literal("fileStaging"),
  z.literal("aiProdAccessRequests"),
  z.literal("aiProdAccessAudit"),
]);

function catalogDescription(name: string): string {
  const entry = TOOL_CATALOG.find((t) => t.name === name);
  if (!entry) throw new Error(`Tool "${name}" not found in catalog`);
  return entry.description;
}

// --- Tool Context ---

export interface ToolContext {
  ctx: ActionCtx;
  threadId: string;
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
      vault?.treeData.tree.find((t: { path?: string }) => t.path === input.path)
        ?.sha ?? null;

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

  await toolCtx.ctx.runMutation(
    internal.fileStaging.internalMarkFileForDeletion,
    {
      vaultId: toolCtx.vaultId,
      filePath: input.path,
      parentCommitSha: sha,
      branch: "main",
      userId: toolCtx.userId,
    },
  );
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

function buildProdReadSummary(args: {
  provider: "convex" | "netlify" | "railway";
  resourceKind:
    | "deployment_status"
    | "logs"
    | "data_query"
    | "project_inventory"
    | "site_inventory";
  scope: "vault" | "global";
}): string {
  const provider =
    args.provider === "convex"
      ? "Convex"
      : args.provider === "netlify"
        ? "Netlify"
        : "Railway";
  const resource =
    args.resourceKind === "deployment_status"
      ? "deployment status"
      : args.resourceKind === "logs"
        ? "logs"
        : args.resourceKind === "data_query"
          ? "data sample"
          : args.resourceKind === "project_inventory"
            ? "project inventory"
            : "site inventory";
  const scope = args.scope === "vault" ? "this vault" : "global scope";
  return `I need your approval before reading ${provider} ${resource} for ${scope}.`;
}

function buildParamsPreview(params: Record<string, unknown>): string {
  const json = JSON.stringify(params);
  if (json.length <= 200) {
    return json;
  }
  return `${json.slice(0, 200)}...`;
}

async function executeProdReadRequest(
  toolCtx: ToolContext,
  input: {
    scope: "vault" | "global";
    provider: "convex" | "netlify" | "railway";
    resourceKind:
      | "deployment_status"
      | "logs"
      | "data_query"
      | "project_inventory"
      | "site_inventory";
    toolName: string;
    params: Record<string, unknown>;
    allowRawFallback?: boolean;
  },
): Promise<string> {
  const paramsJson = JSON.stringify(input.params);
  const proposal = await toolCtx.ctx.runMutation(
    internal.chat.index.proposeProdReadInternal,
    {
      threadId: toolCtx.threadId,
      requesterUserId: toolCtx.userId,
      vaultId: input.scope === "vault" ? toolCtx.vaultId : undefined,
      scope: input.scope,
      provider: input.provider,
      resourceKind: input.resourceKind,
      toolName: input.toolName,
      paramsJson,
      allowRawFallback: input.allowRawFallback,
    },
  );

  return (
    `${PROD_READ_SENTINEL}` +
    JSON.stringify({
      requestId: proposal.requestId,
      scope: input.scope,
      provider: input.provider,
      resourceKind: input.resourceKind,
      toolName: input.toolName,
      paramsPreview: buildParamsPreview(input.params),
      summary: buildProdReadSummary({
        scope: input.scope,
        provider: input.provider,
        resourceKind: input.resourceKind,
      }),
    })
  );
}

async function executeRequestConvexStatusRead(
  toolCtx: ToolContext,
): Promise<string> {
  return await executeProdReadRequest(toolCtx, {
    scope: "vault",
    provider: "convex",
    resourceKind: "deployment_status",
    toolName: "request_convex_status_read",
    params: {},
  });
}

async function executeRequestConvexLogsRead(
  toolCtx: ToolContext,
  input: { maxLines?: number; allowRawFallback?: boolean },
): Promise<string> {
  return await executeProdReadRequest(toolCtx, {
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
  toolCtx: ToolContext,
  input: { limit?: number; allowRawFallback?: boolean },
): Promise<string> {
  return await executeProdReadRequest(toolCtx, {
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
  toolCtx: ToolContext,
): Promise<string> {
  return await executeProdReadRequest(toolCtx, {
    scope: "vault",
    provider: "netlify",
    resourceKind: "deployment_status",
    toolName: "request_netlify_status_read",
    params: {},
  });
}

async function executeRequestNetlifyLogsRead(
  toolCtx: ToolContext,
  input: { maxEntries?: number; allowRawFallback?: boolean },
): Promise<string> {
  return await executeProdReadRequest(toolCtx, {
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
  toolCtx: ToolContext,
  input: { limit?: number; allowRawFallback?: boolean },
): Promise<string> {
  return await executeProdReadRequest(toolCtx, {
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

async function executeRequestRailwayStatusRead(
  toolCtx: ToolContext,
): Promise<string> {
  return await executeProdReadRequest(toolCtx, {
    scope: "vault",
    provider: "railway",
    resourceKind: "deployment_status",
    toolName: "request_railway_status_read",
    params: {},
  });
}

async function executeRequestRailwayLogsRead(
  toolCtx: ToolContext,
  input: { maxEntries?: number; allowRawFallback?: boolean },
): Promise<string> {
  return await executeProdReadRequest(toolCtx, {
    scope: "vault",
    provider: "railway",
    resourceKind: "logs",
    toolName: "request_railway_logs_read",
    params: {
      ...(typeof input.maxEntries === "number"
        ? { maxEntries: input.maxEntries }
        : {}),
    },
    allowRawFallback: input.allowRawFallback,
  });
}

async function executeRequestRailwayProjectsRead(
  toolCtx: ToolContext,
  input: { limit?: number; allowRawFallback?: boolean },
): Promise<string> {
  return await executeProdReadRequest(toolCtx, {
    scope: "global",
    provider: "railway",
    resourceKind: "site_inventory",
    toolName: "request_railway_projects_read",
    params: {
      ...(typeof input.limit === "number" ? { limit: input.limit } : {}),
    },
    allowRawFallback: input.allowRawFallback,
  });
}

async function executeRequestConvexDataRead(
  toolCtx: ToolContext,
  input: {
    table: AllowedDataTable;
    scope?: "vault" | "global";
    limit?: number;
    allowRawFallback?: boolean;
  },
): Promise<string> {
  const scope = input.scope ?? "vault";
  return await executeProdReadRequest(toolCtx, {
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

// --- Convex Agent Tool Definitions ---

/**
 * Creates Convex Agent tools bound to the current chat/tool context.
 */
export function createTools(toolCtx: ToolContext) {
  return {
    read_file: createTool({
      description: catalogDescription("read_file"),
      args: z.object({
        path: z.string().describe("File path relative to repository root"),
      }),
      handler: async (_ctx, input) => {
        return await executeReadFile(toolCtx, input);
      },
    }),

    list_files: createTool({
      description: catalogDescription("list_files"),
      args: z.object({
        directory: z
          .string()
          .optional()
          .describe(
            "Optional directory path to filter by (e.g. 'src/components'). Omit to list all files.",
          ),
      }),
      handler: async (_ctx, input) => {
        return await executeListFiles(toolCtx, input);
      },
    }),

    edit_file: createTool({
      description: catalogDescription("edit_file"),
      args: z.object({
        path: z.string().describe("File path relative to repository root"),
        content: z.string().describe("The new full content of the file"),
      }),
      handler: async (_ctx, input) => {
        return await executeEditFile(toolCtx, input);
      },
    }),

    create_file: createTool({
      description: catalogDescription("create_file"),
      args: z.object({
        path: z.string().describe("File path relative to repository root"),
        content: z.string().describe("The content of the new file"),
      }),
      handler: async (_ctx, input) => {
        return await executeCreateFile(toolCtx, input);
      },
    }),

    delete_file: createTool({
      description: catalogDescription("delete_file"),
      args: z.object({
        path: z.string().describe("File path relative to repository root"),
      }),
      handler: async (_ctx, input) => {
        return await executeDeleteFile(toolCtx, input);
      },
    }),

    github_api: createTool({
      description: catalogDescription("github_api"),
      args: z.object({
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
      handler: async (_ctx, input) => {
        return await executeGithubApi(toolCtx, input);
      },
    }),

    commit_and_push: createTool({
      description: catalogDescription("commit_and_push"),
      args: z.object({
        message: z
          .string()
          .describe("A short commit message describing the changes"),
      }),
      handler: async (_ctx, input) => {
        // This tool result is a signal — the chat action turns it into an approval card.
        return `__COMMIT_PROPOSAL__:${input.message}`;
      },
    }),

    request_convex_status_read: createTool({
      description: catalogDescription("request_convex_status_read"),
      args: z.object({}),
      handler: async () => {
        return await executeRequestConvexStatusRead(toolCtx);
      },
    }),

    request_convex_logs_read: createTool({
      description: catalogDescription("request_convex_logs_read"),
      args: z.object({
        maxLines: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Maximum log lines to include"),
        allowRawFallback: z
          .boolean()
          .optional()
          .describe("In owner mode, allow explicit raw payload fallback"),
      }),
      handler: async (_ctx, input) => {
        return await executeRequestConvexLogsRead(toolCtx, input);
      },
    }),

    request_netlify_status_read: createTool({
      description: catalogDescription("request_netlify_status_read"),
      args: z.object({}),
      handler: async () => {
        return await executeRequestNetlifyStatusRead(toolCtx);
      },
    }),

    request_netlify_logs_read: createTool({
      description: catalogDescription("request_netlify_logs_read"),
      args: z.object({
        maxEntries: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Maximum deployment entries to include"),
        allowRawFallback: z
          .boolean()
          .optional()
          .describe("In owner mode, allow explicit raw payload fallback"),
      }),
      handler: async (_ctx, input) => {
        return await executeRequestNetlifyLogsRead(toolCtx, input);
      },
    }),

    request_convex_projects_read: createTool({
      description: catalogDescription("request_convex_projects_read"),
      args: z.object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Maximum projects to include"),
        allowRawFallback: z
          .boolean()
          .optional()
          .describe("In owner mode, allow explicit raw payload fallback"),
      }),
      handler: async (_ctx, input) => {
        return await executeRequestConvexProjectsRead(toolCtx, input);
      },
    }),

    request_netlify_projects_read: createTool({
      description: catalogDescription("request_netlify_projects_read"),
      args: z.object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Maximum projects to include"),
        allowRawFallback: z
          .boolean()
          .optional()
          .describe("In owner mode, allow explicit raw payload fallback"),
      }),
      handler: async (_ctx, input) => {
        return await executeRequestNetlifyProjectsRead(toolCtx, input);
      },
    }),

    request_railway_status_read: createTool({
      description: catalogDescription("request_railway_status_read"),
      args: z.object({}),
      handler: async () => {
        return await executeRequestRailwayStatusRead(toolCtx);
      },
    }),

    request_railway_logs_read: createTool({
      description: catalogDescription("request_railway_logs_read"),
      args: z.object({
        maxEntries: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe("Maximum deployment log entries to include"),
        allowRawFallback: z
          .boolean()
          .optional()
          .describe("In owner mode, allow explicit raw payload fallback"),
      }),
      handler: async (_ctx, input) => {
        return await executeRequestRailwayLogsRead(toolCtx, input);
      },
    }),

    request_railway_projects_read: createTool({
      description: catalogDescription("request_railway_projects_read"),
      args: z.object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Maximum projects to include"),
        allowRawFallback: z
          .boolean()
          .optional()
          .describe("In owner mode, allow explicit raw payload fallback"),
      }),
      handler: async (_ctx, input) => {
        return await executeRequestRailwayProjectsRead(toolCtx, input);
      },
    }),

    request_convex_data_read: createTool({
      description: catalogDescription("request_convex_data_read"),
      args: z.object({
        table: dataTableSchema.describe("Convex table to sample"),
        scope: z
          .enum(["vault", "global"])
          .optional()
          .describe("Read scope. Defaults to vault scope."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Maximum rows to return"),
        allowRawFallback: z
          .boolean()
          .optional()
          .describe("In owner mode, allow explicit raw payload fallback"),
      }),
      handler: async (_ctx, input) => {
        return await executeRequestConvexDataRead(toolCtx, input);
      },
    }),
  };
}
