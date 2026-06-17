import { v } from "convex/values";
import { describe, expect, it } from "vite-plus/test";

import { action, mutation, query } from "./functions";

query({
  access: "access_dashboard",
  rateLimit: { mode: "check", name: "manualRepositoryRefresh", target: "viewer" },
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
  rateLimit: { mode: "consume", name: "manualRepositoryRefresh", target: "viewer" },
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
  rateLimit: { mode: "consume", name: "manualRepositoryRefresh", target: "viewer" },
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
  access: "access_dashboard",
  // @ts-expect-error Queries can check rate limits, but they cannot consume them.
  rateLimit: { mode: "consume", name: "manualRepositoryRefresh", target: "viewer" },
  args: {},
  handler: async () => null,
});

mutation({
  access: "access_app_refresh",
  // @ts-expect-error Mutations must use a configured rate-limit name.
  rateLimit: { mode: "consume", name: "notConfigured", target: "viewer" },
  args: {},
  handler: async () => null,
});

describe("access function wrapper", () => {
  it("keeps access and rate-limit policy checks on the real wrapper", () => {
    expect(true).toBe(true);
  });
});
