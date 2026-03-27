import { Infer, v } from "convex/values";

const { array, boolean, id, literal, number, object, optional, string, union } =
  v;

export const CONNECTED_MACHINE_STALE_AFTER_MS = 45_000;

export const connectedMachineCapabilityValidator = union(
  literal("catalog"),
  literal("threads"),
);
export type ConnectedMachineCapability = Infer<
  typeof connectedMachineCapabilityValidator
>;

export const connectedMachineStatusValidator = union(
  literal("online"),
  literal("offline"),
);
export type ConnectedMachineStatus = Infer<
  typeof connectedMachineStatusValidator
>;

export const connectedMachineOsValidator = union(
  literal("linux"),
  literal("macos"),
  literal("windows"),
);
export type ConnectedMachineOs = Infer<typeof connectedMachineOsValidator>;

export const connectedMachineProviderValidator = literal("codex");
export type ConnectedMachineProvider = Infer<
  typeof connectedMachineProviderValidator
>;

export const connectedMachineRowValidator = object({
  userId: id("users"),
  machineId: string(),
  displayName: string(),
  hostname: string(),
  os: connectedMachineOsValidator,
  status: connectedMachineStatusValidator,
  lastSeenAt: number(),
  connectorVersion: string(),
  capabilities: array(connectedMachineCapabilityValidator),
  allowedRoots: array(string()),
});
export type ConnectedMachineRow = Infer<typeof connectedMachineRowValidator>;

export const connectedMachineViewValidator = object({
  machineId: string(),
  displayName: string(),
  hostname: string(),
  os: connectedMachineOsValidator,
  status: connectedMachineStatusValidator,
  lastSeenAt: number(),
  connectorVersion: string(),
  capabilities: array(connectedMachineCapabilityValidator),
  allowedRoots: array(string()),
});
export type ConnectedMachineView = Infer<typeof connectedMachineViewValidator>;

export const machineThreadRowValidator = object({
  userId: id("users"),
  machineId: string(),
  provider: connectedMachineProviderValidator,
  providerThreadId: string(),
  projectRoot: string(),
  projectLabel: string(),
  workspaceLabel: string(),
  branch: string(),
  title: string(),
  preview: string(),
  updatedAt: number(),
  loaded: boolean(),
  pinned: boolean(),
  archived: boolean(),
  sourceKind: string(),
  lastSyncedAt: number(),
});
export type MachineThreadRow = Infer<typeof machineThreadRowValidator>;

export const machineThreadSummaryViewValidator = object({
  machineId: string(),
  provider: connectedMachineProviderValidator,
  providerThreadId: string(),
  projectRoot: string(),
  projectLabel: string(),
  workspaceLabel: string(),
  branch: string(),
  title: string(),
  preview: string(),
  updatedAt: number(),
  loaded: boolean(),
  pinned: boolean(),
  archived: boolean(),
  sourceKind: string(),
  lastSyncedAt: number(),
});
export type MachineThreadSummaryView = Infer<
  typeof machineThreadSummaryViewValidator
>;

export const connectorHeartbeatArgsValidator = object({
  userId: id("users"),
  machineId: string(),
  displayName: string(),
  hostname: string(),
  os: connectedMachineOsValidator,
  status: optional(connectedMachineStatusValidator),
  connectorVersion: string(),
  capabilities: array(connectedMachineCapabilityValidator),
  allowedRoots: array(string()),
});
export type ConnectorHeartbeatArgs = Infer<
  typeof connectorHeartbeatArgsValidator
>;

export const connectorMachineThreadSummaryValidator = object({
  provider: connectedMachineProviderValidator,
  providerThreadId: string(),
  projectRoot: string(),
  projectLabel: string(),
  workspaceLabel: string(),
  branch: string(),
  title: string(),
  preview: string(),
  updatedAt: number(),
  loaded: boolean(),
  pinned: boolean(),
  archived: boolean(),
  sourceKind: string(),
});
export type ConnectorMachineThreadSummary = Infer<
  typeof connectorMachineThreadSummaryValidator
>;

export const connectorThreadSyncArgsValidator = object({
  userId: id("users"),
  machineId: string(),
  threads: array(connectorMachineThreadSummaryValidator),
});
export type ConnectorThreadSyncArgs = Infer<
  typeof connectorThreadSyncArgsValidator
>;
