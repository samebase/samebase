import { v } from "convex/values";

import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";

const { array, id, literal, object, string, union } = v;
const providerConnectionAccess = "access_provider_connections" as const;

export const vCloudflareConvexProjectReference = object({
  teamId: string(),
  projectId: string(),
});

export const vCloudflareConvexBuildAccess = union(
  object({ state: literal("not_configured") }),
  object({ state: literal("configured"), convexProject: vCloudflareConvexProjectReference }),
  object({ state: literal("incomplete"), convexProject: vCloudflareConvexProjectReference }),
  object({ state: literal("target_unknown") }),
  object({ state: literal("invalid") }),
  object({ state: literal("unavailable") }),
);

export const vCloudflareWorkerProductionBuild = union(
  object({
    state: literal("available"),
    productionTriggerUuid: string(),
  }),
  object({ state: literal("not_available") }),
  object({ state: literal("ambiguous") }),
);

export const vCloudflareWorkerRepositoryDiscovery = union(
  object({
    state: literal("ready"),
    rootDirectory: string(),
    builds: vCloudflareWorkerProductionBuild,
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

export const vCloudflareWorkerDiscovery = object({
  workerName: string(),
  workerTag: string(),
  repository: vCloudflareWorkerRepositoryDiscovery,
  convexBuildAccess: vCloudflareConvexBuildAccess,
});

const vCloudflareWorkerDiscoveryResult = object({
  inventoryState: union(literal("complete"), literal("partial")),
  workers: array(vCloudflareWorkerDiscovery),
});

export const cloudflareDiscoverWorkersContract = {
  id: "discover_cloudflare_workers",
  access: providerConnectionAccess,
  args: {
    repositoryId: id("repositories"),
    accountId: string(),
  },
  returns: vCloudflareWorkerDiscoveryResult,
  structuredContent: vCloudflareWorkerDiscoveryResult,
  mcp: {
    title: "Discover Cloudflare Workers",
    name: "repository_cloudflare_discoverWorkers",
    description:
      "Call repository_dashboard_getUserRepositories first and use its returned repositoryId. Discover Workers in the Samebase repository's stored Cloudflare account and observe which ones are connected to its GitHub repository and live Workers Builds roots.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
    inputDescriptions: {
      repositoryId: "Samebase repository ID returned by repository_dashboard_getUserRepositories.",
      accountId:
        "The Samebase repository's cloudflareAccountId returned by repository_dashboard_getUserRepositories.",
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Reads every visible Worker in the repository's stored Cloudflare account and observes each Worker's
current GitHub repository, Workers Builds root, trigger pair, and Convex marker. Only a Worker with
one verified root for the Samebase repository's GitHub repository is eligible for attachment. A partial inventory never
proves that an unlisted Worker is absent. It may refresh private Samebase provider-connection
bookkeeping, but it writes no attachment or provider resource.`,
} as const;

export const cloudflareAttachWorkersContract = {
  id: "attach_cloudflare_workers",
  access: providerConnectionAccess,
  args: {
    repositoryId: id("repositories"),
    accountId: string(),
    workers: array(
      object({
        workerName: string(),
        workerTag: string(),
      }),
    ),
  },
  returns: array(id("repositoryCloudflareWorkers")),
  structuredContent: object({ workerIds: array(id("repositoryCloudflareWorkers")) }),
  mcp: {
    title: "Attach Cloudflare Workers",
    name: "repository_cloudflare_attachWorkers",
    description:
      "Call repository_dashboard_getUserRepositories first and use its returned repositoryId. Attach selected existing Cloudflare Workers to a Samebase repository after re-verifying their identities and live GitHub repository roots.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
    inputDescriptions: {
      repositoryId: "Samebase repository ID returned by repository_dashboard_getUserRepositories.",
      accountId:
        "The Samebase repository's cloudflareAccountId returned by repository_dashboard_getUserRepositories and used for the preceding Worker discovery.",
      workers:
        "One or more Worker name and stable tag pairs returned by repository_cloudflare_discoverWorkers.",
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Re-reads every selected Worker and requires one current root for the repository's immutable
GitHub repository identity before writing any attachment. The final Samebase mutation is atomic:
either every selected Worker is attached or none are. Cloudflare configuration is not changed.`,
} as const;

export const cloudflareConnectWorkerContract = {
  access: providerConnectionAccess,
  args: {
    repositoryId: id("repositories"),
    accountId: string(),
    workerName: string(),
    workerTag: string(),
    rootDirectory: string(),
    buildTokenUuid: string(),
  },
  returns: union(
    object({ state: literal("ready"), workerId: id("repositoryCloudflareWorkers") }),
    object({
      state: literal("added_with_notice"),
      workerId: id("repositoryCloudflareWorkers"),
      message: string(),
    }),
  ),
} as const;

export const cloudflareCreateWorkerContract = {
  id: "create_cloudflare_worker",
  access: providerConnectionAccess,
  args: {
    repositoryId: id("repositories"),
    accountId: string(),
    workerName: string(),
    rootDirectory: string(),
    buildTokenUuid: string(),
  },
  returns: id("repositoryCloudflareWorkers"),
  structuredContent: object({ workerId: id("repositoryCloudflareWorkers") }),
  mcp: {
    title: "Create Cloudflare Worker",
    name: "repository_cloudflare_createWorker",
    description:
      "Call repository_dashboard_getUserRepositories first and use its returned repositoryId. Create and attach a Cloudflare Worker in the Samebase repository's stored Cloudflare account, configure Workers Builds for that repository root, and request the first production build.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
    inputDescriptions: {
      repositoryId: "Samebase repository ID returned by repository_dashboard_getUserRepositories.",
      accountId:
        "The Samebase repository's cloudflareAccountId returned by repository_dashboard_getUserRepositories.",
      workerName: "Name for the new Cloudflare Worker. An existing name is rejected.",
      rootDirectory: "Repository root for this Worker's GitHub Builds triggers.",
      buildTokenUuid: "Workers Builds token UUID returned by cloudflare_listWorkersBuildTokens.",
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Creates one new Worker in the Samebase repository's stored Cloudflare account for an existing
connected repository. Samebase checks repository ownership, live repository identity, Cloudflare account
access, the provider-write lock, the current non-empty token list, and the Worker quota before the
create request. It records the Worker as an attachment, creates production and preview Workers
Builds triggers for the requested repository root, and requests the first production build only
with a reread default branch and full commit SHA. This action does not change Convex deploy keys.
Use the separate deploy-key action after the Worker exists. An existing Worker or Builds connection
is not overwritten. If Builds setup fails after Worker creation, the Worker can remain attached.
Reread inventory after every result before another write.`,
} as const;

export const cloudflareDetachWorkerContract = {
  access: providerConnectionAccess,
  args: {
    repositoryId: id("repositories"),
    workerId: id("repositoryCloudflareWorkers"),
  },
  returns: v.null(),
} as const;
