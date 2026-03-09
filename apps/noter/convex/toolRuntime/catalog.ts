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

export interface ToolCatalogEntry<TInput> extends ToolDefinition<TInput> {}

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

export const emptyToolInputSchema: ToolJsonSchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
};

export const readFileToolInputSchema: ToolJsonSchema = {
  type: "object",
  properties: {
    path: {
      type: "string",
      description: "File path relative to repository root.",
    },
  },
  required: ["path"],
  additionalProperties: false,
};

export const listFilesToolInputSchema: ToolJsonSchema = {
  type: "object",
  properties: {
    directory: {
      type: "string",
      description:
        "Optional directory path to filter by (e.g. 'src/components'). Omit to list all files.",
    },
  },
  additionalProperties: false,
};

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
