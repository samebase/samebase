import { v } from "convex/values";

import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";
import {
  MCP_ACTION_CONFIRMATION_INPUT_DESCRIPTION,
  vActionConfirmation,
  vActionConfirmationRequest,
} from "./actionConfirmation";
import { MCP_REPOSITORY_INPUT_DESCRIPTION, mcpRepositoryArgs } from "./repositoryReference";

const { array, id, literal, number, object, optional, string, union } = v;
const providerConnectionAccess = "access_provider_connections" as const;

const vCloudflareWorkerBuildSettingsStatus = union(
  object({
    state: literal("available"),
  }),
  object({ state: literal("legacy_previews") }),
  object({ state: literal("not_available") }),
  object({ state: literal("ambiguous") }),
);

export const vCloudflareWorkerRepositoryDiscovery = union(
  object({
    state: literal("ready"),
    rootDirectory: string(),
    builds: vCloudflareWorkerBuildSettingsStatus,
  }),
  object({ state: literal("not_connected") }),
  object({ state: literal("connected_elsewhere") }),
  object({
    state: literal("ambiguous"),
    reason: union(
      literal("deleted_repository_connection"),
      literal("missing_provider_type"),
      literal("missing_repo_id"),
      literal("missing_root_directory"),
      literal("multiple_root_directories"),
    ),
  }),
  object({ state: literal("failed"), message: string() }),
);

/**
attached = this Samebase repository already records a Worker with this tag or, when no record has
the tag, this name.

attached_elsewhere = another Samebase repository already records a Worker with this tag or name.
Neither attachWorkers nor connectWorker can add it.

attachable = connected to this repository in Cloudflare and not attached yet. This is the only
status that attachWorkers accepts.

connectable = not connected to any repository in Cloudflare. connectWorker connects it to this
repository, which replaces what the Worker serves with a build of this repository.

connected_elsewhere = connected to another repository in Cloudflare.

unavailable = Samebase could not verify one repository root for this Worker.
*/
export const vCloudflareWorkerDiscovery = union(
  object({
    attachment: literal("attachable"),
    workerName: string(),
    workerTag: string(),
    rootDirectory: string(),
  }),
  object({
    attachment: union(
      literal("attached"),
      literal("attached_elsewhere"),
      literal("connectable"),
      literal("connected_elsewhere"),
      literal("unavailable"),
    ),
    workerName: string(),
    workerTag: string(),
  }),
);

const vCloudflareWorkerDiscoveryResult = object({
  inventoryState: union(literal("complete"), literal("partial")),
  workers: array(vCloudflareWorkerDiscovery),
});

const vMcpCloudflareWorkerDiscoveryResult = object({
  inventoryState: vCloudflareWorkerDiscoveryResult.fields.inventoryState,
  workers: array(
    union(
      object({ attachment: literal("attachable"), workerName: string(), rootDirectory: string() }),
      object({ attachment: literal("connectable"), workerName: string() }),
    ),
  ),
  counts: object({
    attached: number(),
    attachedElsewhere: number(),
    connectedElsewhere: number(),
    unavailable: number(),
  }),
});

/**
The Convex deploy key that connectWorker and createWorker install for the new Worker.

installed = the key is in the Worker's production and Previews Base Builds settings, and the
production build started.

no_convex_project = the repository has no attached Convex project, so no key was installed.

failed = the Worker exists, but the key was not installed and no production build started.
*/
export const vConvexDeployKeyInstallation = union(
  object({
    state: literal("installed"),
    convexProjectId: id("repositoryConvexProjects"),
  }),
  object({ state: literal("no_convex_project") }),
  object({
    state: literal("failed"),
    convexProjectId: id("repositoryConvexProjects"),
    message: string(),
  }),
);

const vMcpConvexDeployKeyInstallation = union(
  object({ state: literal("installed") }),
  object({ state: literal("not_installed"), message: string() }),
);

const buildTokenUuidInputDescription =
  "Optional Workers Builds token UUID. Omit it: Samebase uses the last-used token, else the only token, and lists the tokens when it needs the user's choice.";
const convexProjectNameInputDescription =
  "Optional name of the attached Convex project whose deploy key the Worker gets. Required when several Convex projects are attached.";

