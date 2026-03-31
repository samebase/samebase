import { getAuthUserId } from "@convex-dev/auth/server";
import { Infer, v } from "convex/values";
import { resolveMachineRegistrationState } from "../shared/connectedMachinePresence";
import { internalMutation, mutation, query } from "./_generated/server";
import {
  approveMachineRegistrationRequestReturns,
  connectedMachineViewValidator,
  createMachineRegistrationRequestArgsValidator,
  MACHINE_REGISTRATION_BOOTSTRAP_RATE_LIMIT_MAX_REQUESTS,
  MACHINE_REGISTRATION_BOOTSTRAP_RATE_LIMIT_WINDOW_MS,
  machineRegistrationBrowserViewValidator,
  publishHeartbeatFromConnectorArgsValidator,
  type ConnectedMachineCapability,
  type ConnectedMachineRow,
  type MachineRegistrationBrowserView,
  type MachineRegistrationRequestRow,
  type PublishHeartbeatFromConnectorArgs,
  type ValidateMachineCredentialResult,
  validateMachineCredentialResultValidator,
} from "./connectedMachineModel";
import { getUserId } from "./common";

const { array, null: vNull, object, string } = v;

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

function buildConnectedMachineView(args: { row: ConnectedMachineRow }) {
  return {
    machineId: args.row.machineId,
    displayName: args.row.displayName,
    hostname: args.row.hostname,
    os: args.row.os,
    status: args.row.status,
    lastSeenAt: args.row.lastSeenAt,
    connectorVersion: args.row.connectorVersion,
    capabilities: args.row.capabilities,
    allowedRoots: args.row.allowedRoots,
  };
}

function buildMachineRegistrationBrowserView(args: {
  request: MachineRegistrationRequestRow;
  serverNow: number;
}): MachineRegistrationBrowserView {
  const commonFields = {
    requestId: args.request.requestId,
    machineId: args.request.machineId,
    displayName: args.request.displayName,
    hostname: args.request.hostname,
    os: args.request.os,
    connectorVersion: args.request.connectorVersion,
  };
  if (typeof args.request.approvedAt === "number") {
    return {
      kind: "approved",
      ...commonFields,
      approvedAt: args.request.approvedAt,
    };
  }

  return {
    kind: "pending",
    ...commonFields,
    expiresAt: args.request.expiresAt,
    serverNow: args.serverNow,
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

    return rows
      .map((row) => buildConnectedMachineView({ row }))
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
    const now = Date.now();
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
      serverNow: now,
    });
  },
});

