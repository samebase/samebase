import { Infer, v } from "convex/values";
import { resolveMachineRegistrationState } from "../shared/connectedMachinePresence";
import {
  compareConnectedMachineSidebarOrder,
  readConnectedMachineSidebarOrder,
} from "../shared/connectedMachineOrdering";
import type { Doc } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { mutation, query } from "./functions";
import {
  vApproveMachineRegistrationRequestReturns,
  vConnectedMachineView,
  vCreateMachineRegistrationRequestArgs,
  MACHINE_REGISTRATION_BOOTSTRAP_RATE_LIMIT_MAX_REQUESTS,
  MACHINE_REGISTRATION_BOOTSTRAP_RATE_LIMIT_WINDOW_MS,
  vMachineRegistrationBrowserView,
  vPublishHeartbeatFromConnectorArgs,
  type ConnectedMachineCapability,
  type ConnectedMachineRow,
  type MachineRegistrationBrowserView,
  type MachineRegistrationRequestRow,
  type PublishHeartbeatFromConnectorArgs,
  type ValidateMachineCredentialResult,
  vValidateMachineCredentialResult,
} from "./connectedMachineModel";

const { array, null: vNull, object, string } = v;
type ConnectedMachineStoredRow = Doc<"connectedMachines">;

const listConnectedMachinesArgs = object({});
const listConnectedMachinesReturns = array(vConnectedMachineView);

const getMachineRegistrationRequestForBrowserArgs = object({
  requestId: string(),
});
type GetMachineRegistrationRequestForBrowserArgs = Infer<
  typeof getMachineRegistrationRequestForBrowserArgs
>;

const approveMachineRegistrationRequestArgs = object({
  requestId: string(),
});
type ApproveMachineRegistrationRequestArgs = Infer<typeof approveMachineRegistrationRequestArgs>;

function readUniqueCapabilities(
  values: ConnectedMachineCapability[],
): ConnectedMachineCapability[] {
  return Array.from(new Set(values));
}

function readUniqueRoots(values: string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter((value) => value.length > 0)),
  );
}

function buildConnectedMachineView(args: { row: ConnectedMachineStoredRow }) {
  return {
    machineId: args.row.machineId,
    displayName: args.row.displayName,
    hostname: args.row.hostname,
    sidebarOrder: readConnectedMachineSidebarOrder(args.row),
    os: args.row.os,
    status: args.row.status,
    lastSeenAt: args.row.lastSeenAt,
    connectorVersion: args.row.connectorVersion,
    capabilities: args.row.capabilities,
    allowedRoots: args.row.allowedRoots,
    controlStatus: args.row.controlStatus,
    controlStatusDetail: args.row.controlStatusDetail,
    controlUrl: args.row.controlUrl,
    controlUrlUpdatedAt: args.row.controlUrlUpdatedAt,
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

  if (args.request.expiresAt < args.serverNow) {
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
    serverNow: args.serverNow,
  };
}

export const listConnectedMachines = query({
  access: "access_machines",
  args: listConnectedMachinesArgs,
  returns: listConnectedMachinesReturns,
  handler: async (ctx) => {
    const userId = ctx.viewer.userId;
    const rows = await ctx.db
      .query("connectedMachines")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // Presence heartbeats update `lastSeenAt` frequently, so using recency here
    // would reshuffle the sidebar while the user is looking at it.
    return rows
      .sort(compareConnectedMachineSidebarOrder)
      .map((row) => buildConnectedMachineView({ row }));
  },
});

export const getMachineRegistrationRequestForBrowser = query({
  access: "access_machines",
  args: getMachineRegistrationRequestForBrowserArgs,
  returns: vMachineRegistrationBrowserView,
  handler: async (
    ctx,
    args: GetMachineRegistrationRequestForBrowserArgs,
  ): Promise<MachineRegistrationBrowserView> => {
    const now = Date.now();
    const userId = ctx.viewer.userId;

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
  access: "access_machines",
  args: approveMachineRegistrationRequestArgs,
  returns: vApproveMachineRegistrationRequestReturns,
  handler: async (ctx, args: ApproveMachineRegistrationRequestArgs) => {
    const userId = ctx.viewer.userId;
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
  args: vCreateMachineRegistrationRequestArgs,
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
      .query("machineRegistrationRateLimits")
      .withIndex("by_fingerprint", (q) => q.eq("fingerprint", args.bootstrapFingerprint))
      .first();
    const existingWindowStillActive =
      typeof existingRateLimit?.windowStartedAt === "number" &&
      existingRateLimit.windowStartedAt + MACHINE_REGISTRATION_BOOTSTRAP_RATE_LIMIT_WINDOW_MS >
        args.createdAt;
    const existingRequestCount = existingRateLimit?.requestCount ?? 0;
    if (
      existingWindowStillActive &&
      existingRequestCount >= MACHINE_REGISTRATION_BOOTSTRAP_RATE_LIMIT_MAX_REQUESTS
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
        requestCount: existingWindowStillActive ? existingRateLimit.requestCount + 1 : 1,
        windowStartedAt: existingWindowStillActive
          ? existingRateLimit.windowStartedAt
          : args.createdAt,
      });
    } else {
      await ctx.db.insert("machineRegistrationRateLimits", {
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
  args: vPublishHeartbeatFromConnectorArgs,
  returns: vValidateMachineCredentialResult,
  handler: async (
    ctx,
    args: PublishHeartbeatFromConnectorArgs,
  ): Promise<ValidateMachineCredentialResult> => {
    const credential = await ctx.db
      .query("machineCredentials")
      .withIndex("by_credential_hash", (q) => q.eq("credentialHash", args.credentialHash))
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

    const user = await ctx.db.get(credential.userId);
    if (!user || user.accountDeletion) {
      return {
        ok: false,
        reason: "not_found",
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
      sidebarOrder: existing ? readConnectedMachineSidebarOrder(existing) : args.now,
      os: args.os,
      status: args.status ?? "online",
      lastSeenAt: args.now,
      connectorVersion: args.connectorVersion,
      capabilities: readUniqueCapabilities(args.capabilities),
      allowedRoots: readUniqueRoots(args.allowedRoots),
      controlStatus: args.controlStatus,
      controlStatusDetail: args.controlStatusDetail,
      controlUrl: args.controlUrl,
      controlUrlUpdatedAt: args.controlUrlUpdatedAt,
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