export const cloudflareDiscoverWorkersContract = {
  id: "find_cloudflare_workers",
  access: providerConnectionAccess,
  args: {
    repositoryId: id("repositories"),
  },
  mcpArgs: mcpRepositoryArgs,
  returns: vCloudflareWorkerDiscoveryResult,
  structuredContent: vMcpCloudflareWorkerDiscoveryResult,
  mcp: {
    title: "Find Cloudflare Workers",
    name: "repository_cloudflare_findWorkers",
    description:
      "Find the Workers in the repository's Cloudflare account that can be added to the repository. attachable: already built from this repository; add it with repository_cloudflare_attachWorkers. connectable: not connected to any repository; repository_cloudflare_connectWorker connects it and replaces what it serves. Other Workers are only counted by reason.",
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
  doc: `Reads every visible Worker in the repository's stored Cloudflare account, observes each Worker's
current GitHub repository connection and Workers Builds root, and compares its tag and name with
the Workers that Samebase repositories already attach. Each Worker gets one attachment status:
attached, attached_elsewhere, attachable, connectable, connected_elsewhere, or unavailable. Only an
attachable Worker has one verified root for this repository's GitHub repository and can be
attached. A connectable Worker has no repository connection yet, and connecting it replaces what it
serves.

The MCP result lists only attachable and connectable Workers, and counts the others by status. A
Worker that another Samebase repository attaches is only counted, without that repository. A
partial inventory never proves that an unlisted Worker is absent. Discovery may refresh private
Samebase provider-connection bookkeeping, but it writes no attachment or provider resource.`,
} as const;

export const cloudflareAttachWorkersContract = {
  id: "attach_cloudflare_workers",
  access: providerConnectionAccess,
  args: {
    repositoryId: id("repositories"),
    workers: array(
      object({
        workerName: string(),
        workerTag: string(),
      }),
    ),
  },
  mcpArgs: {
    ...mcpRepositoryArgs,
    workerNames: array(string()),
  },
  returns: array(id("repositoryCloudflareWorkers")),
  structuredContent: object({ workerNames: array(string()) }),
  mcp: {
    title: "Attach Cloudflare Workers",
    name: "repository_cloudflare_attachWorkers",
    description:
      "Attach existing Workers that are already built from this repository: the Workers that repository_cloudflare_findWorkers reports as attachable. Cloudflare settings do not change.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
    inputDescriptions: {
      repository: MCP_REPOSITORY_INPUT_DESCRIPTION,
      workerNames: "Names of attachable Workers.",
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Re-reads every selected Worker and requires one current root for the repository's immutable
GitHub repository identity before writing any attachment. Only Workers that discovery reports as
attachable pass this check. A connectable Worker is rejected because it has no repository
connection yet; connect it instead. A Worker that another Samebase repository attaches is rejected
too. The final Samebase mutation is atomic: either every selected Worker is attached or none are.
Cloudflare configuration is not changed.`,
} as const;

export const cloudflareConnectWorkerContract = {
  id: "connect_cloudflare_worker",
  access: providerConnectionAccess,
  args: {
    repositoryId: id("repositories"),
    workerName: string(),
    workerTag: string(),
    rootDirectory: string(),
    buildTokenUuid: string(),
    convexProjectId: optional(id("repositoryConvexProjects")),
    confirmation: optional(vActionConfirmation),
  },
  mcpArgs: {
    ...mcpRepositoryArgs,
    workerName: string(),
    rootDirectory: optional(string()),
    buildTokenUuid: optional(string()),
    convexProjectName: optional(string()),
    confirmation: optional(vActionConfirmation),
  },
  returns: union(
    vActionConfirmationRequest,
    object({
      state: literal("ready"),
      workerId: id("repositoryCloudflareWorkers"),
      convexDeployKey: vConvexDeployKeyInstallation,
    }),
    object({
      state: literal("added_with_notice"),
      workerId: id("repositoryCloudflareWorkers"),
      message: string(),
    }),
  ),
  structuredContent: union(
    vActionConfirmationRequest,
    object({
      state: literal("connected"),
      workerName: string(),
      rootDirectory: string(),
      convexDeployKey: vMcpConvexDeployKeyInstallation,
    }),
    object({
      state: literal("connected_with_notice"),
      workerName: string(),
      message: string(),
    }),
  ),
  mcp: {
    title: "Connect Cloudflare Worker",
    name: "repository_cloudflare_connectWorker",
    description:
      "Connect a Worker that repository_cloudflare_findWorkers reports as connectable: attach it, configure its Workers Builds for this repository and root directory, and install the Convex deploy key. The production build that follows replaces what the Worker serves. Tell the user this effect before you call it.",
    safety: "destructive",
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: true,
    },
    inputDescriptions: {
      repository: MCP_REPOSITORY_INPUT_DESCRIPTION,
      workerName: "Name of the connectable Worker.",
      rootDirectory: "Optional repository root directory to build. Defaults to /.",
      buildTokenUuid: buildTokenUuidInputDescription,
      convexProjectName: convexProjectNameInputDescription,
      confirmation: MCP_ACTION_CONFIRMATION_INPUT_DESCRIPTION,
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Connects a Worker that has no Workers Builds repository connection to this repository. Samebase
re-reads the Worker by its stable tag, requires it to be unconnected, records the attachment, and
writes production and Previews Base Builds settings for the requested root directory. The next
production build replaces the Worker's current deployment.

Samebase then installs the Convex deploy key: for the chosen Convex project, else for the
repository's only attached Convex project. With several attached Convex projects and no choice, the
call fails before any provider change and lists them. With no attached Convex project, the Worker is
connected, its production build starts, and no key is installed; after a project is attached, the
deploy-key repair installs it. When a key is installed, the deploy-key step starts the production
build. When the key cannot be installed, the result says why, and no production build starts.

Samebase picks the Workers Builds token: the given UUID, else the available last-used token, else
the only token. Several tokens and no last-used one return an error that lists them.`,
} as const;

export const cloudflareCreateWorkerContract = {
  id: "create_cloudflare_worker",
  access: providerConnectionAccess,
  args: {
    repositoryId: id("repositories"),
    workerName: string(),
    rootDirectory: string(),
    buildTokenUuid: string(),
    convexProjectId: optional(id("repositoryConvexProjects")),
  },
  mcpArgs: {
    ...mcpRepositoryArgs,
    workerName: optional(string()),
    rootDirectory: optional(string()),
    buildTokenUuid: optional(string()),
    convexProjectName: optional(string()),
  },
  returns: object({
    workerId: id("repositoryCloudflareWorkers"),
    convexDeployKey: vConvexDeployKeyInstallation,
  }),
  structuredContent: object({
    workerName: string(),
    rootDirectory: string(),
    convexDeployKey: vMcpConvexDeployKeyInstallation,
  }),
  mcp: {
    title: "Create Cloudflare Worker",
    name: "repository_cloudflare_createWorker",
    description:
      "Create a Worker in the repository's Cloudflare account, which adds an app: attach it, configure its Workers Builds for this repository and root directory, install the Convex deploy key, and start the first production build. Also finishes a pending Cloudflare setup from repository_list.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
    inputDescriptions: {
      repository: MCP_REPOSITORY_INPUT_DESCRIPTION,
      workerName:
        "Optional name for the new Worker. Defaults to the pending Cloudflare setup's Worker name, else the repository name. An existing name is rejected.",
      rootDirectory:
        "Optional repository root directory to build. Defaults to the pending Cloudflare setup's root directory, else /.",
      buildTokenUuid: buildTokenUuidInputDescription,
      convexProjectName: convexProjectNameInputDescription,
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Creates one new Worker in the repository's stored Cloudflare account. Samebase checks repository
ownership, live repository identity, Cloudflare account access, the provider-write lock, the current
token list, and the Worker quota before the create request. It records the Worker as an attachment
and creates production and preview Workers Builds triggers for the requested root directory. An
existing Worker or Builds connection is not overwritten. If Builds setup fails after Worker
creation, the Worker can remain attached.

Samebase then installs the Convex deploy key: for the chosen Convex project, else for the
repository's only attached Convex project. With several attached Convex projects and no choice, the
call fails before any provider change and lists them. With no attached Convex project, the Worker is
created, its first production build starts, and no key is installed; after a project is attached,
the deploy-key repair installs it. When a key is installed, the deploy-key step starts the first
production build. When the key cannot be installed, the result says why, and no production build
starts.

Without a workerName, the MCP tool uses the pending Cloudflare setup's Worker name and root
directory from repository_list, else the repository name and the repository root. Samebase picks the
Workers Builds token: the given UUID, else the available last-used token, else the only token.`,
} as const;
