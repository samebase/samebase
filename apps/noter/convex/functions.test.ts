import { v } from "convex/values";
import { describe, expect, it } from "vite-plus/test";

import { action, mutation, query } from "./functions";

query({
  access: "access_dashboard",
  args: { vaultId: v.string() },
  returns: v.object({
    vaultId: v.string(),
    access: v.string(),
  }),
  handler: async (ctx, args) => {
    return {
      vaultId: args.vaultId,
      access: ctx.viewer.requiredAccess,
    };
  },
});

mutation({
  access: "access_app_refresh",
  args: { vaultId: v.string() },
  returns: v.object({
    vaultId: v.string(),
    access: v.string(),
  }),
  handler: async (ctx, args) => {
    return {
      vaultId: args.vaultId,
      access: ctx.viewer.requiredAccess,
    };
  },
});

action({
  access: "access_app_refresh",
  args: { vaultId: v.string() },
  returns: v.object({
    vaultId: v.string(),
    access: v.string(),
  }),
  handler: async (ctx, args) => {
    return {
      vaultId: args.vaultId,
      access: ctx.viewer.requiredAccess,
    };
  },
});

// @ts-expect-error Access policy is mandatory for app mutations.
mutation({
  args: {},
  handler: async () => null,
});

query({
  // @ts-expect-error Public functions must use a configured access key.
  access: "access_not_configured",
  args: {},
  handler: async () => null,
});

describe("access function wrapper", () => {
  it("keeps access policy checks on the real wrapper", () => {
    expect(true).toBe(true);
  });
});
