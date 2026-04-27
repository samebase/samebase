import { internalMutation, mutation } from "./_generated/server";
import { requireCurrentUserPermission } from "./permissions";
import {
  introspectMachineControlTokenArgsValidator,
  issueMachineControlTokenArgsValidator,
  issueMachineControlTokenReturns,
  MACHINE_CONTROL_TOKEN_TTL_MS,
  type MachineControlTokenIntrospectionResult,
  machineControlTokenIntrospectionResultValidator,
} from "./connectedMachineModel";
import { createMachineControlTokenValue, sha256Hex } from "./mcp/tokens";
import { resolveConnectedMachineStatus } from "../shared/connectedMachinePresence";

/**
 * Machine-control tokens are intentionally short-lived and scoped to one
 * machine so the phone can call the local tunnel without sharing the durable
 * machine credential with the browser.
 */
export const issueMachineControlToken = mutation({
  args: issueMachineControlTokenArgsValidator,
  returns: issueMachineControlTokenReturns,
  handler: async (ctx, args) => {
    const userId = await requireCurrentUserPermission(ctx, "machines.access");
    const machine = await ctx.db
      .query("connectedMachines")
      .withIndex("by_user_machine_id", (q) =>
        q.eq("userId", userId).eq("machineId", args.machineId),
      )
      .first();
    if (!machine) {
      throw new Error("Connected machine not found.");
    }
    const now = Date.now();
    if (
      resolveConnectedMachineStatus({
        lastSeenAt: machine.lastSeenAt,
        now,
        status: machine.status,
      }) !== "online"
    ) {
      throw new Error("Connected machine is offline.");
    }
    if (
      machine.controlStatus !== "ready" ||
      typeof machine.controlUrl !== "string" ||
      !machine.capabilities.includes("liveControl")
    ) {
      throw new Error("Connected machine live control is not ready.");
    }

    const token = createMachineControlTokenValue();
    const tokenHash = await sha256Hex(token);
    const expiresAt = now + MACHINE_CONTROL_TOKEN_TTL_MS;

    await ctx.db.insert("machineControlTokens", {
      createdAt: now,
      expiresAt,
      machineId: args.machineId,
      tokenHash,
      userId,
    });

    return {
      expiresAt,
      token,
    };
  },
});

/**
 * Introspection stays fail-closed by proving both token validity and current
 * machine ownership at the moment the local service checks the token.
 */
export const introspectMachineControlToken = internalMutation({
  args: introspectMachineControlTokenArgsValidator,
  returns: machineControlTokenIntrospectionResultValidator,
  handler: async (
    ctx,
    args,
  ): Promise<MachineControlTokenIntrospectionResult> => {
    const token = await ctx.db
      .query("machineControlTokens")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .first();
    if (!token) {
      return {
        active: false,
      };
    }
    if (token.machineId !== args.machineId) {
      return {
        active: false,
      };
    }
    if (typeof token.revokedAt === "number" || token.expiresAt <= args.now) {
      return {
        active: false,
      };
    }

    const machine = await ctx.db
      .query("connectedMachines")
      .withIndex("by_user_machine_id", (q) =>
        q.eq("userId", token.userId).eq("machineId", args.machineId),
      )
      .first();
    if (!machine) {
      return {
        active: false,
      };
    }
    if (
      resolveConnectedMachineStatus({
        lastSeenAt: machine.lastSeenAt,
        now: args.now,
        status: machine.status,
      }) !== "online" ||
      machine.controlStatus !== "ready" ||
      typeof machine.controlUrl !== "string" ||
      !machine.capabilities.includes("liveControl")
    ) {
      return {
        active: false,
      };
    }

    await ctx.db.patch(token._id, {
      lastUsedAt: args.now,
    });

    return {
      active: true,
      audience: "machine-control",
      expiresAt: token.expiresAt,
      machineId: token.machineId,
      userId: token.userId,
    };
  },
});
