import { v, type PropertyValidators } from "convex/values";
import type { ToolDefinition, ToolJsonSchema, ToolSurface } from "./types";
import { hasAllScopes } from "./utils";
import { createRepositoryContract } from "../vault/createRepositoryContract";
import { convexArgsToToolInputSchema } from "./convexSchemas";

const { array, boolean, literal, number, object, optional, string, union } = v;

export const emptyToolInputArgs = {} satisfies PropertyValidators;

export const readFileInputArgs = {
  path: string(),
} satisfies PropertyValidators;
const readFileInputDescriptions = {
  path: "File path relative to repository root",
};

export const listFilesInputArgs = {
  directory: optional(string()),
} satisfies PropertyValidators;
const listFilesInputDescriptions = {
  directory:
    "Optional directory path to filter by (e.g. 'src/components'). Omit to list all files.",
};

export const editFileInputArgs = {
  path: string(),
  content: string(),
} satisfies PropertyValidators;
const editFileInputDescriptions = {
  path: "File path relative to repository root",
  content: "The new full content of the file",
};

export const replaceInFileInputArgs = {
  path: string(),
  replacements: array(
    object({
      oldText: string(),
      newText: string(),
    }),
  ),
} satisfies PropertyValidators;
const replaceInFileInputDescriptions = {
  path: "File path relative to repository root",
  replacements: "Exact oldText/newText replacements to apply atomically",
};

export const createFileInputArgs = {
  path: string(),
  content: string(),
} satisfies PropertyValidators;
const createFileInputDescriptions = {
  path: "File path relative to repository root",
  content: "The content of the new file",
};

export const deleteFileInputArgs = {
  path: string(),
} satisfies PropertyValidators;
const deleteFileInputDescriptions = {
  path: "File path relative to repository root",
};

export const requestConvexLogsReadInputArgs = {
  maxLines: optional(number()),
  allowRawFallback: optional(boolean()),
} satisfies PropertyValidators;
const requestConvexLogsReadInputDescriptions = {
  maxLines: "Maximum log lines to include",
  allowRawFallback: "In owner mode, allow explicit raw payload fallback",
};

export const requestConvexProjectsReadInputArgs = {
  limit: optional(number()),
  allowRawFallback: optional(boolean()),
} satisfies PropertyValidators;
const requestConvexProjectsReadInputDescriptions = {
  limit: "Maximum projects to include",
  allowRawFallback: "In owner mode, allow explicit raw payload fallback",
};

export const requestCloudflareLogsReadInputArgs = {
  maxEntries: optional(number()),
  allowRawFallback: optional(boolean()),
} satisfies PropertyValidators;
const requestCloudflareLogsReadInputDescriptions = {
  maxEntries: "Maximum deployment entries to include",
  allowRawFallback: "In owner mode, allow explicit raw payload fallback",
};

export const requestCloudflareAccountsReadInputArgs = {
  limit: optional(number()),
  allowRawFallback: optional(boolean()),
} satisfies PropertyValidators;
const requestCloudflareAccountsReadInputDescriptions = {
  limit: "Maximum accounts to include",
  allowRawFallback: "In owner mode, allow explicit raw payload fallback",
};

export const requestCloudflareWorkersInventoryReadInputArgs = {
  accountId: optional(string()),
  limit: optional(number()),
  allowRawFallback: optional(boolean()),
} satisfies PropertyValidators;
const requestCloudflareWorkersInventoryReadInputDescriptions = {
  accountId: "Cloudflare account ID to query. Omit only when a default account is selected.",
  limit: "Maximum Workers to include",
  allowRawFallback: "In owner mode, allow explicit raw payload fallback",
};

const prodReadScopeValidator = union(literal("vault"), literal("global"));
const convexDataTableValidator = union(
  literal("vaults"),
  literal("vaultConvexDeployments"),
  literal("vaultDomains"),
  literal("codespaces"),
  literal("fileStaging"),
  literal("aiProdAccessRequests"),
  literal("aiProdAccessAudit"),
);

export const requestConvexDataReadInputArgs = {
  table: convexDataTableValidator,
  scope: optional(prodReadScopeValidator),
  limit: optional(number()),
  allowRawFallback: optional(boolean()),
} satisfies PropertyValidators;
const requestConvexDataReadInputDescriptions = {
  table: "Convex table to sample",
  scope: "Read scope. Defaults to vault scope.",
  limit: "Maximum rows to return",
  allowRawFallback: "In owner mode, allow explicit raw payload fallback",
};

export type ToolCatalogEntry<Args extends PropertyValidators = PropertyValidators> =
  ToolDefinition<Args>;

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
    ToolDefinition,
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

