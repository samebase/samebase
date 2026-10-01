import { v } from "convex/values";

import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";

const { array, id, literal, object, string, union } = v;
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
attached = this Samebase app already records a Worker with this tag or, when no record has the
tag, this name.

attached_elsewhere = another Samebase app already records a Worker with this tag or name. Neither
attachWorkers nor the dashboard can add it.

attachable = connected to this repository in Cloudflare and not attached yet. This is the only
status that attachWorkers accepts.

connectable = not connected to any repository in Cloudflare. Only the Samebase dashboard can
connect it.

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
      "Call repository_dashboard_getUserRepositories first and use its returned repositoryId. List Workers in the Samebase repository's stored Cloudflare account with one attachment status each. attached: already on this Samebase app. attached_elsewhere: another Samebase app already uses it; it cannot be attached or connected here. attachable: connected to this repository in Cloudflare; only these Workers can be passed to repository_cloudflare_attachWorkers. connectable: not connected to any repository yet; the user can connect it in the Samebase dashboard, not through MCP. connected_elsewhere and unavailable: cannot be attached.",
    safety: "read_only",
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
    inputDescriptions: {
      repositoryId: "Samebase repository ID returned by repository_dashboard_getUserRepositories.",
      accountId:
        "The Samebase repository's cloudflareAccountId returned by repository_dashboard_getUserRepositories.",
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Reads every visible Worker in the repository's stored Cloudflare account, observes each Worker's
current GitHub repository connection and Workers Builds root, and compares its tag and name with
the Workers that Samebase apps already attach. Each Worker gets one attachment status: attached,
attached_elsewhere, attachable, connectable, connected_elsewhere, or unavailable. A Worker that
another Samebase app attaches is reported only as attached_elsewhere, without that app. Only an
attachable Worker has one verified root for the Samebase repository's GitHub repository and can be
attached. A connectable Worker has no repository connection yet, and only the Samebase dashboard
can connect it. A partial inventory never proves that an unlisted Worker is absent. It may refresh
private Samebase provider-connection bookkeeping, but it writes no attachment or provider resource.`,
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
      "Call repository_dashboard_getUserRepositories first and use its returned repositoryId. Attach existing Cloudflare Workers that repository_cloudflare_discoverWorkers returned with attachment attachable. Only attachable Workers can be attached. Samebase re-verifies each Worker's identity and live GitHub repository root before it writes the attachment.",
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
        "One or more Worker name and stable tag pairs that repository_cloudflare_discoverWorkers returned with attachment attachable.",
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Re-reads every selected Worker and requires one current root for the repository's immutable
GitHub repository identity before writing any attachment. Only Workers that discovery reports as
attachable pass this check. A connectable Worker is rejected because it has no repository
connection yet, and a Worker that another Samebase app attaches is rejected too. The final
Samebase mutation is atomic: either every selected Worker is attached or none are. Cloudflare
configuration is not changed.`,
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
