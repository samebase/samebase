import { Infer, v } from "convex/values";
import {
  CONNECTED_MACHINE_STALE_AFTER_MS,
  MACHINE_REGISTRATION_REQUEST_TTL_MS,
} from "../shared/connectedMachinePresence";

const {
  array,
  id,
  literal,
  null: vNull,
  number,
  object,
  optional,
  string,
  union,
} = v;

export {
  CONNECTED_MACHINE_STALE_AFTER_MS,
  MACHINE_REGISTRATION_REQUEST_TTL_MS,
};
export const MACHINE_REGISTRATION_BOOTSTRAP_RATE_LIMIT_MAX_REQUESTS = 10;
export const MACHINE_REGISTRATION_BOOTSTRAP_RATE_LIMIT_WINDOW_MS =
  MACHINE_REGISTRATION_REQUEST_TTL_MS;

export const connectedMachineCapabilityValidator = union(literal("presence"));
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

export const machineRegistrationRequestRowValidator = object({
  requestId: string(),
  credentialHash: string(),
  userId: optional(id("users")),
  machineId: string(),
  displayName: string(),
  hostname: string(),
  os: connectedMachineOsValidator,
  connectorVersion: string(),
  createdAt: number(),
  expiresAt: number(),
  approvedAt: optional(number()),
});
export type MachineRegistrationRequestRow = Infer<
  typeof machineRegistrationRequestRowValidator
>;

export const machineCredentialRowValidator = object({
  userId: id("users"),
  machineId: string(),
  credentialHash: string(),
  createdAt: number(),
  lastUsedAt: optional(number()),
});
export type MachineCredentialRow = Infer<typeof machineCredentialRowValidator>;

export const machineRegistrationBootstrapRateLimitRowValidator = object({
  fingerprint: string(),
  requestCount: number(),
  windowStartedAt: number(),
});
export type MachineRegistrationBootstrapRateLimitRow = Infer<
  typeof machineRegistrationBootstrapRateLimitRowValidator
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

export const createMachineRegistrationRequestArgsValidator = object({
  bootstrapFingerprint: string(),
  requestId: string(),
  credentialHash: string(),
  machineId: string(),
  displayName: string(),
  hostname: string(),
  os: connectedMachineOsValidator,
  connectorVersion: string(),
  createdAt: number(),
  expiresAt: number(),
});
export type CreateMachineRegistrationRequestArgs = Infer<
  typeof createMachineRegistrationRequestArgsValidator
>;

export const machineRegistrationBrowserViewValidator = union(
  object({
    kind: literal("sign_in_required"),
  }),
  object({
    kind: literal("not_found"),
  }),
  object({
    kind: literal("pending"),
    requestId: string(),
    machineId: string(),
    displayName: string(),
    hostname: string(),
    os: connectedMachineOsValidator,
    connectorVersion: string(),
    expiresAt: number(),
  }),
  object({
    kind: literal("approved"),
    requestId: string(),
    machineId: string(),
    displayName: string(),
    hostname: string(),
    os: connectedMachineOsValidator,
    connectorVersion: string(),
    approvedAt: number(),
  }),
  object({
    kind: literal("expired"),
    requestId: string(),
    machineId: string(),
    displayName: string(),
    hostname: string(),
    os: connectedMachineOsValidator,
    connectorVersion: string(),
    expiresAt: number(),
  }),
);
export type MachineRegistrationBrowserView = Infer<
  typeof machineRegistrationBrowserViewValidator
>;

export const validateMachineCredentialResultValidator = union(
  object({
    ok: literal(true),
    userId: id("users"),
    machineId: string(),
  }),
  object({
    ok: literal(false),
    reason: union(literal("not_found"), literal("machine_mismatch")),
  }),
);
export type ValidateMachineCredentialResult = Infer<
  typeof validateMachineCredentialResultValidator
>;

export const approveMachineRegistrationRequestReturns = vNull();
