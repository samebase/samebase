import { type Id } from "./_generated/dataModel";
import { internalMutation, query } from "./_generated/server";
import { getUserId } from "./common";
import {
  CONNECTED_MACHINE_STALE_AFTER_MS,
  connectedMachineViewValidator,
  connectorHeartbeatArgsValidator,
  connectorThreadSyncArgsValidator,
  machineThreadSummaryViewValidator,
  type ConnectedMachineCapability,
  type ConnectedMachineStatus,
  type ConnectorMachineThreadSummary,
  type ConnectorThreadSyncArgs,
  type MachineThreadRow,
} from "./connectedMachineModel";
import { Infer, v } from "convex/values";

const { array, null: vNull, object, string, union } = v;

const getConnectedMachineArgs = object({
  machineId: string(),
});
const getConnectedMachineReturns = union(
  connectedMachineViewValidator,
  vNull(),
);

const listConnectedMachinesArgs = object({});
const listConnectedMachinesReturns = array(connectedMachineViewValidator);

const listMachineThreadsArgs = object({
  machineId: string(),
});
const listMachineThreadsReturns = array(machineThreadSummaryViewValidator);

type GetConnectedMachineArgs = Infer<typeof getConnectedMachineArgs>;
type ListMachineThreadsArgs = Infer<typeof listMachineThreadsArgs>;

function readUniqueCapabilities(
  values: ConnectedMachineCapability[],
): ConnectedMachineCapability[] {
  return Array.from(new Set(values));
}

function readUniqueRoots(values: string[]): string[] {
  return Array.from(
    new Set(
      values.map((value) => value.trim()).filter((value) => value.length),
    ),
  );
}

function buildMachineThreadKey(args: {
  provider: "codex";
  providerThreadId: string;
}): string {
  return `${args.provider}:${args.providerThreadId}`;
}

/**
 * Treat stale heartbeats as offline so the phone UI does not keep showing a
 * dead laptop as available after the connector disappears without a clean exit.
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
  machineId: string;
  displayName: string;
  hostname: string;
  os: "linux" | "macos" | "windows";
  status: ConnectedMachineStatus;
  lastSeenAt: number;
  connectorVersion: string;
  capabilities: ConnectedMachineCapability[];
  allowedRoots: string[];
}) {
  return {
    machineId: args.machineId,
    displayName: args.displayName,
    hostname: args.hostname,
    os: args.os,
    status: args.status,
    lastSeenAt: args.lastSeenAt,
    connectorVersion: args.connectorVersion,
    capabilities: args.capabilities,
    allowedRoots: args.allowedRoots,
  };
}

function normalizeIncomingThreadRow(args: {
  userId: Id<"users">;
  machineId: string;
  thread: ConnectorMachineThreadSummary;
  syncedAt: number;
}): MachineThreadRow {
  const preview = args.thread.preview.trim();
  const title = args.thread.title.trim();
  const workspaceLabel = args.thread.workspaceLabel.trim();

  return {
    userId: args.userId,
    machineId: args.machineId,
    provider: args.thread.provider,
    providerThreadId: args.thread.providerThreadId,
    projectRoot: args.thread.projectRoot,
    projectLabel: args.thread.projectLabel,
    workspaceLabel:
      workspaceLabel.length > 0 ? workspaceLabel : args.thread.projectLabel,
    branch: args.thread.branch,
    title: title.length > 0 ? title : preview,
    preview,
    updatedAt: args.thread.updatedAt,
    loaded: args.thread.loaded,
    pinned: args.thread.pinned,
    archived: args.thread.archived,
    sourceKind: args.thread.sourceKind,
    lastSyncedAt: args.syncedAt,
  };
}

/**
 * Replace a machine's current thread summary snapshot instead of incrementally
 * merging forever so deleted or archived local sessions stop lingering in the
 * cloud view after the next connector sync.
 */
function buildNextMachineThreadRows(args: {
  userId: Id<"users">;
  machineId: string;
  syncedAt: number;
  threads: ConnectorThreadSyncArgs["threads"];
}): MachineThreadRow[] {
  const rowsByKey = new Map<string, MachineThreadRow>();

  for (const thread of args.threads) {
    const row = normalizeIncomingThreadRow({
      userId: args.userId,
      machineId: args.machineId,
      thread,
      syncedAt: args.syncedAt,
    });
    rowsByKey.set(
      buildMachineThreadKey({
        provider: row.provider,
        providerThreadId: row.providerThreadId,
      }),
      row,
    );
  }

  return Array.from(rowsByKey.values());
}