export const approveMachineRegistrationRequest = mutation({
  args: approveMachineRegistrationRequestArgs,
  returns: approveMachineRegistrationRequestReturns,
  handler: async (ctx, args: ApproveMachineRegistrationRequestArgs) => {
    const userId = await getUserId(ctx);
    const now = Date.now();
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
    if (
      resolveMachineRegistrationState({
        approvedAt: request.approvedAt,
        expiresAt: request.expiresAt,
        now,
      }) === "expired"
    ) {
      throw new Error("Machine registration request expired.");
    }

    const newerRequest = (
      await ctx.db
        .query("machineRegistrationRequests")
        .withIndex("by_machine_id", (q) => q.eq("machineId", request.machineId))
        .collect()
    ).find((candidate) => candidate.createdAt > request.createdAt);
    if (newerRequest) {
      throw new Error(
        "A newer machine registration request already exists for this machine. Approve the latest browser handoff instead.",
      );
    }

    await ctx.db.patch(request._id, {
      approvedAt: now,
      userId,
    });

    const existingMachinePresenceRows = await ctx.db
      .query("connectedMachines")
      .withIndex("by_machine_id", (q) => q.eq("machineId", request.machineId))
      .collect();

    // A machine can change owners over time. Drop any stale presence rows before
    // minting the next credential so the browser never shows ghost ownership.
    for (const existingMachinePresenceRow of existingMachinePresenceRows) {
      await ctx.db.delete(existingMachinePresenceRow._id);
    }

    const existingMachineCredentials = await ctx.db
      .query("machineCredentials")
      .withIndex("by_machine_id", (q) => q.eq("machineId", request.machineId))
      .collect();

    // Keep exactly one live credential per machine so an older approval cannot
    // leave prior bearer secrets valid after ownership changes.
    for (const existingMachineCredential of existingMachineCredentials) {
      await ctx.db.delete(existingMachineCredential._id);
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
    const requestRow = {
      requestId: args.requestId,
      credentialHash: args.credentialHash,
      machineId: args.machineId,
      displayName: args.displayName,
      hostname: args.hostname,
      os: args.os,
      connectorVersion: args.connectorVersion,
      createdAt: args.createdAt,
      expiresAt: args.expiresAt,
    } satisfies MachineRegistrationRequestRow;
    const existingRateLimit = await ctx.db
      .query("machineRegistrationBootstrapRateLimits")
      .withIndex("by_fingerprint", (q) =>
        q.eq("fingerprint", args.bootstrapFingerprint),
      )
      .first();
    const existingWindowStillActive =
      typeof existingRateLimit?.windowStartedAt === "number" &&
      existingRateLimit.windowStartedAt +
        MACHINE_REGISTRATION_BOOTSTRAP_RATE_LIMIT_WINDOW_MS >
        args.createdAt;
    const existingRequestCount = existingRateLimit?.requestCount ?? 0;
    if (
      existingWindowStillActive &&
      existingRequestCount >=
        MACHINE_REGISTRATION_BOOTSTRAP_RATE_LIMIT_MAX_REQUESTS
    ) {
      throw new Error(
        "Too many machine registration requests from this machine. Wait a few minutes and try again.",
      );
    }

    const existing = await ctx.db
      .query("machineRegistrationRequests")
      .withIndex("by_request_id", (q) => q.eq("requestId", args.requestId))
      .first();
    if (existing) {
      throw new Error("Machine registration request id collision.");
    }

    const machineRequests = await ctx.db
      .query("machineRegistrationRequests")
      .withIndex("by_machine_id", (q) => q.eq("machineId", args.machineId))
      .collect();

    if (existingRateLimit) {
      await ctx.db.patch(existingRateLimit._id, {
        requestCount: existingWindowStillActive
          ? existingRateLimit.requestCount + 1
          : 1,
        windowStartedAt: existingWindowStillActive
          ? existingRateLimit.windowStartedAt
          : args.createdAt,
      });
    } else {
      await ctx.db.insert("machineRegistrationBootstrapRateLimits", {
        fingerprint: args.bootstrapFingerprint,
        requestCount: 1,
        windowStartedAt: args.createdAt,
      });
    }

    for (const machineRequest of machineRequests) {
      if (typeof machineRequest.approvedAt === "number") {
        continue;
      }

      await ctx.db.patch(machineRequest._id, {
        expiresAt: args.createdAt,
      });
    }

    await ctx.db.insert("machineRegistrationRequests", requestRow);
    return null;
  },
});

export const publishHeartbeatFromConnector = internalMutation({
  args: publishHeartbeatFromConnectorArgsValidator,
  returns: validateMachineCredentialResultValidator,
  handler: async (
    ctx,
    args: PublishHeartbeatFromConnectorArgs,
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

    const existing = await ctx.db
      .query("connectedMachines")
      .withIndex("by_user_machine_id", (q) =>
        q.eq("userId", credential.userId).eq("machineId", args.machineId),
      )
      .first();
    const nextRow = {
      machineId: args.machineId,
      displayName: args.displayName,
      hostname: args.hostname,
      os: args.os,
      status: args.status ?? "online",
      lastSeenAt: args.now,
      connectorVersion: args.connectorVersion,
      capabilities: readUniqueCapabilities(args.capabilities),
      allowedRoots: readUniqueRoots(args.allowedRoots),
    } satisfies Omit<ConnectedMachineRow, "userId">;

    if (existing) {
      await ctx.db.patch(existing._id, nextRow);
      return {
        ok: true,
        userId: credential.userId,
        machineId: credential.machineId,
      };
    }

    await ctx.db.insert("connectedMachines", {
      userId: credential.userId,
      ...nextRow,
    });
    return {
      ok: true,
      userId: credential.userId,
      machineId: credential.machineId,
    };
  },
});
