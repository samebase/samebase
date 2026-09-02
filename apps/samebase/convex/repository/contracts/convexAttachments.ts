import { v } from "convex/values";

import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";
import { vConvexDeploymentRegion } from "../../convexDeploymentRegionModel";

const { array, id, literal, object, string, union } = v;
const providerConnectionAccess = "access_provider_connections" as const;

export const vGitHubConvexCodeLocationCandidate = union(
  object({
    kind: literal("config"),
    convexConfigPath: string(),
    rootDirectory: string(),
    blobSha: string(),
  }),
  object({
    kind: literal("directory"),
    convexDirectoryPath: string(),
    rootDirectory: string(),
    convexDirectoryTreeSha: string(),
    packageJsonPath: string(),
    packageJsonBlobSha: string(),
  }),
);

export const vConvexCodeLocation = union(
  object({
    kind: literal("config"),
    convexConfigPath: string(),
  }),
  object({
    kind: literal("directory"),
    convexDirectoryPath: string(),
  }),
);

export const vConvexCodeLocationSelection = union(
  object({
    kind: literal("config"),
    convexConfigPath: string(),
    blobSha: string(),
  }),
  object({
    kind: literal("directory"),
    convexDirectoryPath: string(),
    convexDirectoryTreeSha: string(),
    packageJsonBlobSha: string(),
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
  productionDeployment: union(
    object({ state: literal("available"), region: vConvexDeploymentRegion }),
    object({ state: literal("missing") }),
  ),
  workerReferences: array(vConvexWorkerReference),
});

const vConvexProjectDiscoveryResult = object({
  source: object({
    completeness: union(literal("complete"), literal("partial")),
    defaultBranch: string(),
    commitSha: string(),
    treeSha: string(),
    locations: array(vGitHubConvexCodeLocationCandidate),
  }),
  projects: array(vConvexAttachmentProject),
});

export const convexDiscoverProjectsContract = {
  id: "discover_convex_projects",
  access: providerConnectionAccess,
  args: { repositoryId: id("repositories") },
  returns: vConvexProjectDiscoveryResult,
  structuredContent: vConvexProjectDiscoveryResult,
  mcp: {
    title: "Discover Convex projects",
    name: "repository_convex_discoverProjects",
    description:
      "Call get_user_repositories first and use its returned repositoryId. Discover Convex code locations in the Samebase repository's GitHub repository and projects available through the connected Convex team.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
    inputDescriptions: {
      repositoryId: "Samebase repository ID returned by get_user_repositories.",
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Reads the repository's exact default-branch Git tree to find explicit convex.json files and
default package.json plus convex/ layouts. Discovery uses exact tree entry types, paths, and object
SHAs only. It does not read or validate convex.json or package.json contents. It also lists projects
available through the connected Convex team and annotates current Cloudflare Worker marker
references when available. A partial source scan never proves that an unlisted code location is
absent. It may refresh private Samebase provider-connection bookkeeping, but it does not change
GitHub, Convex, Cloudflare, or public internet state.`,
} as const;

const vConvexProjectCodeLocationSelection = object({
  projectId: string(),
  codeLocation: vConvexCodeLocationSelection,
});

export const convexAttachProjectsContract = {
  id: "attach_convex_projects",
  access: providerConnectionAccess,
  args: {
    repositoryId: id("repositories"),
    projects: array(vConvexProjectCodeLocationSelection),
  },
  returns: array(id("repositoryConvexProjects")),
  structuredContent: object({ convexProjectIds: array(id("repositoryConvexProjects")) }),
  mcp: {
    title: "Attach Convex projects",
    name: "repository_convex_attachProjects",
    description:
      "Call get_user_repositories first and use its returned repositoryId. Attach selected existing Convex projects to a Samebase repository at discovered repository code locations.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
    inputDescriptions: {
      repositoryId: "Samebase repository ID returned by get_user_repositories.",
      projects:
        "One or more project id and code location selections returned by discover_convex_projects.",
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Re-reads every selected Convex project and exact repository code location before writing
any attachment. The final Samebase mutation is atomic: either every selected project and confirmed
location is attached or none are. Convex projects and GitHub files are not modified.`,
} as const;

export const convexCreateProjectContract = {
  access: providerConnectionAccess,
  args: {
    repositoryId: id("repositories"),
    projectName: string(),
    deploymentRegion: vConvexDeploymentRegion,
    codeLocation: vConvexCodeLocationSelection,
  },
  returns: id("repositoryConvexProjects"),
} as const;

export const convexChangeProjectCodeLocationContract = {
  access: providerConnectionAccess,
  args: {
    repositoryId: id("repositories"),
    convexProjectId: id("repositoryConvexProjects"),
    codeLocation: vConvexCodeLocationSelection,
  },
  returns: v.null(),
} as const;

export const convexDetachProjectContract = {
  access: providerConnectionAccess,
  args: {
    repositoryId: id("repositories"),
    convexProjectId: id("repositoryConvexProjects"),
  },
  returns: v.null(),
} as const;
