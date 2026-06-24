import { z } from "zod";
import type { ToolDefinition, ToolJsonSchema, ToolSurface } from "./types";
import { hasAllScopes } from "./utils";
import { isRecord } from "../jsonUtils";

const emptyInputSchema = z.object({});
const createAppInputSchema = z.object({
  name: z.string().describe("Name for the new app and GitHub repository."),
  owner: z
    .string()
    .describe("GitHub user or organization where Samebase should create the app repository."),
  convexProjectName: z.string().describe("Convex project name to provision for the app."),
  cloudflareWorkerName: z.string().describe("Cloudflare Worker name to provision for the app."),
  description: z.string().optional().describe("Optional GitHub repository description."),
  private: z
    .boolean()
    .optional()
    .describe("Whether to create a private GitHub repository. Defaults to true."),
});
const readFileInputSchema = z.object({
  path: z.string().describe("File path relative to repository root"),
});
const listFilesInputSchema = z.object({
  directory: z
    .string()
    .optional()
    .describe(
      "Optional directory path to filter by (e.g. 'src/components'). Omit to list all files.",
    ),
});
const editFileInputSchema = z.object({
  path: z.string().describe("File path relative to repository root"),
  content: z.string().describe("The new full content of the file"),
});
const replaceInFileReplacementSchema = z.object({
  oldText: z.string().min(1).describe("Exact existing text to replace, including whitespace"),
  newText: z.string().describe("Replacement text"),
});
const replaceInFileInputSchema = z.object({
  path: z.string().describe("File path relative to repository root"),
  replacements: z
    .array(replaceInFileReplacementSchema)
    .min(1)
    .describe("Exact oldText/newText replacements to apply atomically"),
});
const createFileInputSchema = z.object({
  path: z.string().describe("File path relative to repository root"),
  content: z.string().describe("The content of the new file"),
});
const deleteFileInputSchema = z.object({
  path: z.string().describe("File path relative to repository root"),
});
const prodReadScopeSchema = z.enum(["vault", "global"]);
const prodReadAllowRawFallbackSchema = z.boolean().optional();
const requestConvexLogsReadInputSchema = z.object({
  maxLines: z.number().int().min(1).max(100).optional().describe("Maximum log lines to include"),
  allowRawFallback: prodReadAllowRawFallbackSchema.describe(
    "In owner mode, allow explicit raw payload fallback",
  ),
});
const requestConvexProjectsReadInputSchema = z.object({
  limit: z.number().int().min(1).max(100).optional().describe("Maximum projects to include"),
  allowRawFallback: prodReadAllowRawFallbackSchema.describe(
    "In owner mode, allow explicit raw payload fallback",
  ),
});
const requestCloudflareLogsReadInputSchema = z.object({
  maxEntries: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Maximum deployment entries to include"),
  allowRawFallback: prodReadAllowRawFallbackSchema.describe(
    "In owner mode, allow explicit raw payload fallback",
  ),
});
const requestCloudflareAccountsReadInputSchema = z.object({
  limit: z.number().int().min(1).max(100).optional().describe("Maximum accounts to include"),
  allowRawFallback: prodReadAllowRawFallbackSchema.describe(
    "In owner mode, allow explicit raw payload fallback",
  ),
});
const requestCloudflareWorkersInventoryReadInputSchema = z.object({
  accountId: z
    .string()
    .optional()
    .describe("Cloudflare account ID to query. Omit only when a default account is selected."),
  limit: z.number().int().min(1).max(100).optional().describe("Maximum Workers to include"),
  allowRawFallback: prodReadAllowRawFallbackSchema.describe(
    "In owner mode, allow explicit raw payload fallback",
  ),
});
const convexDataTableSchema = z.enum([
  "vaults",
  "vaultConvexDeployments",
  "vaultCloudflareWorkers",
  "vaultDomains",
  "codespaces",
  "fileStaging",
  "aiProdAccessRequests",
  "aiProdAccessAudit",
]);
const requestConvexDataReadInputSchema = z.object({
  table: convexDataTableSchema.describe("Convex table to sample"),
  scope: prodReadScopeSchema.optional().describe("Read scope. Defaults to vault scope."),
  limit: z.number().int().min(1).max(100).optional().describe("Maximum rows to return"),
  allowRawFallback: prodReadAllowRawFallbackSchema.describe(
    "In owner mode, allow explicit raw payload fallback",
  ),
});

