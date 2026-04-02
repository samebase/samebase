import { Infer, v } from "convex/values";
import {
  CONNECTED_MACHINE_STALE_AFTER_MS,
  MACHINE_REGISTRATION_REQUEST_TTL_MS,
} from "../shared/connectedMachinePresence";

const {
  array,
  boolean,
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
export const MACHINE_CONTROL_TOKEN_TTL_MS = 15 * 60 * 1000;

export const connectedMachineCapabilityValidator = union(
  literal("presence"),
  literal("liveControl"),
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

export const connectedMachineControlStatusValidator = union(
  literal("unavailable"),
  literal("starting"),
  literal("ready"),
);
export type ConnectedMachineControlStatus = Infer<
  typeof connectedMachineControlStatusValidator
>;

export const connectedMachineOsValidator = union(
  literal("linux"),
  literal("macos"),
  literal("windows"),
);
export type ConnectedMachineOs = Infer<typeof connectedMachineOsValidator>;

const connectedMachineLiveControlFields = {
  controlStatus: optional(connectedMachineControlStatusValidator),
  controlStatusDetail: optional(string()),
  controlUrl: optional(string()),
  controlUrlUpdatedAt: optional(number()),
};

export const connectedMachineRowValidator = object({
  userId: id("users"),
  machineId: string(),
  displayName: string(),
  hostname: string(),
  sidebarOrder: optional(number()),
  os: connectedMachineOsValidator,
  status: connectedMachineStatusValidator,
  lastSeenAt: number(),
  connectorVersion: string(),
  capabilities: array(connectedMachineCapabilityValidator),
  allowedRoots: array(string()),
  ...connectedMachineLiveControlFields,
});
export type ConnectedMachineRow = Infer<typeof connectedMachineRowValidator>;

export const connectedMachineViewValidator = object({
  machineId: string(),
  displayName: string(),
  hostname: string(),
  sidebarOrder: number(),
  os: connectedMachineOsValidator,
  status: connectedMachineStatusValidator,
  lastSeenAt: number(),
  connectorVersion: string(),
  capabilities: array(connectedMachineCapabilityValidator),
  allowedRoots: array(string()),
  ...connectedMachineLiveControlFields,
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

export const machineControlTokenRowValidator = object({
  userId: id("users"),
  machineId: string(),
  tokenHash: string(),
  createdAt: number(),
  expiresAt: number(),
  lastUsedAt: optional(number()),
  revokedAt: optional(number()),
});
export type MachineControlTokenRow = Infer<
  typeof machineControlTokenRowValidator
>;

export const machineRegistrationBootstrapRateLimitRowValidator = object({
  fingerprint: string(),
  requestCount: number(),
  windowStartedAt: number(),
});
export type MachineRegistrationBootstrapRateLimitRow = Infer<
  typeof machineRegistrationBootstrapRateLimitRowValidator
>;

export const publishHeartbeatFromConnectorArgsValidator = object({
  credentialHash: string(),
  now: number(),
  machineId: string(),
  displayName: string(),
  hostname: string(),
  os: connectedMachineOsValidator,
  status: optional(connectedMachineStatusValidator),
  connectorVersion: string(),
  capabilities: array(connectedMachineCapabilityValidator),
  allowedRoots: array(string()),
  ...connectedMachineLiveControlFields,
});
export type PublishHeartbeatFromConnectorArgs = Infer<
  typeof publishHeartbeatFromConnectorArgsValidator
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
    serverNow: number(),
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

export const issueMachineControlTokenArgsValidator = object({
  machineId: string(),
});
export type IssueMachineControlTokenArgs = Infer<
  typeof issueMachineControlTokenArgsValidator
>;

export const issueMachineControlTokenReturns = object({
  expiresAt: number(),
  token: string(),
});
export type IssueMachineControlTokenResult = Infer<
  typeof issueMachineControlTokenReturns
>;

export const introspectMachineControlTokenArgsValidator = object({
  machineId: string(),
  now: number(),
  tokenHash: string(),
});
export type IntrospectMachineControlTokenArgs = Infer<
  typeof introspectMachineControlTokenArgsValidator
>;

export const machineControlTokenIntrospectionResultValidator = union(
  object({
    active: literal(true),
    audience: literal("machine-control"),
    expiresAt: number(),
    machineId: string(),
    userId: id("users"),
  }),
  object({
    active: literal(false),
  }),
);
export type MachineControlTokenIntrospectionResult = Infer<
  typeof machineControlTokenIntrospectionResultValidator
>;

export const machineControlTokenIntrospectionHttpResponseValidator = object({
  active: boolean(),
  audience: optional(literal("machine-control")),
  expiresAt: optional(number()),
  machineId: optional(string()),
  userId: optional(string()),
});
export type MachineControlTokenIntrospectionHttpResponse = Infer<
  typeof machineControlTokenIntrospectionHttpResponseValidator
>;