export const getConnectedMachine = query({
  args: getConnectedMachineArgs,
  returns: getConnectedMachineReturns,
  handler: async (ctx, args: GetConnectedMachineArgs) => {
    const userId = await getUserId(ctx);
    const row = await ctx.db
      .query("connectedMachines")
      .withIndex("by_user_machine_id", (q) =>
        q.eq("userId", userId).eq("machineId", args.machineId),
      )
      .first();

    if (!row) {
      return null;
    }

    return buildConnectedMachineView({
      machineId: row.machineId,
      displayName: row.displayName,
      hostname: row.hostname,
      os: row.os,
      status: resolveConnectedMachineStatus({
        lastSeenAt: row.lastSeenAt,
        status: row.status,
        now: Date.now(),
      }),
      lastSeenAt: row.lastSeenAt,
      connectorVersion: row.connectorVersion,
      capabilities: row.capabilities,
      allowedRoots: row.allowedRoots,
    });
  },
});

export const listConnectedMachines = query({
  args: listConnectedMachinesArgs,
  returns: listConnectedMachinesReturns,
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    const rows = await ctx.db
      .query("connectedMachines")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const now = Date.now();

    return rows
      .map((row) =>
        buildConnectedMachineView({
          machineId: row.machineId,
          displayName: row.displayName,
          hostname: row.hostname,
          os: row.os,
          status: resolveConnectedMachineStatus({
            lastSeenAt: row.lastSeenAt,
            status: row.status,
            now,
          }),
          lastSeenAt: row.lastSeenAt,
          connectorVersion: row.connectorVersion,
          capabilities: row.capabilities,
          allowedRoots: row.allowedRoots,
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

export const listMachineThreads = query({
  args: listMachineThreadsArgs,
  returns: listMachineThreadsReturns,
  handler: async (ctx, args: ListMachineThreadsArgs) => {
    const userId = await getUserId(ctx);
    const rows = await ctx.db
      .query("machineThreads")
      .withIndex("by_user_and_machine", (q) =>
        q.eq("userId", userId).eq("machineId", args.machineId),
      )
      .collect();

    return rows
      .map((row) => ({
        machineId: row.machineId,
        provider: row.provider,
        providerThreadId: row.providerThreadId,
        projectRoot: row.projectRoot,
        projectLabel: row.projectLabel,
        workspaceLabel: row.workspaceLabel,
        branch: row.branch,
        title: row.title,
        preview: row.preview,
        updatedAt: row.updatedAt,
        loaded: row.loaded,
        pinned: row.pinned,
        archived: row.archived,
        sourceKind: row.sourceKind,
        lastSyncedAt: row.lastSyncedAt,
      }))
      .sort((left, right) => {
        if (left.pinned !== right.pinned) {
          return left.pinned ? -1 : 1;
        }
        if (left.projectLabel !== right.projectLabel) {
          return left.projectLabel.localeCompare(right.projectLabel);
        }
        if (left.workspaceLabel !== right.workspaceLabel) {
          return left.workspaceLabel.localeCompare(right.workspaceLabel);
        }
        if (left.updatedAt !== right.updatedAt) {
          return right.updatedAt - left.updatedAt;
        }
        return left.title.localeCompare(right.title);
      });
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
    };

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

export const replaceThreadSummariesFromConnector = internalMutation({
  args: connectorThreadSyncArgsValidator,
  returns: vNull(),
  handler: async (ctx, args) => {
    const machine = await ctx.db
      .query("connectedMachines")
      .withIndex("by_user_machine_id", (q) =>
        q.eq("userId", args.userId).eq("machineId", args.machineId),
      )
      .first();
    if (!machine) {
      throw new Error(
        `Connected machine ${args.machineId} is missing a heartbeat row.`,
      );
    }

    const syncedAt = Date.now();
    const nextRows = buildNextMachineThreadRows({
      userId: args.userId,
      machineId: args.machineId,
      syncedAt,
      threads: args.threads,
    });
    const existingRows = await ctx.db
      .query("machineThreads")
      .withIndex("by_user_and_machine", (q) =>
        q.eq("userId", args.userId).eq("machineId", args.machineId),
      )
      .collect();
    const existingRowsByKey = new Map(
      existingRows.map((row) => [
        buildMachineThreadKey({
          provider: row.provider,
          providerThreadId: row.providerThreadId,
        }),
        row,
      ]),
    );
    const nextKeys = new Set<string>();

    for (const row of nextRows) {
      const key = buildMachineThreadKey({
        provider: row.provider,
        providerThreadId: row.providerThreadId,
      });
      nextKeys.add(key);

      const existing = existingRowsByKey.get(key);
      if (existing) {
        await ctx.db.patch(existing._id, row);
        continue;
      }

      await ctx.db.insert("machineThreads", row);
    }

    for (const row of existingRows) {
      const key = buildMachineThreadKey({
        provider: row.provider,
        providerThreadId: row.providerThreadId,
      });
      if (!nextKeys.has(key)) {
        await ctx.db.delete(row._id);
      }
    }

    return null;
  },
});
