import { v } from "convex/values";

import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";

const { array, id, literal, null: nullValue, object, string, union } = v;
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
  object({ state: literal("inconsistent") }),
  object({ state: literal("invalid") }),
  object({ state: literal("unavailable") }),
);

export const vCloudflareWorkerBuildTriggerPair = union(
  object({
    state: literal("available"),
    productionTriggerUuid: string(),
    previewTriggerUuid: string(),
  }),
  object({ state: literal("not_available") }),
  object({ state: literal("ambiguous") }),
);

export const vCloudflareWorkerRepositoryDiscovery = union(
  object({
    state: literal("ready"),
    rootDirectory: string(),
    builds: vCloudflareWorkerBuildTriggerPair,
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
    vaultId: id("vaults"),
    accountId: string(),
  },
  returns: vCloudflareWorkerDiscoveryResult,
  structuredContent: vCloudflareWorkerDiscoveryResult,
  mcp: {
    title: "Discover Cloudflare Workers",
    name: "vault_cloudflare_discoverWorkers",
    description:
      "Discover Workers in the vault's stored Cloudflare account and observe which ones are currently connected to this vault's GitHub repository and live Workers Builds roots.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
    inputDescriptions: {
      vaultId: "Samebase vault whose GitHub repository the Workers must match.",
      accountId: "The vault's cloudflareAccountId returned by get_user_vaults.",
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Reads every visible Worker in the vault's stored Cloudflare account and observes each Worker's
current GitHub repository, Workers Builds root, trigger pair, and Convex marker. Only a Worker with
one verified root for the vault's repository is eligible for attachment. A partial inventory never
proves that an unlisted Worker is absent. It may refresh private Samebase provider-connection
bookkeeping, but it writes no attachment or provider resource.`,
} as const;

export const cloudflareAttachWorkersContract = {
  id: "attach_cloudflare_workers",
  access: providerConnectionAccess,
  args: {
    vaultId: id("vaults"),
    accountId: string(),
    workers: array(
      object({
        workerName: string(),
        workerTag: string(),
      }),
    ),
  },
  returns: array(id("vaultCloudflareWorkers")),
  structuredContent: object({ workerIds: array(id("vaultCloudflareWorkers")) }),
  mcp: {
    title: "Attach Cloudflare Workers",
    name: "vault_cloudflare_attachWorkers",
    description:
      "Attach selected existing Cloudflare Workers to a vault after re-verifying their identities and live GitHub repository roots.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
    inputDescriptions: {
      vaultId: "Samebase vault whose GitHub repository the Workers must match.",
      accountId:
        "The vault's cloudflareAccountId returned by get_user_vaults and used for the preceding Worker discovery.",
      workers:
        "One or more Worker name and stable tag pairs returned by discover_cloudflare_workers.",
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Re-reads every selected Worker and requires one current root for the vault's immutable
GitHub repository identity before writing any attachment. The final Samebase mutation is atomic:
either every selected Worker is attached or none are. Cloudflare configuration is not changed.`,
} as const;

export const cloudflareConnectWorkerContract = {
  access: providerConnectionAccess,
  args: {
    vaultId: id("vaults"),
    accountId: string(),
    workerName: string(),
    workerTag: string(),
    rootDirectory: string(),
  },
  returns: union(
    object({ state: literal("ready"), workerId: id("vaultCloudflareWorkers") }),
    object({
      state: literal("added_with_notice"),
      workerId: id("vaultCloudflareWorkers"),
      message: string(),
    }),
  ),
} as const;

export const cloudflareCreateWorkerContract = {
  id: "create_cloudflare_worker",
  access: providerConnectionAccess,
  args: {
    vaultId: id("vaults"),
    accountId: string(),
    workerName: string(),
    rootDirectory: string(),
  },
  returns: id("vaultCloudflareWorkers"),
  structuredContent: object({ workerId: id("vaultCloudflareWorkers") }),
  mcp: {
    title: "Create Cloudflare Worker",
    name: "vault_cloudflare_createWorker",
    description:
      "Create and attach a Cloudflare Worker in the vault's stored Cloudflare account, configure Workers Builds for that repository root, and request the first production build.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
    inputDescriptions: {
      vaultId: "Existing connected Samebase vault returned by get_user_vaults.",
      accountId: "The vault's cloudflareAccountId returned by get_user_vaults.",
      workerName: "Name for the new Cloudflare Worker. An existing name is rejected.",
      rootDirectory: "Repository root for this Worker's GitHub Builds triggers.",
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Creates one new Worker in the vault's stored Cloudflare account for an existing connected
repository vault. Samebase checks vault ownership, live repository identity, Cloudflare account
access, the provider-write lock, and the Worker quota before the create request. It records the
Worker as an attachment, creates production and preview Workers Builds triggers for the requested
repository root, and requests the first production build only with a reread default branch and full
commit SHA. An existing Worker or Builds connection is not overwritten. If Builds setup fails after
Worker creation, the Worker can remain attached. Reread inventory after every result before another
write.`,
} as const;

export const cloudflareDetachWorkerContract = {
  access: providerConnectionAccess,
  args: {
    vaultId: id("vaults"),
    workerId: id("vaultCloudflareWorkers"),
  },
  returns: nullValue(),
} as const;
