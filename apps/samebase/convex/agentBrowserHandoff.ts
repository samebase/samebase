import { v, type Infer } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { vMcpOauthClientRegistrationStatus } from "./schema";
import {
  ACCESS_BROWSER_LOGIN_HANDOFF,
  canAccess,
  readAccessKeysForRole,
} from "../shared/accessModel";
import { parseScopeTokens } from "./mcp/scopes";
import { readViewerRoleForUser } from "./viewerRole";

const { id, literal, number, object, optional, string, union } = v;

const AGENT_BROWSER_HANDOFF_CREATE_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const AGENT_BROWSER_HANDOFF_CREATE_RATE_LIMIT_MAX = 10;

const createForMcpArgsValidator = object({
  tokenHash: string(),
  userId: id("users"),
  grantId: string(),
  clientId: string(),
  returnToPath: string(),
  createdAt: number(),
  expiresAt: number(),
});
type CreateForMcpArgs = Infer<typeof createForMcpArgsValidator>;

const createForMcpResultValidator = union(
  object({
    ok: literal(true),
  }),
  object({
    ok: literal(false),
    reason: string(),
  }),
);
type CreateForMcpResult = Infer<typeof createForMcpResultValidator>;

const redeemForAuthArgsValidator = object({
  tokenHash: string(),
  now: number(),
  currentUserId: optional(id("users")),
  currentSessionId: optional(id("authSessions")),
});
type RedeemForAuthArgs = Infer<typeof redeemForAuthArgsValidator>;

const redeemForAuthResultValidator = union(
  object({
    ok: literal(true),
    userId: id("users"),
    sessionId: optional(id("authSessions")),
  }),
  object({
    ok: literal(false),
    reason: string(),
  }),
);
type RedeemForAuthResult = Infer<typeof redeemForAuthResultValidator>;

function isClientInactive(args: {
  client: {
    registrationStatus: Infer<typeof vMcpOauthClientRegistrationStatus>;
    provisionalExpiresAt?: number;
  };
  now: number;
}): boolean {
  return (
    args.client.registrationStatus === "expired" ||
    args.client.registrationStatus === "disabled" ||
    (typeof args.client.provisionalExpiresAt === "number" &&
      args.client.provisionalExpiresAt <= args.now)
  );
}

function error(reason: string): { ok: false; reason: string } {
  return { ok: false, reason };
}

async function canUserCreateBrowserHandoff(ctx: Pick<MutationCtx, "db">, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  if (!user) {
    return false;
  }

  return canAccess(
    ACCESS_BROWSER_LOGIN_HANDOFF,
    readAccessKeysForRole(readViewerRoleForUser(user)),
  );
}

async function writeAudit(
  ctx: Pick<MutationCtx, "db">,
  args: {
    action: string;
    clientId?: string;
    detailsJson?: string;
    grantId?: string;
    userId?: Id<"users">;
  },
) {
  await ctx.db.insert("mcpAccessAudit", {
    action: args.action,
    ...(args.clientId !== undefined ? { clientId: args.clientId } : {}),
    ...(args.detailsJson !== undefined ? { detailsJson: args.detailsJson } : {}),
    ...(args.grantId !== undefined ? { grantId: args.grantId } : {}),
    ...(args.userId !== undefined ? { userId: args.userId } : {}),
    createdAt: Date.now(),
  });
}

