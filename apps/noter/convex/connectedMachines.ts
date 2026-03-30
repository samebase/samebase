import { getAuthUserId } from "@convex-dev/auth/server";
import { Infer, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import {
  approveMachineRegistrationRequestReturns,
  CONNECTED_MACHINE_STALE_AFTER_MS,
  connectedMachineViewValidator,
  connectorHeartbeatArgsValidator,
  createMachineRegistrationRequestArgsValidator,
  machineRegistrationBrowserViewValidator,
  type ConnectedMachineCapability,
  type ConnectedMachineRow,
  type ConnectedMachineStatus,
  type MachineRegistrationBrowserView,
  type MachineRegistrationRequestRow,
  type ValidateMachineCredentialResult,
  validateMachineCredentialResultValidator,
} from "./connectedMachineModel";
import { getUserId } from "./common";

const { array, null: vNull, number, object, string } = v;

const listConnectedMachinesArgs = object({});
const listConnectedMachinesReturns = array(connectedMachineViewValidator);

const getMachineRegistrationRequestForBrowserArgs = object({
  requestId: string(),
});
type GetMachineRegistrationRequestForBrowserArgs = Infer<
  typeof getMachineRegistrationRequestForBrowserArgs
>;

const approveMachineRegistrationRequestArgs = object({
  requestId: string(),
});
type ApproveMachineRegistrationRequestArgs = Infer<
  typeof approveMachineRegistrationRequestArgs
>;

const validateMachineCredentialArgs = object({
  credentialHash: string(),
  machineId: string(),
  now: number(),
});
type ValidateMachineCredentialArgs = Infer<
  typeof validateMachineCredentialArgs
>;

function readUniqueCapabilities(
  values: ConnectedMachineCapability[],
): ConnectedMachineCapability[] {
  return Array.from(new Set(values));
}

function readUniqueRoots(values: string[]): string[] {
  return Array.from(
    new Set(
      values.map((value) => value.trim()).filter((value) => value.length > 0),
    ),
  );
}

/**
 * Treat stale heartbeats as offline so the browser never keeps showing a dead
 * connector as available after the process disappears without a clean exit.
 */
function resolveConnectedMachineStatus(args: {
  lastSeenAt: number;
  status: ConnectedMachineStatus;
  now: number;
}): ConnectedMachineStatus {
  if (args.status === "offline") {
    return "offline";
  }

  return args.lastSeenAt + CONNECTED_MACHINE_STALE_AFTER_MS >= args.now
    ? "online"
    : "offline";
}

function buildConnectedMachineView(args: {
  row: ConnectedMachineRow;
  now: number;
}) {
  return {
    machineId: args.row.machineId,
    displayName: args.row.displayName,
    hostname: args.row.hostname,
    os: args.row.os,
    status: resolveConnectedMachineStatus({
      lastSeenAt: args.row.lastSeenAt,
      status: args.row.status,
      now: args.now,
    }),
    lastSeenAt: args.row.lastSeenAt,
    connectorVersion: args.row.connectorVersion,
    capabilities: args.row.capabilities,
    allowedRoots: args.row.allowedRoots,
  };
}

function resolveMachineRegistrationState(args: {
  request: MachineRegistrationRequestRow;
  now: number;
}): "pending" | "approved" | "expired" {
  if (args.request.expiresAt <= args.now) {
    return "expired";
  }

  return typeof args.request.approvedAt === "number" ? "approved" : "pending";
}

function buildMachineRegistrationBrowserView(args: {
  request: MachineRegistrationRequestRow;
  now: number;
}): MachineRegistrationBrowserView {
  const commonFields = {
    requestId: args.request.requestId,
    machineId: args.request.machineId,
    displayName: args.request.displayName,
    hostname: args.request.hostname,
    os: args.request.os,
    connectorVersion: args.request.connectorVersion,
  };
  const state = resolveMachineRegistrationState(args);

  if (state === "approved") {
    return {
      kind: "approved",
      ...commonFields,
      approvedAt: args.request.approvedAt ?? args.now,
    };
  }

  if (state === "expired") {
    return {
      kind: "expired",
      ...commonFields,
      expiresAt: args.request.expiresAt,
    };
  }

  return {
    kind: "pending",
    ...commonFields,
    expiresAt: args.request.expiresAt,
  };
}

export const listConnectedMachines = query({
  args: listConnectedMachinesArgs,
  returns: listConnectedMachinesReturns,
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const rows = await ctx.db
      .query("connectedMachines")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const now = Date.now();

    return rows
      .map((row) =>
        buildConnectedMachineView({
          row,
          now,
        }),
      )
      .sort((left, right) => {
        if (left.status !== right.status) {
          return left.status === "online" ? -1 : 1;
        }
        if (left.lastSeenAt !== right.lastSeenAt) {
          return right.lastSeenAt - left.lastSeenAt;
        }
        return left.displayName.localeCompare(right.displayName);
      });
  },
});

