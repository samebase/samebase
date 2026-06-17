import {
  customAction,
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import { v } from "convex/values";
import { describe, expect, it } from "vite-plus/test";

import {
  action as rawAction,
  mutation as rawMutation,
  query as rawQuery,
} from "./_generated/server";

const ACCESS_KEYS = [
  "access_public",
  "access_dashboard",
  "access_provider_connections",
  "access_repo_connect",
  "access_app_create",
  "access_app_refresh",
  "access_files_read",
  "access_files_write",
  "access_machines",
  "access_mcp",
  "access_admin",
] as const;

type AccessKey = (typeof ACCESS_KEYS)[number];

const VIEWER_ROLES = ["role_anonymous", "role_member", "role_staff"] as const;

type ViewerRole = (typeof VIEWER_ROLES)[number];

type RateLimitConfig =
  | {
      kind: "fixed window";
      rate: number;
      period: number;
      capacity?: number;
    }
  | {
      kind: "token bucket";
      rate: number;
      period: number;
      capacity?: number;
    };

const RATE_LIMITS = {
  providerConnectionWrite: {
    kind: "token bucket",
    rate: 5,
    period: 60_000,
    capacity: 2,
  },
  appRefresh: {
    kind: "fixed window",
    rate: 20,
    period: 60_000,
  },
  fileWrite: {
    kind: "token bucket",
    rate: 10,
    period: 60_000,
    capacity: 3,
  },
} satisfies Record<string, RateLimitConfig>;

type RateLimitName = keyof typeof RATE_LIMITS;

type QueryRateLimitPolicy = {
  mode: "check";
  name: RateLimitName;
  target: "global" | "viewer";
};

type ConsumingRateLimitPolicy = {
  mode: "consume";
  name: RateLimitName;
  target: "global" | "viewer";
};

type AppQueryPolicy = {
  access: AccessKey;
  rateLimit?: QueryRateLimitPolicy;
};

type AppWritePolicy = {
  access: AccessKey;
  rateLimit?: ConsumingRateLimitPolicy;
};

type AppViewer = {
  role: ViewerRole;
  userId: string | null;
  requiredAccess: AccessKey;
  checkedRateLimit: RateLimitName | null;
};

function queryPolicyCtx(policy: AppQueryPolicy) {
  return {
    viewer: {
      role: "role_member",
      userId: "sample-user",
      requiredAccess: policy.access,
      checkedRateLimit: policy.rateLimit?.name ?? null,
    } satisfies AppViewer,
  };
}

function writePolicyCtx(policy: AppWritePolicy) {
  return {
    viewer: {
      role: "role_member",
      userId: "sample-user",
      requiredAccess: policy.access,
      checkedRateLimit: policy.rateLimit?.name ?? null,
    } satisfies AppViewer,
  };
}

const appFunction = {
  query: customQuery(
    rawQuery,
    customCtx((_ctx, policy: AppQueryPolicy) => queryPolicyCtx(policy)),
  ),
  mutation: customMutation(
    rawMutation,
    customCtx((_ctx, policy: AppWritePolicy) => writePolicyCtx(policy)),
  ),
  action: customAction(
    rawAction,
    customCtx((_ctx, policy: AppWritePolicy) => writePolicyCtx(policy)),
  ),
};

appFunction.query({
  access: "access_dashboard",
  rateLimit: { mode: "check", name: "appRefresh", target: "viewer" },
  args: { vaultId: v.string() },
  returns: v.object({
    vaultId: v.string(),
    access: v.string(),
    rateLimit: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    return {
      vaultId: args.vaultId,
      access: ctx.viewer.requiredAccess,
      rateLimit: ctx.viewer.checkedRateLimit,
    };
  },
});

appFunction.mutation({
  access: "access_provider_connections",
  rateLimit: {
    mode: "consume",
    name: "providerConnectionWrite",
    target: "viewer",
  },
  args: { provider: v.union(v.literal("github"), v.literal("cloudflare")) },
  returns: v.object({
    provider: v.union(v.literal("github"), v.literal("cloudflare")),
    access: v.string(),
    rateLimit: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    return {
      provider: args.provider,
      access: ctx.viewer.requiredAccess,
      rateLimit: ctx.viewer.checkedRateLimit,
    };
  },
});

appFunction.action({
  access: "access_app_refresh",
  rateLimit: { mode: "consume", name: "appRefresh", target: "viewer" },
  args: { vaultId: v.string() },
  returns: v.object({
    vaultId: v.string(),
    access: v.string(),
    rateLimit: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    return {
      vaultId: args.vaultId,
      access: ctx.viewer.requiredAccess,
      rateLimit: ctx.viewer.checkedRateLimit,
    };
  },
});

// @ts-expect-error Access policy is mandatory for app mutations.
appFunction.mutation({
  args: {},
  handler: async () => null,
});

appFunction.query({
  access: "access_dashboard",
  // @ts-expect-error Queries can check rate limits, but they cannot consume them.
  rateLimit: { mode: "consume", name: "appRefresh", target: "viewer" },
  args: {},
  handler: async () => null,
});

appFunction.mutation({
  access: "access_provider_connections",
  // @ts-expect-error Mutations must use a configured rate-limit name.
  rateLimit: { mode: "consume", name: "notConfigured", target: "viewer" },
  args: {},
  handler: async () => null,
});

describe("app function wrapper prototype", () => {
  it("keeps rate-limit names as a typed policy inventory", () => {
    expect(Object.keys(RATE_LIMITS)).toEqual([
      "providerConnectionWrite",
      "appRefresh",
      "fileWrite",
    ]);
  });
});
