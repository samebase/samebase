import { v } from "convex/values";
import { notEmpty } from "@samebase/dependent";
import { internalMutation, internalQuery } from "./_generated/server";
import { vGitHubBackoff, vGitHubBackoffPrincipal } from "./githubBackoffModel";

export const get = internalQuery({
  args: {
    principal: vGitHubBackoffPrincipal,
    resource: v.union(v.string(), v.null()),
  },
  returns: v.union(vGitHubBackoff, v.null()),
  handler: async (ctx, args) => {
    const resources = args.resource === null ? [null] : [null, args.resource];
    const rows = await Promise.all(
      resources.map((resource) =>
        ctx.db
          .query("githubRateLimitCooldowns")
          .withIndex("by_principal_kind_and_id_and_resource", (q) =>
            q
              .eq("principal.kind", args.principal.kind)
              .eq("principal.id", args.principal.id)
              .eq("resource", resource),
          )
          .unique(),
      ),
    );
    const latest = rows
      .filter(notEmpty)
      .sort(
        (left, right) =>
          right.until - left.until || (left.resource ?? "").localeCompare(right.resource ?? ""),
      )
      .at(0);
    return latest ? { resource: latest.resource, until: latest.until } : null;
  },
});

export const record = internalMutation({
  args: {
    principal: vGitHubBackoffPrincipal,
    ...vGitHubBackoff.fields,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("githubRateLimitCooldowns")
      .withIndex("by_principal_kind_and_id_and_resource", (q) =>
        q
          .eq("principal.kind", args.principal.kind)
          .eq("principal.id", args.principal.id)
          .eq("resource", args.resource),
      )
      .unique();
    if (existing) {
      if (args.until > existing.until) await ctx.db.patch(existing._id, { until: args.until });
    } else {
      await ctx.db.insert("githubRateLimitCooldowns", {
        principal: { kind: args.principal.kind, id: args.principal.id },
        resource: args.resource,
        until: args.until,
      });
    }
    return null;
  },
});
