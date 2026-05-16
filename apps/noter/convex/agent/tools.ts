"use node";

import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { Octokit } from "@octokit/rest";
import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { TOOL_CATALOG } from "./toolCatalog";

const PROD_READ_SENTINEL = "__PROD_READ_PROPOSAL__:";

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
  branch: string;
  userId: Id<"users">;
  accessToken: string;
}

const replaceInFileReplacementSchema = z.object({
  oldText: z
    .string()
    .min(1)
    .describe("Exact existing text to replace, including whitespace"),
  newText: z.string().describe("Replacement text"),
});
type ReplaceInFileReplacement = z.infer<typeof replaceInFileReplacementSchema>;

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

async function executeSharedRuntimeTool(
  toolCtx: ToolContext,
  args: {
    toolName: string;
    input: unknown;
  },
): Promise<string> {
  const result = await toolCtx.ctx.runAction(
    internal.toolRuntime.runtime.runTool,
    {
      toolName: args.toolName,
      inputJson: JSON.stringify(args.input),
      surface: "agent",
      userId: toolCtx.userId,
      grantedScopes: [],
      vaultId: toolCtx.vaultId,
      branch: toolCtx.branch,
      threadId: toolCtx.threadId,
    },
  );
  if (result.status === "ok") {
    if (typeof result.structuredContentJson === "string") {
      try {
        const parsed: unknown = JSON.parse(result.structuredContentJson);
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          "type" in parsed &&
          parsed.type === "prod_read_proposal"
        ) {
          return `${PROD_READ_SENTINEL}${JSON.stringify(parsed)}`;
        }
      } catch {
        // Non-JSON structured content falls through to plain text.
      }
    }
    return result.text;
  }
  return `Error: ${result.text}`;
}

export async function executeReadFile(
  toolCtx: ToolContext,
  input: { path: string },
): Promise<string> {
  return await executeSharedRuntimeTool(toolCtx, {
    toolName: "read_file",
    input,
  });
}

async function executeListFiles(
  toolCtx: ToolContext,
  input: { directory?: string },
): Promise<string> {
  return await executeSharedRuntimeTool(toolCtx, {
    toolName: "list_files",
    input,
  });
}

async function executeGetVaultRemoteBranches(
  toolCtx: ToolContext,
): Promise<string> {
  return await executeSharedRuntimeTool(toolCtx, {
    toolName: "get_vault_remote_branches",
    input: {},
  });
}

async function executeEditFile(
  toolCtx: ToolContext,
  input: { path: string; content: string },
): Promise<string> {
  return await executeSharedRuntimeTool(toolCtx, {
    toolName: "edit_file",
    input,
  });
}

async function executeReplaceInFile(
  toolCtx: ToolContext,
  input: { path: string; replacements: ReplaceInFileReplacement[] },
): Promise<string> {
  return await executeSharedRuntimeTool(toolCtx, {
    toolName: "replace_in_file",
    input,
  });
}

async function executeCreateFile(
  toolCtx: ToolContext,
  input: { path: string; content: string },
): Promise<string> {
  return await executeSharedRuntimeTool(toolCtx, {
    toolName: "create_file",
    input,
  });
}

async function executeDeleteFile(
  toolCtx: ToolContext,
  input: { path: string },
): Promise<string> {
  return await executeSharedRuntimeTool(toolCtx, {
    toolName: "delete_file",
    input,
  });
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

    get_vault_remote_branches: createTool({
      description: catalogDescription("get_vault_remote_branches"),
      args: z.object({}),
      handler: async () => {
        return await executeGetVaultRemoteBranches(toolCtx);
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

    replace_in_file: createTool({
      description: catalogDescription("replace_in_file"),
      args: z.object({
        path: z.string().describe("File path relative to repository root"),
        replacements: z
          .array(replaceInFileReplacementSchema)
          .min(1)
          .describe(
            "Exact oldText/newText replacements to apply atomically to the file",
          ),
      }),
      handler: async (_ctx, input) => {
        return await executeReplaceInFile(toolCtx, input);
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
        return await executeSharedRuntimeTool(toolCtx, {
          toolName: "request_convex_status_read",
          input: {},
        });
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
        return await executeSharedRuntimeTool(toolCtx, {
          toolName: "request_convex_logs_read",
          input,
        });
      },
    }),

    request_cloudflare_status_read: createTool({
      description: catalogDescription("request_cloudflare_status_read"),
      args: z.object({}),
      handler: async () => {
        return await executeSharedRuntimeTool(toolCtx, {
          toolName: "request_cloudflare_status_read",
          input: {},
        });
      },
    }),

    request_cloudflare_logs_read: createTool({
      description: catalogDescription("request_cloudflare_logs_read"),
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
        return await executeSharedRuntimeTool(toolCtx, {
          toolName: "request_cloudflare_logs_read",
          input,
        });
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
        return await executeSharedRuntimeTool(toolCtx, {
          toolName: "request_convex_projects_read",
          input,
        });
      },
    }),

    request_cloudflare_accounts_read: createTool({
      description: catalogDescription("request_cloudflare_accounts_read"),
      args: z.object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Maximum accounts to include"),
        allowRawFallback: z
          .boolean()
          .optional()
          .describe("In owner mode, allow explicit raw payload fallback"),
      }),
      handler: async (_ctx, input) => {
        return await executeSharedRuntimeTool(toolCtx, {
          toolName: "request_cloudflare_accounts_read",
          input,
        });
      },
    }),

    request_cloudflare_workers_inventory_read: createTool({
      description: catalogDescription(
        "request_cloudflare_workers_inventory_read",
      ),
      args: z.object({
        accountId: z
          .string()
          .optional()
          .describe(
            "Cloudflare account ID to query (optional if already stored on the connection)",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Maximum Workers to include"),
        allowRawFallback: z
          .boolean()
          .optional()
          .describe("In owner mode, allow explicit raw payload fallback"),
      }),
      handler: async (_ctx, input) => {
        return await executeSharedRuntimeTool(toolCtx, {
          toolName: "request_cloudflare_workers_inventory_read",
          input,
        });
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
        return await executeSharedRuntimeTool(toolCtx, {
          toolName: "request_convex_data_read",
          input,
        });
      },
    }),
  };
}
