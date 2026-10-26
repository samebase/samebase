import { defineTable } from "convex/server";
import { v } from "convex/values";

const { literal, number, object, string, union } = v;

export const githubBackoffPrincipal = object({
  kind: union(literal("installation"), literal("user")),
  id: string(),
});

export const githubBackoff = object({
  resource: union(string(), v.null()),
  until: number(),
});

export const githubBackoffTables = {
  /** Observed GitHub cooldowns shared by all repositories using the same provider identity. */
  githubRateLimitCooldowns: defineTable({
    principal: githubBackoffPrincipal,
    ...githubBackoff.fields,
  }).index("by_principal_kind_and_id_and_resource", ["principal.kind", "principal.id", "resource"]),
};
