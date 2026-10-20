import { getAuthUserId } from "@convex-dev/auth/server";
import { v, type Infer } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { mutation } from "./functions";
import { startCustomSignInSession, vTokenBundle } from "./identity/signIn";
import { isAgentBrowserHandoffTokenValue, sha256Hex } from "./mcp/tokens";
import {
  ACCESS_BROWSER_LOGIN_HANDOFF,
  canAccess,
  readAccessKeysForRole,
} from "../shared/accessModel";
import { isMcpOauthClientInactive } from "./mcp/client";
import { parseScopeTokens } from "./mcp/scopes";
import { readNonDeletedUser } from "./identity/lifecycle";
import { readViewerRoleForUser } from "./identity/viewerRole";

const { id, literal, number, object, string, union } = v;

const AGENT_BROWSER_HANDOFF_CREATE_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const AGENT_BROWSER_HANDOFF_CREATE_RATE_LIMIT_MAX = 10;

const createForMcpArgsValidator = object({
  tokenHash: string(),
  userId: id("users"),
  grantId: string(),
  clientId: string(),
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

const signInWithAgentBrowserHandoffResultValidator = union(
  object({ status: literal("complete"), tokens: vTokenBundle }),
  object({ status: literal("error"), userError: object({ error: literal("HANDOFF_REJECTED") }) }),
);

function error(reason: string): { ok: false; reason: string } {
  return { ok: false, reason };
}

async function canUserCreateBrowserHandoff(ctx: Pick<MutationCtx, "db">, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  if (!user) {
    return false;
  }
  const lifecycle = readNonDeletedUser(user);
  if (lifecycle === null) {
    return false;
  }

  return canAccess(
    ACCESS_BROWSER_LOGIN_HANDOFF,
    readAccessKeysForRole(readViewerRoleForUser(lifecycle)),
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
  await ctx.db.insert("audit_mcpAccess_events", {
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
    if (!client || isMcpOauthClientInactive({ client, now: args.createdAt })) {
      return error("client_inactive");
    }

    if (!(await canUserCreateBrowserHandoff(ctx, args.userId))) {
      return error("access_missing");
    }

    const recentHandoffs = await ctx.db
      .query("mcpBrowserLoginTokens")
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

    const handoffId = await ctx.db.insert("mcpBrowserLoginTokens", args);
    await ctx.scheduler.runAfter(
      Math.max(0, args.expiresAt - args.createdAt),
      internal.agentBrowserHandoff.deleteExpired,
      { handoffId },
    );
    await writeAudit(ctx, {
      action: "agent_browser_handoff_created",
      clientId: args.clientId,
      grantId: args.grantId,
      userId: args.userId,
    });
    return { ok: true };
  },
});

export const deleteExpired = internalMutation({
  args: {
    handoffId: id("mcpBrowserLoginTokens"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const handoff = await ctx.db.get(args.handoffId);
    if (!handoff) {
      return null;
    }

    const now = Date.now();
    if (handoff.expiresAt > now) {
      await ctx.scheduler.runAfter(
        handoff.expiresAt - now,
        internal.agentBrowserHandoff.deleteExpired,
        { handoffId: args.handoffId },
      );
      return null;
    }

    await ctx.db.delete(args.handoffId);
    return null;
  },
});

/**
Consumes a handoff for the browser. Each rejection consumes the handoff and writes the audit row in
the same transaction as the result, so a rejected handoff cannot be retried.
*/
async function redeemForAuth(
  ctx: MutationCtx,
  args: { tokenHash: string; now: number; currentUserId: Id<"users"> | null },
): Promise<{ ok: true; userId: Id<"users"> } | { ok: false; reason: string }> {
  const handoff = await ctx.db
    .query("mcpBrowserLoginTokens")
    .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash))
    .first();
  if (!handoff) {
    return error("not_found");
  }

  if (typeof handoff.consumedAt === "number") {
    return error("consumed");
  }

  if (handoff.expiresAt <= args.now) {
    await ctx.db.patch(handoff._id, { consumedAt: args.now });
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
          : !client || isMcpOauthClientInactive({ client, now: args.now })
            ? "client_inactive"
            : !(await canUserCreateBrowserHandoff(ctx, handoff.userId))
              ? "access_missing"
              : args.currentUserId !== null && args.currentUserId !== handoff.userId
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
  });

  return { ok: true, userId: handoff.userId };
}

/**
Signs the browser in as the user who created the handoff. A rejection returns an error result
instead of throwing, so the consumption and the audit row stay, and the browser keeps its current
session.
*/
export const signInWithAgentBrowserHandoff = mutation({
  access: "access_public",
  args: { token: string() },
  returns: signInWithAgentBrowserHandoffResultValidator,
  handler: async (ctx, args) => {
    const rejected = {
      status: "error" as const,
      userError: { error: "HANDOFF_REJECTED" as const },
    };
    if (!isAgentBrowserHandoffTokenValue(args.token)) {
      return rejected;
    }

    const result = await redeemForAuth(ctx, {
      tokenHash: await sha256Hex(args.token),
      now: Date.now(),
      currentUserId: await getAuthUserId(ctx),
    });
    if (!result.ok) {
      return rejected;
    }

    const tokens = await startCustomSignInSession(ctx, {
      providerName: "agentBrowserHandoff",
      userId: result.userId,
    });
    return { status: "complete" as const, tokens };
  },
});