export type ToolCatalogEntry<TInput> = ToolDefinition<TInput>;

function withRequiredFields(inputSchema: ToolJsonSchema, requiredFields: string[]): ToolJsonSchema {
  if (requiredFields.length === 0) {
    return inputSchema;
  }
  return {
    ...inputSchema,
    required: requiredFields,
  };
}

function contextRequiredFields(args: {
  tool: Pick<
    ToolDefinition<unknown>,
    "requiresVaultContext" | "requiresBranchContext" | "requiresThreadContext" | "inputSchema"
  >;
}): string[] {
  const required = new Set(args.tool.inputSchema.required ?? []);
  if (args.tool.requiresVaultContext) {
    required.add("vaultId");
  }
  if (args.tool.requiresBranchContext) {
    required.add("branch");
  }
  if (args.tool.requiresThreadContext) {
    required.add("threadId");
  }
  return Array.from(required);
}

function parseRequiredFields(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  const requiredFields: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      return undefined;
    }
    requiredFields.push(item);
  }
  return requiredFields;
}

function zodToToolInputSchema(schema: z.ZodType<unknown>): ToolJsonSchema {
  const jsonSchema = z.toJSONSchema(schema);
  if (jsonSchema.type !== "object") {
    throw new Error("Tool input schemas must serialize to JSON object schemas.");
  }

  const properties = isRecord(jsonSchema.properties) ? jsonSchema.properties : {};
  const required = parseRequiredFields(jsonSchema.required);

  return {
    type: "object",
    properties,
    ...(required ? { required } : {}),
    additionalProperties: false,
  };
}

export function buildMcpToolInputSchema(
  tool: Pick<
    ToolDefinition<unknown>,
    "requiresVaultContext" | "requiresBranchContext" | "requiresThreadContext" | "inputSchema"
  >,
): ToolJsonSchema {
  const properties: Record<string, unknown> = {
    ...tool.inputSchema.properties,
  };
  if (tool.requiresVaultContext) {
    properties.vaultId = {
      type: "string",
      description: "Samebase vault ID.",
    };
  }
  if (tool.requiresBranchContext) {
    properties.branch = {
      type: "string",
      description: "Branch name to operate on.",
    };
  }
  if (tool.requiresThreadContext) {
    properties.threadId = {
      type: "string",
      description: "Thread ID used for proposal lifecycle tracking.",
    };
  }
  return withRequiredFields(
    {
      ...tool.inputSchema,
      properties,
    },
    contextRequiredFields({ tool }),
  );
}

export const emptyToolInputSchema = zodToToolInputSchema(emptyInputSchema);

export const createAppToolInputSchema = zodToToolInputSchema(createAppInputSchema);

export const readFileToolInputSchema = zodToToolInputSchema(readFileInputSchema);

export const listFilesToolInputSchema = zodToToolInputSchema(listFilesInputSchema);

export const editFileToolInputSchema = zodToToolInputSchema(editFileInputSchema);

export const replaceInFileToolInputSchema = zodToToolInputSchema(replaceInFileInputSchema);

export const createFileToolInputSchema = zodToToolInputSchema(createFileInputSchema);

export const deleteFileToolInputSchema = zodToToolInputSchema(deleteFileInputSchema);

export const requestConvexLogsReadToolInputSchema = zodToToolInputSchema(
  requestConvexLogsReadInputSchema,
);

export const requestConvexProjectsReadToolInputSchema = zodToToolInputSchema(
  requestConvexProjectsReadInputSchema,
);

export const requestCloudflareLogsReadToolInputSchema = zodToToolInputSchema(
  requestCloudflareLogsReadInputSchema,
);

export const requestCloudflareAccountsReadToolInputSchema = zodToToolInputSchema(
  requestCloudflareAccountsReadInputSchema,
);

export const requestCloudflareWorkersInventoryReadToolInputSchema = zodToToolInputSchema(
  requestCloudflareWorkersInventoryReadInputSchema,
);

export const requestConvexDataReadToolInputSchema = zodToToolInputSchema(
  requestConvexDataReadInputSchema,
);

