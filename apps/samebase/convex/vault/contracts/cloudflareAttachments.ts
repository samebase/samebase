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
      "Discover Workers in a Cloudflare account and observe which ones are currently connected to this vault's GitHub repository and live Workers Builds roots.",
    safety: "read_only",
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
    inputDescriptions: {
      vaultId: "Samebase vault whose GitHub repository the Workers must match.",
      accountId: "Cloudflare account id from list_cloudflare_accounts.",
    },
  } satisfies AppFunctionMcpMetadata,
  doc: `Reads every visible Worker in the selected Cloudflare account and observes each Worker's
current GitHub repository, Workers Builds root, trigger pair, and Convex marker. Only a Worker with
one verified root for the vault's repository is eligible for attachment. A partial inventory never
proves that an unlisted Worker is absent. This action writes no attachment or provider resource.`,
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
      openWorldHint: true,
      destructiveHint: false,
    },
    inputDescriptions: {
      vaultId: "Samebase vault whose GitHub repository the Workers must match.",
      accountId: "Cloudflare account id used for the preceding Worker discovery.",
      workers:
        "One or more Worker name and stable tag pairs returned by discover_cloudflare_workers.",
    },
  } satisfies AppFunctionMcpMetadata,
  doc: `Re-reads every selected Worker and requires one current root for the vault's immutable
GitHub repository identity before writing any attachment. The final Samebase mutation is atomic:
either every selected Worker is attached or none are. Cloudflare configuration is not changed.`,
} as const;

export const cloudflareCreateWorkerContract = {
  access: providerConnectionAccess,
  args: {
    vaultId: id("vaults"),
    accountId: string(),
    workerName: string(),
    rootDirectory: string(),
  },
  returns: id("vaultCloudflareWorkers"),
} as const;

export const cloudflareDetachWorkerContract = {
  access: providerConnectionAccess,
  args: {
    vaultId: id("vaults"),
    workerId: id("vaultCloudflareWorkers"),
  },
  returns: nullValue(),
} as const;
