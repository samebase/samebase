import { v } from "convex/values";
import { describe, expect, it } from "vite-plus/test";

import { action, mutation, query } from "./functions";
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