export const RUNTIME_TOOL_CATALOG: ToolCatalogEntry<unknown>[] = [
  {
    name: "create_app",
    description:
      "Create a new Samebase app. This starts the same workflow as the New App page: create a GitHub repository, seed the starter app, provision Convex, and provision Cloudflare.",
    surfaces: ["mcp"],
    requiredScopes: ["apps.create"],
    requiresVaultContext: false,
    requiresBranchContext: false,
    requiresThreadContext: false,
    requiresGithubConnection: true,
    safety: "write",
    inputSchema: createAppToolInputSchema,
    agentArgs: createAppInputSchema,
  },
  {
    name: "read_file",
    description:
      "Read the contents of a file in the repository. Required input: path relative to the repository root. Returns the file content as text.",
    surfaces: ["agent"],
    requiredScopes: [],
    requiresVaultContext: true,
    requiresBranchContext: true,
    requiresThreadContext: false,
    requiresGithubConnection: true,
    safety: "read_only",
    inputSchema: readFileToolInputSchema,
    agentArgs: readFileInputSchema,
  },
  {
    name: "list_files",
    description: "List files in the repository, optionally filtered to a directory.",
    surfaces: ["agent"],
    requiredScopes: [],
    requiresVaultContext: true,
    requiresBranchContext: true,
    requiresThreadContext: false,
    requiresGithubConnection: true,
    safety: "read_only",
    inputSchema: listFilesToolInputSchema,
    agentArgs: listFilesInputSchema,
  },
  {
    name: "edit_file",
    description:
      "Edit an existing file by replacing its entire content. Required inputs: path relative to the repository root and content containing the full new file text. The file must already exist.",
    surfaces: ["agent"],
    requiredScopes: [],
    requiresVaultContext: true,
    requiresBranchContext: true,
    requiresThreadContext: false,
    requiresGithubConnection: true,
    safety: "write",
    inputSchema: editFileToolInputSchema,
    agentArgs: editFileInputSchema,
  },
  {
    name: "replace_in_file",
    description:
      "Edit an existing file by replacing exact text snippets without rewriting the whole file. Required inputs: path and a non-empty replacements array of { oldText, newText }.",
    surfaces: ["agent"],
    requiredScopes: [],
    requiresVaultContext: true,
    requiresBranchContext: true,
    requiresThreadContext: false,
    requiresGithubConnection: true,
    safety: "write",
    inputSchema: replaceInFileToolInputSchema,
    agentArgs: replaceInFileInputSchema,
  },
  {
    name: "create_file",
    description: "Create a new file in the repository. Required inputs: path and content.",
    surfaces: ["agent"],
    requiredScopes: [],
    requiresVaultContext: true,
    requiresBranchContext: true,
    requiresThreadContext: false,
    requiresGithubConnection: true,
    safety: "write",
    inputSchema: createFileToolInputSchema,
    agentArgs: createFileInputSchema,
  },
  {
    name: "delete_file",
    description: "Mark a file for deletion in the repository. Required input: path.",
    surfaces: ["agent"],
    requiredScopes: [],
    requiresVaultContext: true,
    requiresBranchContext: true,
    requiresThreadContext: false,
    requiresGithubConnection: true,
    safety: "destructive",
    inputSchema: deleteFileToolInputSchema,
    agentArgs: deleteFileInputSchema,
  },
  {
    name: "get_vault_remote_branches",
    description:
      "List remote branches for the current vault with ahead/behind and pull request metadata.",
    surfaces: ["agent"],
    requiredScopes: [],
    requiresVaultContext: true,
    requiresBranchContext: false,
    requiresThreadContext: false,
    requiresGithubConnection: false,
    safety: "read_only",
    inputSchema: emptyToolInputSchema,
    agentArgs: emptyInputSchema,
  },
  {
    name: "request_convex_status_read",
    description:
      "Request approval to read Convex deployment status for the current vault. This tool only creates an approval proposal and does not perform direct production reads.",
    surfaces: ["agent"],
    requiredScopes: [],
    requiresVaultContext: true,
    requiresBranchContext: false,
    requiresThreadContext: true,
    requiresGithubConnection: false,
    safety: "proposal_only",
    inputSchema: emptyToolInputSchema,
    agentArgs: emptyInputSchema,
  },
  {
    name: "request_convex_logs_read",
    description:
      "Request approval to read Convex deployment activity/log snapshot for the current vault. This tool only proposes access.",
    surfaces: ["agent"],
    requiredScopes: [],
    requiresVaultContext: true,
    requiresBranchContext: false,
    requiresThreadContext: true,
    requiresGithubConnection: false,
    safety: "proposal_only",
    inputSchema: requestConvexLogsReadToolInputSchema,
    agentArgs: requestConvexLogsReadInputSchema,
  },
  {
    name: "request_convex_projects_read",
    description:
      "Request approval to list Convex projects for the configured team. This tool only creates an approval proposal and does not execute direct reads.",
    surfaces: ["agent"],
    requiredScopes: [],
    requiresVaultContext: false,
    requiresBranchContext: false,
    requiresThreadContext: true,
    requiresGithubConnection: false,
    safety: "proposal_only",
    inputSchema: requestConvexProjectsReadToolInputSchema,
    agentArgs: requestConvexProjectsReadInputSchema,
  },
  {
    name: "request_cloudflare_status_read",
    description:
      "Request approval to read Cloudflare Worker status for the current vault. This tool only creates an approval proposal.",
    surfaces: ["agent"],
    requiredScopes: [],
    requiresVaultContext: true,
    requiresBranchContext: false,
    requiresThreadContext: true,
    requiresGithubConnection: false,
    safety: "proposal_only",
    inputSchema: emptyToolInputSchema,
    agentArgs: emptyInputSchema,
  },
  {
    name: "request_cloudflare_logs_read",
    description:
      "Request approval to read Cloudflare Workers build logs for the current vault. This tool only proposes access.",
    surfaces: ["agent"],
    requiredScopes: [],
    requiresVaultContext: true,
    requiresBranchContext: false,
    requiresThreadContext: true,
    requiresGithubConnection: false,
    safety: "proposal_only",
    inputSchema: requestCloudflareLogsReadToolInputSchema,
    agentArgs: requestCloudflareLogsReadInputSchema,
  },
  {
    name: "request_cloudflare_accounts_read",
    description:
      "Request approval to list Cloudflare accounts available to the connected token. This tool only creates an approval proposal and does not execute direct reads.",
    surfaces: ["agent"],
    requiredScopes: [],
    requiresVaultContext: false,
    requiresBranchContext: false,
    requiresThreadContext: true,
    requiresGithubConnection: false,
    safety: "proposal_only",
    inputSchema: requestCloudflareAccountsReadToolInputSchema,
    agentArgs: requestCloudflareAccountsReadInputSchema,
  },
  {
    name: "request_cloudflare_workers_inventory_read",
    description:
      "Request approval to list Cloudflare Workers for an account. This tool only creates an approval proposal and does not execute direct reads.",
    surfaces: ["agent"],
    requiredScopes: [],
    requiresVaultContext: false,
    requiresBranchContext: false,
    requiresThreadContext: true,
    requiresGithubConnection: false,
    safety: "proposal_only",
    inputSchema: requestCloudflareWorkersInventoryReadToolInputSchema,
    agentArgs: requestCloudflareWorkersInventoryReadInputSchema,
  },
  {
    name: "request_convex_data_read",
    description:
      "Request approval to read a limited sample from allowed Convex tables. This tool never performs direct production data reads by itself.",
    surfaces: ["agent"],
    requiredScopes: [],
    requiresVaultContext: true,
    requiresBranchContext: false,
    requiresThreadContext: true,
    requiresGithubConnection: false,
    safety: "proposal_only",
    inputSchema: requestConvexDataReadToolInputSchema,
    agentArgs: requestConvexDataReadInputSchema,
  },
];

export function findToolInCatalog(args: { name: string }): ToolCatalogEntry<unknown> | null {
  for (const tool of RUNTIME_TOOL_CATALOG) {
    if (tool.name === args.name) {
      return tool;
    }
  }
  return null;
}

export function listCatalogToolsForSurface(args: {
  surface: ToolSurface;
  grantedScopes: string[];
}): ToolCatalogEntry<unknown>[] {
  return RUNTIME_TOOL_CATALOG.filter((tool) => {
    if (!tool.surfaces.includes(args.surface)) {
      return false;
    }
    if (args.surface !== "mcp") {
      return true;
    }
    if (tool.requiredScopes.length === 0) {
      return true;
    }
    return hasAllScopes(args.grantedScopes, tool.requiredScopes);
  });
}
