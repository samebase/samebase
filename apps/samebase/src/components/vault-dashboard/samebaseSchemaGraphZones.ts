export type SamebaseSchemaGraphZoneId =
  | "identity"
  | "providers"
  | "machines"
  | "workspace"
  | "vault"
  | "repository"
  | "files"
  | "infrastructure"
  | "agent"
  | "mcp"
  | "other";

export type SamebaseSchemaGraphZone = {
  id: SamebaseSchemaGraphZoneId;
  label: string;
  description: string;
  column: number;
  order: number;
};

export const SAMEBASE_SCHEMA_GRAPH_ZONE_LAYOUT_VERSION = "samebase-zones-v3";

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
    id: "machines",
    label: "Machines",
    description: "Local machine registration, credentials, and live control.",
    column: 0,
    order: 2,
  },
  {
    id: "workspace",
    label: "Workspace UI",
    description: "Per-user dashboard, sidebar, branch, and navigation preferences.",
    column: 0,
    order: 3,
  },
  {
    id: "vault",
    label: "Vault core",
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
    id: "agent",
    label: "Agent and AI",
    description: "Agent graph layout, chat metadata, and production access approvals.",
    column: 2,
    order: 1,
  },
  {
    id: "mcp",
    label: "MCP OAuth",
    description: "MCP clients, grants, token rotation, and audit events.",
    column: 2,
    order: 2,
  },
  {
    id: "other",
    label: "Other",
    description: "Tables that do not match a Samebase product zone yet.",
    column: 2,
    order: 3,
  },
] satisfies SamebaseSchemaGraphZone[];

export const SAMEBASE_SCHEMA_GRAPH_TABLE_ZONES: Readonly<
  Partial<Record<string, SamebaseSchemaGraphZoneId>>
> = {
  users: "identity",
  providerConnections: "providers",
  providerOAuthCallbackStates: "providers",

  codespaces: "machines",

  ui_user_settings: "workspace",
  ui_workspaceSidebar_layouts: "workspace",
  ui_vaultPullRequests_filters: "workspace",
  ui_vaultResourceLinks_settings: "workspace",
  ui_vaultFileTree_folderExpansions: "workspace",

  vaults: "vault",
  observations_vaultRepository_branchTrees: "repository",

  vaultCloudflareWorkers: "infrastructure",
  vaultConvexProjects: "infrastructure",
  observations_vaultConvexSchema_snapshots: "infrastructure",
  ui_vaultConvexSchemaGraph_nodeLayouts: "infrastructure",
  workflow_vaultProvisioning_plans: "infrastructure",
  workflow_vaultProvisioning_writeLocks: "infrastructure",
  workflow_vaultProvisioning_runs: "infrastructure",
  workflow_vaultProvisioning_events: "infrastructure",
  workflow_vaultDeletion_runs: "infrastructure",
  workflow_vaultDeletion_events: "infrastructure",

  vaultStagedFiles: "files",
  observations_vaultFiles_blobs: "files",
  vaultStagedFileUpdates: "files",

  ui_agentGraphNode_layouts: "agent",
  chatThreadContexts: "agent",
  chatMessagePayloads: "agent",
  aiProductionReadRequests: "agent",
  audit_aiProductionRead_events: "agent",

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
  if (tableName.startsWith("machine")) {
    return "machines";
  }
  if (tableName.startsWith("vaultConvex") || tableName.startsWith("vaultCloudflare")) {
    return "infrastructure";
  }
  if (tableName.startsWith("vault")) {
    return "vault";
  }
  if (tableName.startsWith("github") || tableName.startsWith("repository")) {
    return "repository";
  }
  if (tableName.startsWith("agent") || tableName.startsWith("ai")) {
    return "agent";
  }

  return "other";
}
