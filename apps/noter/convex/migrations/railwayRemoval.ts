import { Infer, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

const CONFIRM_TOKEN = "REMOVE_RAILWAY";
const DEFAULT_BATCH_SIZE = 200;
const MAX_BATCH_SIZE = 500;
const SAMPLE_ID_LIMIT = 5;
const RAILWAY_REMOVED_MESSAGE =
  "Railway hosting was removed. Reprovision this vault with Netlify or Cloudflare.";

const { array, boolean, number, object, optional, string } = v;

const TABLE_PREVIEW = object({
  count: number(),
  sampleIds: array(string()),
});

const RAILWAY_PREVIEW = object({
  providerConnections: TABLE_PREVIEW,
  oauthStates: TABLE_PREVIEW,
  vaults: TABLE_PREVIEW,
  vaultInfrastructure: TABLE_PREVIEW,
  vaultDomains: TABLE_PREVIEW,
  aiProdAccessRequests: TABLE_PREVIEW,
  totalCount: number(),
});

const APPLY_CHANGES = object({
  providerConnectionsDeleted: number(),
  oauthStatesDeleted: number(),
  vaultsNormalized: number(),
  vaultInfrastructureNormalized: number(),
  vaultDomainsDeleted: number(),
  aiProdAccessRequestsDeleted: number(),
});

const APPLY_RESULT = object({
  batchSize: number(),
  changes: APPLY_CHANGES,
  remaining: RAILWAY_PREVIEW,
  moreRemaining: boolean(),
});

const VERIFY_RESULT = object({
  isClean: boolean(),
  remaining: RAILWAY_PREVIEW,
});

type RailwayPreview = Infer<typeof RAILWAY_PREVIEW>;
type RailwayMatches = {
  providerConnectionIds: Id<"providerConnections">[];
  oauthStateIds: Id<"oauthStates">[];
  vaultIds: Id<"vaults">[];
  vaultInfrastructureIds: Id<"vaultInfrastructure">[];
  vaultDomainIds: Id<"vaultDomains">[];
  aiProdAccessRequestIds: Id<"aiProdAccessRequests">[];
};

type ReadCtx = QueryCtx | MutationCtx;

function readUnknownField(record: unknown, key: string): unknown {
  if (typeof record !== "object" || record === null) {
    return undefined;
  }
  return Reflect.get(record, key);
}

function isRailwayHostingState(value: unknown): boolean {
  return readUnknownField(value, "provider") === "railway";
}

function normalizeBatchSize(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_BATCH_SIZE;
  }
  const rounded = Math.trunc(value);
  return Math.min(Math.max(rounded, 1), MAX_BATCH_SIZE);
}

function toPreviewEntry(ids: readonly string[]): Infer<typeof TABLE_PREVIEW> {
  return {
    count: ids.length,
    sampleIds: ids.slice(0, SAMPLE_ID_LIMIT),
  };
}

function buildPreview(matches: RailwayMatches): RailwayPreview {
  const providerConnections = toPreviewEntry(matches.providerConnectionIds);
  const oauthStates = toPreviewEntry(matches.oauthStateIds);
  const vaults = toPreviewEntry(matches.vaultIds);
  const vaultInfrastructure = toPreviewEntry(matches.vaultInfrastructureIds);
  const vaultDomains = toPreviewEntry(matches.vaultDomainIds);
  const aiProdAccessRequests = toPreviewEntry(matches.aiProdAccessRequestIds);
  const totalCount =
    providerConnections.count +
    oauthStates.count +
    vaults.count +
    vaultInfrastructure.count +
    vaultDomains.count +
    aiProdAccessRequests.count;

  return {
    providerConnections,
    oauthStates,
    vaults,
    vaultInfrastructure,
    vaultDomains,
    aiProdAccessRequests,
    totalCount,
  };
}

async function findRailwayProviderConnectionIds(
  ctx: ReadCtx,
): Promise<Id<"providerConnections">[]> {
  const rows = await ctx.db.query("providerConnections").collect();
  const ids: Id<"providerConnections">[] = [];
  for (const row of rows) {
    if (readUnknownField(row, "kind") === "railway") {
      ids.push(row._id);
    }
  }
  return ids;
}

async function findRailwayOAuthStateIds(
  ctx: ReadCtx,
): Promise<Id<"oauthStates">[]> {
  const rows = await ctx.db.query("oauthStates").collect();
  const ids: Id<"oauthStates">[] = [];
  for (const row of rows) {
    if (readUnknownField(row, "provider") === "railway") {
      ids.push(row._id);
    }
  }
  return ids;
}

async function findRailwayVaultIds(ctx: ReadCtx): Promise<Id<"vaults">[]> {
  const rows = await ctx.db.query("vaults").collect();
  const ids: Id<"vaults">[] = [];
  for (const row of rows) {
    if (readUnknownField(row, "hostingProvider") === "railway") {
      ids.push(row._id);
    }
  }
  return ids;
}