export const createForMcp = internalMutation({
  args: createForMcpArgsValidator,
  returns: createForMcpResultValidator,
  handler: async (ctx, args: CreateForMcpArgs): Promise<CreateForMcpResult> => {
    const grant = await ctx.db
      .query("mcpGrants")
      .withIndex("by_grant_id", (q) => q.eq("grantId", args.grantId))
      .first();
    if (!grant || grant.status !== "active") {
      return error("grant_inactive");
    }
    if (grant.userId !== args.userId || grant.clientId !== args.clientId) {
      return error("grant_mismatch");
    }
    if (!parseScopeTokens(grant.scope).includes(ACCESS_BROWSER_LOGIN_HANDOFF)) {
      return error("scope_missing");
    }

    const client = await ctx.db
      .query("mcpOauthClients")
      .withIndex("by_client_id", (q) => q.eq("clientId", args.clientId))
      .first();
    if (!client || isClientInactive({ client, now: args.createdAt })) {
      return error("client_inactive");
    }

    if (!(await canUserCreateBrowserHandoff(ctx, args.userId))) {
      return error("access_missing");
    }

    const recentHandoffs = await ctx.db
      .query("agentBrowserHandoffs")
      .withIndex("by_grant_id", (q) => q.eq("grantId", args.grantId))
      .order("desc")
      .take(AGENT_BROWSER_HANDOFF_CREATE_RATE_LIMIT_MAX);
    const recentCount = recentHandoffs.filter(
      (handoff) =>
        handoff.createdAt + AGENT_BROWSER_HANDOFF_CREATE_RATE_LIMIT_WINDOW_MS > args.createdAt,
    ).length;
    if (recentCount >= AGENT_BROWSER_HANDOFF_CREATE_RATE_LIMIT_MAX) {
      return error("rate_limited");
    }

    await ctx.db.insert("agentBrowserHandoffs", args);
    await writeAudit(ctx, {
      action: "agent_browser_handoff_created",
      clientId: args.clientId,
      grantId: args.grantId,
      userId: args.userId,
      detailsJson: JSON.stringify({ returnToPath: args.returnToPath }),
    });
    return { ok: true };
  },
});

export const redeemForAuth = internalMutation({
  args: redeemForAuthArgsValidator,
  returns: redeemForAuthResultValidator,
  handler: async (ctx, args: RedeemForAuthArgs): Promise<RedeemForAuthResult> => {
    const handoff = await ctx.db
      .query("agentBrowserHandoffs")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .first();
    if (!handoff) {
      await writeAudit(ctx, {
        action: "agent_browser_handoff_rejected",
        detailsJson: JSON.stringify({ reason: "not_found" }),
      });
      return error("not_found");
    }

    if (typeof handoff.consumedAt === "number") {
      await writeAudit(ctx, {
        action: "agent_browser_handoff_rejected",
        clientId: handoff.clientId,
        grantId: handoff.grantId,
        userId: handoff.userId,
        detailsJson: JSON.stringify({ reason: "consumed" }),
      });
      return error("consumed");
    }

    if (handoff.expiresAt <= args.now) {
      await writeAudit(ctx, {
        action: "agent_browser_handoff_rejected",
        clientId: handoff.clientId,
        grantId: handoff.grantId,
        userId: handoff.userId,
        detailsJson: JSON.stringify({ reason: "expired" }),
      });
      return error("expired");
    }

    const grant = await ctx.db
      .query("mcpGrants")
      .withIndex("by_grant_id", (q) => q.eq("grantId", handoff.grantId))
      .first();
    const client = await ctx.db
      .query("mcpOauthClients")
      .withIndex("by_client_id", (q) => q.eq("clientId", handoff.clientId))
      .first();
    const invalidReason =
      !grant || grant.status !== "active"
        ? "grant_inactive"
        : grant.userId !== handoff.userId || grant.clientId !== handoff.clientId
          ? "grant_mismatch"
          : !parseScopeTokens(grant.scope).includes(ACCESS_BROWSER_LOGIN_HANDOFF)
            ? "scope_missing"
            : !client || isClientInactive({ client, now: args.now })
              ? "client_inactive"
              : !(await canUserCreateBrowserHandoff(ctx, handoff.userId))
                ? "access_missing"
                : args.currentUserId !== undefined && args.currentUserId !== handoff.userId
                  ? "browser_user_mismatch"
                  : null;

    if (invalidReason !== null) {
      await ctx.db.patch(handoff._id, { consumedAt: args.now });
      await writeAudit(ctx, {
        action: "agent_browser_handoff_rejected",
        clientId: handoff.clientId,
        grantId: handoff.grantId,
        userId: handoff.userId,
        detailsJson: JSON.stringify({ reason: invalidReason }),
      });
      return error(invalidReason);
    }

    await ctx.db.patch(handoff._id, { consumedAt: args.now });
    await writeAudit(ctx, {
      action: "agent_browser_handoff_consumed",
      clientId: handoff.clientId,
      grantId: handoff.grantId,
      userId: handoff.userId,
      detailsJson: JSON.stringify({
        reusedSession: args.currentUserId === handoff.userId && args.currentSessionId !== undefined,
      }),
    });

    return {
      ok: true,
      userId: handoff.userId,
      ...(args.currentUserId === handoff.userId && args.currentSessionId !== undefined
        ? { sessionId: args.currentSessionId }
        : {}),
    };
  },
});
