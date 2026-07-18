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
    description: "Durable app containers, app roots, and domains.",
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
  operations_providerOauthCallbackStates: "providers",

  connectedMachines: "machines",
  operations_machineRegistrationRequests: "machines",
  operations_machineRegistrationBootstrapRateLimits: "machines",
  operations_machineCredentials: "machines",
  operations_machineControlTokens: "machines",
  codespaces: "machines",

  ui_dashboardSettings: "workspace",
  ui_workspaceSidebarState: "workspace",
  ui_vaultBranchFilters: "workspace",
  ui_vaultResourceLinksState: "workspace",
  ui_folderExpansionState: "workspace",

  vaults: "vault",
  vaultApps: "vault",
  vaultDomains: "vault",

  observations_vaultRemoteBranches: "repository",
  observations_vaultCommitCheckSnapshots: "repository",
  observations_vaultCommitCheckItems: "repository",
  observations_vaultBranchTrees: "repository",
  operations_vaultRepositoryRefreshRequests: "repository",

  vaultCloudflareWorkers: "infrastructure",
  vaultConvexDeployments: "infrastructure",
  observations_vaultConvexSchemaSnapshots: "infrastructure",
  ui_vaultConvexSchemaGraphLayouts: "infrastructure",
  operations_vaultProvisioningPlans: "infrastructure",
  operations_vaultProvisioningRunClaims: "infrastructure",
  operations_vaultProvisioningRuns: "infrastructure",
  operations_vaultProvisioningEvents: "infrastructure",
  operations_vaultDeletionRuns: "infrastructure",
  operations_vaultDeletionEvents: "infrastructure",

  operations_fileStaging: "files",
  observations_vaultFileBlobs: "files",
  operations_collaborativeFileUpdates: "files",

  ui_agentGraphNodeLayout: "agent",
  agentThreadContext: "agent",
  chatMessageMetadata: "agent",
  operations_aiProductionReadRequests: "agent",
  audit_aiProductionReadEvents: "agent",

  mcpOauthClients: "mcp",
  operations_mcpAuthorizationRequests: "mcp",
  operations_mcpAuthorizationCodes: "mcp",
  mcpGrants: "mcp",
  operations_mcpAccessTokens: "mcp",
  operations_mcpRefreshTokens: "mcp",
  audit_mcpAccessEvents: "mcp",
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
