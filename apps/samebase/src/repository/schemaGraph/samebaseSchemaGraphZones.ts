export type SamebaseSchemaGraphZoneId =
  | "identity"
  | "providers"
  | "workspace"
  | "repositoryCore"
  | "repository"
  | "files"
  | "infrastructure"
  | "mcp"
  | "other";

export type SamebaseSchemaGraphZone = {
  id: SamebaseSchemaGraphZoneId;
  label: string;
  description: string;
  column: number;
  order: number;
};

export const SAMEBASE_SCHEMA_GRAPH_ZONE_LAYOUT_VERSION = "samebase-zones-v6";

export const SAMEBASE_SCHEMA_GRAPH_ZONES = [
  {
    id: "identity",
    label: "Authentication",
    description: "Users, Convex Auth accounts, sessions, and sign-in state.",
    column: 0,
    order: 0,
  },
  {
    id: "providers",
    label: "Provider integrations",
    description: "Connected GitHub, Convex, and Cloudflare accounts used by app workflows.",
    column: 0,
    order: 1,
  },
  {
    id: "workspace",
    label: "Workspace UI",
    description: "Per-user dashboard, sidebar, branch, and navigation preferences.",
    column: 0,
    order: 2,
  },
  {
    id: "repositoryCore",
    label: "Repository core",
    description: "Repository connections, provider attachments, and domains.",
    column: 1,
    order: 0,
  },
  {
    id: "repository",
    label: "Repository state",
    description: "GitHub branches, trees, checks, and refresh work.",
    column: 1,
    order: 1,
  },
  {
    id: "files",
    label: "Files and editor",
    description: "Staged files, blobs, folder state, and collaborative updates.",
    column: 1,
    order: 2,
  },
  {
    id: "infrastructure",
    label: "Infrastructure",
    description: "Cloudflare, Convex, provisioning, deletion, and schema snapshots.",
    column: 2,
    order: 0,
  },
  {
    id: "mcp",
    label: "MCP OAuth",
    description: "MCP clients, grants, token rotation, and audit events.",
    column: 2,
    order: 1,
  },
  {
    id: "other",
    label: "Other",
    description: "Tables that do not match a Samebase product zone yet.",
    column: 2,
    order: 2,
  },
] satisfies SamebaseSchemaGraphZone[];

export const SAMEBASE_SCHEMA_GRAPH_TABLE_ZONES: Readonly<
  Partial<Record<string, SamebaseSchemaGraphZoneId>>
> = {
  users: "identity",
  organizationProviderCredentials: "providers",
  providerOAuthCallbackStates: "providers",

  ui_user_settings: "workspace",
  ui_workspaceSidebar_layouts: "workspace",
  ui_repositoryPullRequests_filters: "workspace",
  ui_repositoryResourceLinks_settings: "workspace",
  ui_repositoryFileTree_folderExpansions: "workspace",

  repositories: "repositoryCore",
  observations_repository_branchTrees: "repository",

  repositoryCloudflareWorkers: "infrastructure",
  repositoryConvexProjects: "infrastructure",
  observations_repositoryConvexSchema_snapshots: "infrastructure",
  ui_repositoryConvexSchemaGraph_nodeLayouts: "infrastructure",
  workflow_repositoryProvisioning_plans: "infrastructure",
  workflow_repositoryProvisioning_writeLocks: "infrastructure",
  workflow_repositoryProvisioning_runs: "infrastructure",
  workflow_repositoryProvisioning_events: "infrastructure",
  workflow_repositoryDeletion_runs: "infrastructure",
  workflow_repositoryDeletion_events: "infrastructure",

  repositoryStagedFiles: "files",
  observations_repositoryFiles_blobs: "files",
  repositoryStagedFileUpdates: "files",

  mcpOauthClients: "mcp",
  mcpAuthorizationRequests: "mcp",
  mcpAuthorizationCodes: "mcp",
  mcpGrants: "mcp",
  mcpAccessTokens: "mcp",
  mcpRefreshTokens: "mcp",
  audit_mcpAccess_events: "mcp",
};

export function readSamebaseSchemaGraphZoneId(tableName: string): SamebaseSchemaGraphZoneId {
  const configuredZoneId = SAMEBASE_SCHEMA_GRAPH_TABLE_ZONES[tableName];
  if (configuredZoneId) {
    return configuredZoneId;
  }

  if (tableName.startsWith("auth")) {
    return "identity";
  }
  if (tableName.startsWith("provider")) {
    return "providers";
  }
  if (tableName.startsWith("mcp")) {
    return "mcp";
  }
  if (tableName.startsWith("repositoryConvex") || tableName.startsWith("repositoryCloudflare")) {
    return "infrastructure";
  }
  if (tableName.startsWith("repository")) {
    return "repository";
  }
  if (tableName.startsWith("github") || tableName.startsWith("repository")) {
    return "repository";
  }
  return "other";
}