export function buildMcpToolInputSchema(
  tool: Pick<
    ToolDefinition,
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

export const emptyToolInputSchema = convexArgsToToolInputSchema(emptyToolInputArgs);

export const createRepositoryToolInputSchema = convexArgsToToolInputSchema(
  createRepositoryContract.args,
  createRepositoryContract.mcp.inputDescriptions,
);

export const readFileToolInputSchema = convexArgsToToolInputSchema(
  readFileInputArgs,
  readFileInputDescriptions,
);

export const listFilesToolInputSchema = convexArgsToToolInputSchema(
  listFilesInputArgs,
  listFilesInputDescriptions,
);

export const editFileToolInputSchema = convexArgsToToolInputSchema(
  editFileInputArgs,
  editFileInputDescriptions,
);

export const replaceInFileToolInputSchema = convexArgsToToolInputSchema(
  replaceInFileInputArgs,
  replaceInFileInputDescriptions,
);

export const createFileToolInputSchema = convexArgsToToolInputSchema(
  createFileInputArgs,
  createFileInputDescriptions,
);

export const deleteFileToolInputSchema = convexArgsToToolInputSchema(
  deleteFileInputArgs,
  deleteFileInputDescriptions,
);

export const requestConvexLogsReadToolInputSchema = convexArgsToToolInputSchema(
  requestConvexLogsReadInputArgs,
  requestConvexLogsReadInputDescriptions,
);

export const requestConvexProjectsReadToolInputSchema = convexArgsToToolInputSchema(
  requestConvexProjectsReadInputArgs,
  requestConvexProjectsReadInputDescriptions,
);

export const requestCloudflareLogsReadToolInputSchema = convexArgsToToolInputSchema(
  requestCloudflareLogsReadInputArgs,
  requestCloudflareLogsReadInputDescriptions,
);

export const requestCloudflareAccountsReadToolInputSchema = convexArgsToToolInputSchema(
  requestCloudflareAccountsReadInputArgs,
  requestCloudflareAccountsReadInputDescriptions,
);

export const requestCloudflareWorkersInventoryReadToolInputSchema = convexArgsToToolInputSchema(
  requestCloudflareWorkersInventoryReadInputArgs,
  requestCloudflareWorkersInventoryReadInputDescriptions,
);

export const requestConvexDataReadToolInputSchema = convexArgsToToolInputSchema(
  requestConvexDataReadInputArgs,
  requestConvexDataReadInputDescriptions,
);

export const MCP_TOOL_CATALOG: ToolCatalogEntry[] = [
  {
    name: createRepositoryContract.mcp.name,
    description: createRepositoryContract.mcp.description,
    surfaces: ["mcp"],
    requiredScopes: [createRepositoryContract.access],
    requiresVaultContext: false,
    requiresBranchContext: false,
    requiresThreadContext: false,
    requiresGithubConnection: true,
    safety: createRepositoryContract.mcp.safety,
    inputArgs: createRepositoryContract.args,
    inputSchema: createRepositoryToolInputSchema,
  },
];

const LEGACY_AGENT_TOOL_CATALOG: ToolCatalogEntry[] = [
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
    inputArgs: readFileInputArgs,
    inputSchema: readFileToolInputSchema,
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
    inputArgs: listFilesInputArgs,
    inputSchema: listFilesToolInputSchema,
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
    inputArgs: editFileInputArgs,
    inputSchema: editFileToolInputSchema,
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
    inputArgs: replaceInFileInputArgs,
    inputSchema: replaceInFileToolInputSchema,
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
    inputArgs: createFileInputArgs,
    inputSchema: createFileToolInputSchema,
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
    inputArgs: deleteFileInputArgs,
    inputSchema: deleteFileToolInputSchema,
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
    inputArgs: emptyToolInputArgs,
    inputSchema: emptyToolInputSchema,
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
    inputArgs: emptyToolInputArgs,
    inputSchema: emptyToolInputSchema,
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
    inputArgs: requestConvexLogsReadInputArgs,
    inputSchema: requestConvexLogsReadToolInputSchema,
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
    inputArgs: requestConvexProjectsReadInputArgs,
    inputSchema: requestConvexProjectsReadToolInputSchema,
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
    inputArgs: emptyToolInputArgs,
    inputSchema: emptyToolInputSchema,
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
    inputArgs: requestCloudflareLogsReadInputArgs,
    inputSchema: requestCloudflareLogsReadToolInputSchema,
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
    inputArgs: requestCloudflareAccountsReadInputArgs,
    inputSchema: requestCloudflareAccountsReadToolInputSchema,
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
    inputArgs: requestCloudflareWorkersInventoryReadInputArgs,
    inputSchema: requestCloudflareWorkersInventoryReadToolInputSchema,
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
    inputArgs: requestConvexDataReadInputArgs,
    inputSchema: requestConvexDataReadToolInputSchema,
  },
];

export const RUNTIME_TOOL_CATALOG: ToolCatalogEntry[] = [
  ...MCP_TOOL_CATALOG,
  ...LEGACY_AGENT_TOOL_CATALOG,
];

export function findToolInCatalog(args: { name: string }): ToolCatalogEntry | null {
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
}): ToolCatalogEntry[] {
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
