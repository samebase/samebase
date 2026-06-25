import { expectType } from "@samebase/dependent";
import { v } from "convex/values";
import { describe, expect, it } from "vite-plus/test";

import type { Id } from "./_generated/dataModel";
import { action, mutation, query } from "./functions";
import {
  ACCESS_KEYS,
  VIEWER_ROLES,
  canAccess,
  readAccessKeysForRole,
  type AccessKey,
  type ViewerRole,
} from "../shared/accessModel";

const EXPECTED_PHASE_1_GRANTS: Record<ViewerRole, readonly AccessKey[]> = {
  role_anonymous: ["access_public"],
  role_pending_access: ["access_public", "access_user_preferences"],
  role_member: [
    "access_public",
    "access_user_preferences",
    "access_dashboard",
    "access_provider_connections",
    "access_repo_connect",
    "access_app_create",
    "access_app_refresh",
    "access_files_read",
    "access_files_write",
    "access_mcp",
  ],
  role_staff: ACCESS_KEYS,
};

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
      const accessKeys = readAccessKeysForRole(role);
      expect(accessKeys, role).toEqual(EXPECTED_PHASE_1_GRANTS[role]);
      for (const access of ACCESS_KEYS) {
        expect(canAccess(access, accessKeys), `${role} ${access}`).toBe(
          EXPECTED_PHASE_1_GRANTS[role].includes(access),
        );
      }
    }
  });
});