export const getMachineRegistrationRequestForBrowser = query({
  args: getMachineRegistrationRequestForBrowserArgs,
  returns: machineRegistrationBrowserViewValidator,
  handler: async (
    ctx,
    args: GetMachineRegistrationRequestForBrowserArgs,
  ): Promise<MachineRegistrationBrowserView> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return {
        kind: "sign_in_required",
      };
    }

    const request = await ctx.db
      .query("machineRegistrationRequests")
      .withIndex("by_request_id", (q) => q.eq("requestId", args.requestId))
      .first();
    if (!request) {
      return {
        kind: "not_found",
      };
    }

    if (request.userId && request.userId !== userId) {
      return {
        kind: "not_found",
      };
    }

    return buildMachineRegistrationBrowserView({
      request,
      now: Date.now(),
    });
  },
});

export const approveMachineRegistrationRequest = mutation({
  args: approveMachineRegistrationRequestArgs,
  returns: approveMachineRegistrationRequestReturns,
  handler: async (ctx, args: ApproveMachineRegistrationRequestArgs) => {
    const userId = await getUserId(ctx);
    const request = await ctx.db
      .query("machineRegistrationRequests")
      .withIndex("by_request_id", (q) => q.eq("requestId", args.requestId))
      .first();
    if (!request) {
      throw new Error("Machine registration request not found.");
    }
    if (request.userId && request.userId !== userId) {
      throw new Error("Machine registration request not found.");
    }
    if (request.expiresAt <= Date.now()) {
      throw new Error("Machine registration request expired.");
    }

    const now = Date.now();
    await ctx.db.patch(request._id, {
      approvedAt: now,
      userId,
    });

    const existingCredential = await ctx.db
      .query("machineCredentials")
      .withIndex("by_user_machine_id", (q) =>
        q.eq("userId", userId).eq("machineId", request.machineId),
      )
      .first();

    if (existingCredential) {
      await ctx.db.patch(existingCredential._id, {
        createdAt: now,
        credentialHash: request.credentialHash,
      });
      return null;
    }

    await ctx.db.insert("machineCredentials", {
      userId,
      machineId: request.machineId,
      credentialHash: request.credentialHash,
      createdAt: now,
    });
    return null;
  },
});

export const createMachineRegistrationRequest = internalMutation({
  args: createMachineRegistrationRequestArgsValidator,
  returns: vNull(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("machineRegistrationRequests")
      .withIndex("by_request_id", (q) => q.eq("requestId", args.requestId))
      .first();
    if (existing) {
      throw new Error("Machine registration request id collision.");
    }

    await ctx.db.insert("machineRegistrationRequests", args);
    return null;
  },
});

export const validateMachineCredential = internalMutation({
  args: validateMachineCredentialArgs,
  returns: validateMachineCredentialResultValidator,
  handler: async (
    ctx,
    args: ValidateMachineCredentialArgs,
  ): Promise<ValidateMachineCredentialResult> => {
    const credential = await ctx.db
      .query("machineCredentials")
      .withIndex("by_credential_hash", (q) =>
        q.eq("credentialHash", args.credentialHash),
      )
      .first();
    if (!credential) {
      return {
        ok: false,
        reason: "not_found",
      };
    }
    if (credential.machineId !== args.machineId) {
      return {
        ok: false,
        reason: "machine_mismatch",
      };
    }

    await ctx.db.patch(credential._id, {
      lastUsedAt: args.now,
    });

    return {
      ok: true,
      userId: credential.userId,
      machineId: credential.machineId,
    };
  },
});

export const upsertHeartbeatFromConnector = internalMutation({
  args: connectorHeartbeatArgsValidator,
  returns: vNull(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("connectedMachines")
      .withIndex("by_user_machine_id", (q) =>
        q.eq("userId", args.userId).eq("machineId", args.machineId),
      )
      .first();
    const nextRow = {
      machineId: args.machineId,
      displayName: args.displayName,
      hostname: args.hostname,
      os: args.os,
      status: args.status ?? "online",
      lastSeenAt: now,
      connectorVersion: args.connectorVersion,
      capabilities: readUniqueCapabilities(args.capabilities),
      allowedRoots: readUniqueRoots(args.allowedRoots),
    } satisfies Omit<ConnectedMachineRow, "userId">;

    if (existing) {
      await ctx.db.patch(existing._id, nextRow);
      return null;
    }

    await ctx.db.insert("connectedMachines", {
      userId: args.userId,
      ...nextRow,
    });
    return null;
  },
});
