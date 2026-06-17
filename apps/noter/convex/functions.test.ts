import { expectType } from "@noter-md/dependent";
import { v } from "convex/values";
import { describe, expect, it } from "vite-plus/test";

import type { Id } from "./_generated/dataModel";
import { action, mutation, publicQuery, query } from "./functions";
import { ACCESS_KEYS, canAccess, type AccessKey, type ViewerRole } from "../shared/accessModel";

const EXPECTED_PHASE_1_GRANTS: Record<ViewerRole, readonly AccessKey[]> = {
  role_anonymous: ["access_public"],
  role_member: [
    "access_public",
    "access_dashboard",
    "access_provider_connections",
    "access_repo_connect",
    "access_app_refresh",
  ],
  role_staff: ACCESS_KEYS,
};

const VIEWER_ROLES = [
  "role_anonymous",
  "role_member",
  "role_staff",
] satisfies readonly ViewerRole[];

query({
  access: "access_dashboard",
  args: { vaultId: v.string() },
  returns: v.object({
    vaultId: v.string(),
    access: v.string(),
    userId: v.id("users"),
    userEmail: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    expectType<Id<"users">>()(ctx.viewer.userId, true);

    return {
      vaultId: args.vaultId,
      access: ctx.viewer.requiredAccess,
      userId: ctx.viewer.userId,
      userEmail: ctx.viewer.user.email ?? null,
    };
  },
});

mutation({
  access: "access_app_refresh",
  args: { vaultId: v.string() },
  returns: v.object({
    vaultId: v.string(),
    access: v.string(),
    userId: v.id("users"),
    userEmail: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    expectType<Id<"users">>()(ctx.viewer.userId, true);

    return {
      vaultId: args.vaultId,
      access: ctx.viewer.requiredAccess,
      userId: ctx.viewer.userId,
      userEmail: ctx.viewer.user.email ?? null,
    };
  },
});

action({
  access: "access_app_refresh",
  args: { vaultId: v.string() },
  returns: v.object({
    vaultId: v.string(),
    access: v.string(),
    userId: v.id("users"),
    userEmail: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    expectType<Id<"users">>()(ctx.viewer.userId, true);

    return {
      vaultId: args.vaultId,
      access: ctx.viewer.requiredAccess,
      userId: ctx.viewer.userId,
      userEmail: ctx.viewer.user.email ?? null,
    };
  },
});

query({
  access: "access_public",
  args: {},
  returns: v.object({
    userId: v.union(v.id("users"), v.null()),
    userEmail: v.union(v.string(), v.null()),
  }),
  handler: async (ctx) => {
    expectType<Id<"users"> | null>()(ctx.viewer.userId, true);

    // @ts-expect-error Public routes may be anonymous.
    const _userId: Id<"users"> = ctx.viewer.userId;

    return {
      userId: ctx.viewer.userId,
      userEmail: ctx.viewer.user?.email ?? null,
    };
  },
});

publicQuery({
  access: "access_public",
  args: { vaultId: v.string() },
  returns: v.object({
    vaultId: v.string(),
    userId: v.union(v.id("users"), v.null()),
  }),
  handler: async (ctx, args) => {
    return {
      vaultId: args.vaultId,
      userId: ctx.viewer.userId,
    };
  },
});

publicQuery({
  // @ts-expect-error Public-only compatibility wrappers cannot expose authenticated access.
  access: "access_dashboard",
  args: {},
  handler: async () => null,
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
  it("matches the phase 1 grant matrix", () => {
    for (const role of VIEWER_ROLES) {
      for (const access of ACCESS_KEYS) {
        expect(canAccess(access, role), `${role} ${access}`).toBe(
          EXPECTED_PHASE_1_GRANTS[role].includes(access),
        );
      }
    }
  });
});
