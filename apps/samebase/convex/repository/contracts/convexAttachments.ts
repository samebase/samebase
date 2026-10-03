import { v } from "convex/values";

import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";
import { vConvexDeploymentRegion } from "../../convexDeploymentRegionModel";
import { MCP_REPOSITORY_INPUT_DESCRIPTION, mcpRepositoryArgs } from "./repositoryReference";

const { array, id, literal, number, object, optional, string, union } = v;
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

const vConvexProductionDeployment = union(
  object({ state: literal("available"), region: vConvexDeploymentRegion }),
  object({ state: literal("missing") }),
);

/**
attachment: attached = already recorded on this Samebase repository. attached_elsewhere = another
Samebase repository already uses this project, so attachProject rejects it. attachable = can be
passed to attachProject. A project without a production deployment stays attachable; its deploy
key cannot be installed until it is deployed to production.
*/
export const vConvexAttachmentProject = object({
  attachment: union(literal("attached"), literal("attached_elsewhere"), literal("attachable")),
  teamId: string(),
  projectId: string(),
  projectName: string(),
  projectSlug: string(),
  teamSlug: string(),
  productionDeployment: vConvexProductionDeployment,
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

const vMcpConvexProjectDiscoveryResult = object({
  codeLocations: object({
    completeness: vConvexProjectDiscoveryResult.fields.source.fields.completeness,
    paths: array(string()),
  }),
  projects: array(
    object({
      projectSlug: string(),
      projectName: string(),
      productionDeployment: vConvexProductionDeployment,
    }),
  ),
  counts: object({
    attached: number(),
    attachedElsewhere: number(),
  }),
});

const codeLocationInputDescription =
  "Optional code location from repository_convex_findProjects: a convex.json path or a convex/ directory. Omit it when the repository has one code location.";

export const convexDiscoverProjectsContract = {
  id: "find_convex_projects",
  access: providerConnectionAccess,
  args: { repositoryId: id("repositories") },
  mcpArgs: mcpRepositoryArgs,
  returns: vConvexProjectDiscoveryResult,
  structuredContent: vMcpConvexProjectDiscoveryResult,
  mcp: {
    title: "Find Convex projects",
    name: "repository_convex_findProjects",
    description:
      "Find the Convex code locations in the repository and the projects in the connected Convex team that can be attached. Lists attachable projects with their slug, name, and production deployment, and counts the others. Attach one by its slug with repository_convex_attachProject, or create one with repository_convex_createProject.",
    safety: "read_only",
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
    inputDescriptions: {
      repository: MCP_REPOSITORY_INPUT_DESCRIPTION,
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Reads the repository's exact default-branch Git tree to find explicit convex.json files and
default package.json plus convex/ layouts. Discovery uses exact tree entry types, paths, and object
SHAs only. It does not read or validate convex.json or package.json contents. It also lists projects
available through the connected Convex team. Each project gets one attachment status: attached when
this Samebase repository already records it, attached_elsewhere when another Samebase repository
records it, otherwise attachable. attached_elsewhere never names the other repository.

The MCP result lists the code location paths, the attachable projects with their slug, name, and
production deployment, and a count of the other projects. MCP tools name a Convex project by its
slug, which is unique inside a Convex team; the name is for display. A project without a production deployment can be
attached, but its deploy key cannot be installed until it is deployed to production. A partial
source scan never proves that an unlisted code location is absent. Discovery may refresh private
Samebase provider-connection bookkeeping, but it does not change GitHub, Convex, Cloudflare, or
public internet state.`,
} as const;

const vConvexProjectCodeLocationSelection = object({
  projectId: string(),
  codeLocation: vConvexCodeLocationSelection,
});

export const convexAttachProjectsContract = {
  id: "attach_convex_project",
  access: providerConnectionAccess,
  args: {
    repositoryId: id("repositories"),
    projects: array(vConvexProjectCodeLocationSelection),
  },
  mcpArgs: {
    ...mcpRepositoryArgs,
    convexProjectSlug: string(),
    codeLocation: optional(string()),
  },
  returns: array(id("repositoryConvexProjects")),
  structuredContent: object({ projectSlug: string(), codeLocation: string() }),
  mcp: {
    title: "Attach Convex project",
    name: "repository_convex_attachProject",
    description:
      "Attach an existing Convex project that repository_convex_findProjects reports as attachable, at one of the repository's Convex code locations. Convex and GitHub do not change.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
    inputDescriptions: {
      repository: MCP_REPOSITORY_INPUT_DESCRIPTION,
      convexProjectSlug:
        "Slug of an attachable Convex project, as repository_convex_findProjects returns it. Only an exact slug matches.",
      codeLocation: codeLocationInputDescription,
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Re-reads the selected Convex project and the exact repository code location before writing the
attachment. The MCP tool takes the project's slug and matches it exactly; a project name is never
matched. A project that another Samebase repository attaches is rejected. One discovered code
location is used without asking; several return an error that lists them. The dashboard can attach
several projects in one atomic call: either every selected project is attached or none are. Convex
projects and GitHub files are not modified.`,
} as const;

export const convexCreateProjectContract = {
  id: "create_convex_project",
  access: providerConnectionAccess,
  args: {
    repositoryId: id("repositories"),
    projectName: string(),
    deploymentRegion: vConvexDeploymentRegion,
    codeLocation: vConvexCodeLocationSelection,
  },
  mcpArgs: {
    ...mcpRepositoryArgs,
    projectName: string(),
    convexDeploymentRegion: optional(vConvexDeploymentRegion),
    codeLocation: optional(string()),
  },
  returns: id("repositoryConvexProjects"),
  structuredContent: object({
    projectName: string(),
    codeLocation: string(),
    deploymentRegion: vConvexDeploymentRegion,
  }),
  mcp: {
    title: "Create Convex project",
    name: "repository_convex_createProject",
    description:
      "Create a Convex project with one production deployment in the repository's Convex team and attach it at one of the repository's Convex code locations.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
    inputDescriptions: {
      repository: MCP_REPOSITORY_INPUT_DESCRIPTION,
      projectName: "Name for the new Convex project. An existing name is rejected.",
      convexDeploymentRegion:
        "Optional production region: aws-us-east-1, aws-eu-west-1, aws-ca-central-1, or aws-ap-southeast-2. Omit it to use the organization default, which is US East when no default is saved. Before you pass aws-eu-west-1, tell the user: EU usage costs 1.3 times US usage, and included usage for Starter and Professional plans does not apply to EU deployments (https://www.convex.dev/pricing).",
      codeLocation: codeLocationInputDescription,
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Creates one Convex project with a production deployment in the region given, else in the
organization default region (US East when no default is saved), in the Convex team connected to
the repository's organization. Samebase checks the provider-write lock, the exact repository code
location, the project name, and the organization quota before the create request, then records the
project as an attachment at that code location. One discovered code location is used without
asking; several return an error that lists them. An existing project name is rejected. If Samebase
cannot record a created project, the error says so.`,
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