async function findRailwayVaultInfrastructureIds(
  ctx: ReadCtx,
): Promise<Id<"vaultInfrastructure">[]> {
  const rows = await ctx.db.query("vaultInfrastructure").collect();
  const ids: Id<"vaultInfrastructure">[] = [];
  for (const row of rows) {
    if (isRailwayHostingState(readUnknownField(row, "hosting"))) {
      ids.push(row._id);
    }
  }
  return ids;
}

async function findRailwayVaultDomainIds(
  ctx: ReadCtx,
): Promise<Id<"vaultDomains">[]> {
  const rows = await ctx.db.query("vaultDomains").collect();
  const ids: Id<"vaultDomains">[] = [];
  for (const row of rows) {
    if (readUnknownField(row, "source") === "railway_default") {
      ids.push(row._id);
    }
  }
  return ids;
}

async function findRailwayProdAccessRequestIds(
  ctx: ReadCtx,
): Promise<Id<"aiProdAccessRequests">[]> {
  const rows = await ctx.db.query("aiProdAccessRequests").collect();
  const ids: Id<"aiProdAccessRequests">[] = [];
  for (const row of rows) {
    if (readUnknownField(row, "provider") === "railway") {
      ids.push(row._id);
    }
  }
  return ids;
}

async function loadRailwayMatches(ctx: ReadCtx): Promise<RailwayMatches> {
  const [
    providerConnectionIds,
    oauthStateIds,
    vaultIds,
    vaultInfrastructureIds,
    vaultDomainIds,
    aiProdAccessRequestIds,
  ] = await Promise.all([
    findRailwayProviderConnectionIds(ctx),
    findRailwayOAuthStateIds(ctx),
    findRailwayVaultIds(ctx),
    findRailwayVaultInfrastructureIds(ctx),
    findRailwayVaultDomainIds(ctx),
    findRailwayProdAccessRequestIds(ctx),
  ]);

  return {
    providerConnectionIds,
    oauthStateIds,
    vaultIds,
    vaultInfrastructureIds,
    vaultDomainIds,
    aiProdAccessRequestIds,
  };
}

export const previewRailwayRemoval = query({
  args: {},
  returns: RAILWAY_PREVIEW,
  handler: async (ctx) => {
    const matches = await loadRailwayMatches(ctx);
    return buildPreview(matches);
  },
});

export const applyRailwayRemoval = mutation({
  args: {
    confirm: string(),
    batchSize: optional(number()),
  },
  returns: APPLY_RESULT,
  handler: async (ctx, args) => {
    if (args.confirm !== CONFIRM_TOKEN) {
      throw new Error(
        `Invalid confirmation token. Re-run with confirm="${CONFIRM_TOKEN}".`,
      );
    }

    const batchSize = normalizeBatchSize(args.batchSize);
    const matches = await loadRailwayMatches(ctx);

    const providerConnectionIds = matches.providerConnectionIds.slice(
      0,
      batchSize,
    );
    for (const id of providerConnectionIds) {
      await ctx.db.delete(id);
    }

    const oauthStateIds = matches.oauthStateIds.slice(0, batchSize);
    for (const id of oauthStateIds) {
      await ctx.db.delete(id);
    }

    const vaultIds = matches.vaultIds.slice(0, batchSize);
    for (const id of vaultIds) {
      await ctx.db.patch(id, { hostingProvider: "netlify" });
    }

    const vaultInfrastructureIds = matches.vaultInfrastructureIds.slice(
      0,
      batchSize,
    );
    for (const id of vaultInfrastructureIds) {
      await ctx.db.patch(id, {
        hosting: undefined,
        status: "partial",
        lastError: RAILWAY_REMOVED_MESSAGE,
      });
    }

    const vaultDomainIds = matches.vaultDomainIds.slice(0, batchSize);
    for (const id of vaultDomainIds) {
      await ctx.db.delete(id);
    }

    const aiProdAccessRequestIds = matches.aiProdAccessRequestIds.slice(
      0,
      batchSize,
    );
    for (const id of aiProdAccessRequestIds) {
      await ctx.db.delete(id);
    }

    const remaining = buildPreview(await loadRailwayMatches(ctx));

    return {
      batchSize,
      changes: {
        providerConnectionsDeleted: providerConnectionIds.length,
        oauthStatesDeleted: oauthStateIds.length,
        vaultsNormalized: vaultIds.length,
        vaultInfrastructureNormalized: vaultInfrastructureIds.length,
        vaultDomainsDeleted: vaultDomainIds.length,
        aiProdAccessRequestsDeleted: aiProdAccessRequestIds.length,
      },
      remaining,
      moreRemaining: remaining.totalCount > 0,
    };
  },
});

export const verifyRailwayRemoval = query({
  args: {},
  returns: VERIFY_RESULT,
  handler: async (ctx) => {
    const remaining = buildPreview(await loadRailwayMatches(ctx));
    return {
      isClean: remaining.totalCount === 0,
      remaining,
    };
  },
});
