import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

function stripSystemFields<T extends { _id: string; _creationTime: number }>(
  doc: T,
): Omit<T, "_id" | "_creationTime"> {
  const { _id: _ignoreId, _creationTime: _ignoreTime, ...rest } = doc;
  return rest;
}

function readUnknownField(record: unknown, key: string): unknown {
  if (typeof record !== "object" || record === null) {
    return undefined;
  }

  return Object.getOwnPropertyDescriptor(record, key)?.value;
}

export const cleanupCloudflareData = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    for (const user of users) {
      await ctx.db.replace(user._id, stripSystemFields(user));
    }

    const domains = await ctx.db.query("vaultDomains").collect();
    for (const domain of domains) {
      const source = readUnknownField(domain, "source");
      if (source === "cloudflare_workers_default" || source === "cloudflare_workers_custom") {
        await ctx.db.delete(domain._id);
      }
    }

    const prodRequests = await ctx.db.query("aiProdAccessRequests").collect();
    const cloudflareRequestIds = new Set<Id<"aiProdAccessRequests">>();
    for (const request of prodRequests) {
      const provider = readUnknownField(request, "provider");
      if (provider === "cloudflare") {
        cloudflareRequestIds.add(request._id);
        await ctx.db.delete(request._id);
      }
    }

    if (cloudflareRequestIds.size > 0) {
      const audits = await ctx.db.query("aiProdAccessAudit").collect();
      for (const audit of audits) {
        if (cloudflareRequestIds.has(audit.requestId)) {
          await ctx.db.delete(audit._id);
        }
      }
    }

    const oauthStates = await ctx.db.query("oauthStates").collect();
    for (const oauthState of oauthStates) {
      const provider = readUnknownField(oauthState, "provider");
      if (provider === "cloudflare_mcp") {
        await ctx.db.delete(oauthState._id);
      }
    }

    return null;
  },
});
