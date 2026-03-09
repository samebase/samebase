import { z } from "zod";
import type { ToolDefinition, ToolJsonSchema, ToolSurface } from "./types";

const emptyInputSchema = z.object({});
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
  oldText: z
    .string()
    .min(1)
    .describe("Exact existing text to replace, including whitespace"),
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

export type ToolCatalogEntry<TInput> = ToolDefinition<TInput>;

function hasAllScopes(
  grantedScopes: string[],
  requiredScopes: string[],
): boolean {
  const granted = new Set(grantedScopes);
  return requiredScopes.every((scope) => granted.has(scope));
}

function withRequiredFields(
  inputSchema: ToolJsonSchema,
  requiredFields: string[],
): ToolJsonSchema {
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
    "requiresVaultContext" | "requiresBranchContext" | "inputSchema"
  >;
}): string[] {
  const required = new Set(args.tool.inputSchema.required ?? []);
  if (args.tool.requiresVaultContext) {
    required.add("vaultId");
  }
  if (args.tool.requiresBranchContext) {
    required.add("branch");
  }
  return Array.from(required);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
    throw new Error(
      "Tool input schemas must serialize to JSON object schemas.",
    );
  }

  const properties = isRecord(jsonSchema.properties)
    ? jsonSchema.properties
    : {};
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
    "requiresVaultContext" | "requiresBranchContext" | "inputSchema"
  >,
): ToolJsonSchema {
  const properties: Record<string, unknown> = {
    ...tool.inputSchema.properties,
  };
  if (tool.requiresVaultContext) {
    properties.vaultId = {
      type: "string",
      description: "Vault ID from vaults.list.",
    };
  }
  if (tool.requiresBranchContext) {
    properties.branch = {
      type: "string",
      description: "Branch name to operate on.",
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

export const readFileToolInputSchema =
  zodToToolInputSchema(readFileInputSchema);

export const listFilesToolInputSchema =
  zodToToolInputSchema(listFilesInputSchema);

export const editFileToolInputSchema =
  zodToToolInputSchema(editFileInputSchema);

export const replaceInFileToolInputSchema = zodToToolInputSchema(
  replaceInFileInputSchema,
);

export const createFileToolInputSchema = zodToToolInputSchema(
  createFileInputSchema,
);

export const deleteFileToolInputSchema = zodToToolInputSchema(
  deleteFileInputSchema,
);

export const RUNTIME_TOOL_CATALOG: ToolCatalogEntry<unknown>[] = [
  {
    name: "vaults.list",
    description:
      "List vault repositories available to the authenticated Noter user.",
    surfaces: ["mcp"],
    requiredScopes: ["vaults.read"],
    requiresVaultContext: false,
    requiresBranchContext: false,
    requiresGithubConnection: false,
    safety: "read_only",
    inputSchema: emptyToolInputSchema,
    agentArgs: emptyInputSchema,
  },
  {
    name: "read_file",
    description:
      "Read the contents of a file in the repository. Required input: path relative to the repository root. Returns the file content as text.",
    surfaces: ["agent", "mcp"],
    requiredScopes: ["files.read"],
    requiresVaultContext: true,
    requiresBranchContext: true,
    requiresGithubConnection: true,
    safety: "read_only",
    inputSchema: readFileToolInputSchema,
    agentArgs: readFileInputSchema,
  },
  {
    name: "list_files",
    description:
      "List files in the repository, optionally filtered to a directory.",
    surfaces: ["agent", "mcp"],
    requiredScopes: ["files.read"],
    requiresVaultContext: true,
    requiresBranchContext: true,
    requiresGithubConnection: true,
    safety: "read_only",
    inputSchema: listFilesToolInputSchema,
    agentArgs: listFilesInputSchema,
  },
  {
    name: "edit_file",
    description:
      "Edit an existing file by replacing its entire content. Required inputs: path relative to the repository root and content containing the full new file text. The file must already exist.",
    surfaces: ["agent", "mcp"],
    requiredScopes: ["files.write"],
    requiresVaultContext: true,
    requiresBranchContext: true,
    requiresGithubConnection: true,
    safety: "write",
    inputSchema: editFileToolInputSchema,
    agentArgs: editFileInputSchema,
  },
  {
    name: "replace_in_file",
    description:
      "Edit an existing file by replacing exact text snippets without rewriting the whole file. Required inputs: path and a non-empty replacements array of { oldText, newText }.",
    surfaces: ["agent", "mcp"],
    requiredScopes: ["files.write"],
    requiresVaultContext: true,
    requiresBranchContext: true,
    requiresGithubConnection: true,
    safety: "write",
    inputSchema: replaceInFileToolInputSchema,
    agentArgs: replaceInFileInputSchema,
  },
  {
    name: "create_file",
    description:
      "Create a new file in the repository. Required inputs: path and content.",
    surfaces: ["agent", "mcp"],
    requiredScopes: ["files.write"],
    requiresVaultContext: true,
    requiresBranchContext: true,
    requiresGithubConnection: true,
    safety: "write",
    inputSchema: createFileToolInputSchema,
    agentArgs: createFileInputSchema,
  },
  {
    name: "delete_file",
    description:
      "Mark a file for deletion in the repository. Required input: path.",
    surfaces: ["agent", "mcp"],
    requiredScopes: ["files.write"],
    requiresVaultContext: true,
    requiresBranchContext: true,
    requiresGithubConnection: true,
    safety: "destructive",
    inputSchema: deleteFileToolInputSchema,
    agentArgs: deleteFileInputSchema,
  },
  {
    name: "get_vault_remote_branches",
    description:
      "List remote branches for the current vault with ahead/behind and pull request metadata.",
    surfaces: ["agent", "mcp"],
    requiredScopes: ["vaults.read"],
    requiresVaultContext: true,
    requiresBranchContext: false,
    requiresGithubConnection: false,
    safety: "read_only",
    inputSchema: emptyToolInputSchema,
    agentArgs: emptyInputSchema,
  },
];

export function findToolInCatalog(args: {
  name: string;
}): ToolCatalogEntry<unknown> | null {
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
