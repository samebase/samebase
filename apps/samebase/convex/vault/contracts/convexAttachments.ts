import { v } from "convex/values";

import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";

const { array, id, literal, null: nullValue, object, string, union } = v;
const providerConnectionAccess = "access_provider_connections" as const;

export const vGitHubConvexConfigCandidate = union(
  object({
    state: literal("valid"),
    convexConfigPath: string(),
    rootDirectory: string(),
    blobSha: string(),
  }),
  object({
    state: literal("invalid"),
    convexConfigPath: string(),
    rootDirectory: string(),
    blobSha: string(),
    reason: literal("invalid_json_object"),
  }),
);

export const vConvexWorkerReference = object({
  accountId: string(),
  workerName: string(),
  workerTag: string(),
  rootDirectory: string(),
  markerTeamId: string(),
  access: union(literal("configured"), literal("incomplete")),
});

export const vConvexAttachmentProject = object({
  teamId: string(),
  projectId: string(),
  projectName: string(),
  projectSlug: string(),
  teamSlug: string(),
  workerReferences: array(vConvexWorkerReference),
});

const vConvexProjectDiscoveryResult = object({
  source: object({
    completeness: union(literal("complete"), literal("partial")),
    defaultBranch: string(),
    commitSha: string(),
    treeSha: string(),
    configs: array(vGitHubConvexConfigCandidate),
  }),
  projects: array(vConvexAttachmentProject),
});

export const convexDiscoverProjectsContract = {
  id: "discover_convex_projects",
  access: providerConnectionAccess,
  args: { vaultId: id("vaults") },
  returns: vConvexProjectDiscoveryResult,
  structuredContent: vConvexProjectDiscoveryResult,
  mcp: {
    title: "Discover Convex projects",
    name: "vault_convex_discoverProjects",
    description:
      "Discover valid convex.json locations in a vault's GitHub repository and projects available through the connected Convex team.",
    safety: "read_only",
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
    inputDescriptions: {
      vaultId: "Samebase vault whose repository config locations should be discovered.",
    },
  } satisfies AppFunctionMcpMetadata,
  doc: `Reads the vault's exact default-branch Git tree and blob contents to find regular files
named convex.json whose contents parse as JSON objects. It also lists projects available through
the connected Convex team and annotates current Cloudflare Worker marker references when
available. A partial source scan never proves that an unlisted config is absent.`,
} as const;

const vConvexProjectConfigSelection = object({
  projectId: string(),
  convexConfigPath: string(),
  blobSha: string(),
});

export const convexAttachProjectsContract = {
  id: "attach_convex_projects",
  access: providerConnectionAccess,
  args: {
    vaultId: id("vaults"),
    projects: array(vConvexProjectConfigSelection),
  },
  returns: array(id("vaultConvexProjects")),
  structuredContent: object({ convexProjectIds: array(id("vaultConvexProjects")) }),
  mcp: {
    title: "Attach Convex projects",
    name: "vault_convex_attachProjects",
    description:
      "Attach selected existing Convex projects to a vault at explicit discovered convex.json locations.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
    inputDescriptions: {
      vaultId: "Samebase vault receiving the project attachments.",
      projects:
        "One or more project id, convex.json path, and blob SHA selections returned by discover_convex_projects.",
    },
  } satisfies AppFunctionMcpMetadata,
  doc: `Re-reads every selected Convex project and exact convex.json blob before writing any
attachment. The final Samebase mutation is atomic: either every selected project and confirmed
config path is attached or none are. Convex projects and GitHub files are not modified.`,
} as const;

export const convexCreateProjectContract = {
  access: providerConnectionAccess,
  args: {
    vaultId: id("vaults"),
    projectName: string(),
    convexConfigPath: string(),
    blobSha: string(),
  },
  returns: id("vaultConvexProjects"),
} as const;

export const convexChangeProjectConfigPathContract = {
  access: providerConnectionAccess,
  args: {
    vaultId: id("vaults"),
    convexProjectId: id("vaultConvexProjects"),
    convexConfigPath: string(),
    blobSha: string(),
  },
  returns: nullValue(),
} as const;

export const convexReconcileProjectTeamContract = {
  access: providerConnectionAccess,
  args: {
    vaultId: id("vaults"),
    convexProjectId: id("vaultConvexProjects"),
  },
  returns: nullValue(),
} as const;

export const convexDetachProjectContract = {
  access: providerConnectionAccess,
  args: {
    vaultId: id("vaults"),
    convexProjectId: id("vaultConvexProjects"),
  },
  returns: nullValue(),
} as const;
