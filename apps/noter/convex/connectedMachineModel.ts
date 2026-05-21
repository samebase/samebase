import { Infer, v } from "convex/values";
import {
  CONNECTED_MACHINE_STALE_AFTER_MS,
  MACHINE_REGISTRATION_REQUEST_TTL_MS,
} from "../shared/connectedMachinePresence";

const { array, boolean, id, literal, null: vNull, number, object, optional, string, union } = v;

export { CONNECTED_MACHINE_STALE_AFTER_MS, MACHINE_REGISTRATION_REQUEST_TTL_MS };
export const MACHINE_REGISTRATION_BOOTSTRAP_RATE_LIMIT_MAX_REQUESTS = 10;
export const MACHINE_REGISTRATION_BOOTSTRAP_RATE_LIMIT_WINDOW_MS =
  MACHINE_REGISTRATION_REQUEST_TTL_MS;
export const MACHINE_CONTROL_TOKEN_TTL_MS = 15 * 60 * 1000;

export const vConnectedMachineCapability = union(literal("presence"), literal("liveControl"));
export type ConnectedMachineCapability = Infer<typeof vConnectedMachineCapability>;

export const vConnectedMachineStatus = union(literal("online"), literal("offline"));
export type ConnectedMachineStatus = Infer<typeof vConnectedMachineStatus>;

export const vConnectedMachineControlStatus = union(
  literal("unavailable"),
  literal("starting"),
  literal("ready"),
);
export type ConnectedMachineControlStatus = Infer<typeof vConnectedMachineControlStatus>;

export const vConnectedMachineOs = union(literal("linux"), literal("macos"), literal("windows"));
export type ConnectedMachineOs = Infer<typeof vConnectedMachineOs>;

const connectedMachineLiveControlFields = {
  controlStatus: optional(vConnectedMachineControlStatus),
  controlStatusDetail: optional(string()),
  controlUrl: optional(string()),
  controlUrlUpdatedAt: optional(number()),
};

export const vConnectedMachineRow = object({
  userId: id("users"),
  machineId: string(),
  displayName: string(),
  hostname: string(),
  // Older rows may not have a persisted sidebar order until a heartbeat writes
  // one, so the stored shape keeps this optional during the migration window.
  sidebarOrder: optional(number()),
  os: vConnectedMachineOs,
  status: vConnectedMachineStatus,
  lastSeenAt: number(),
  connectorVersion: string(),
  capabilities: array(vConnectedMachineCapability),
  allowedRoots: array(string()),
  ...connectedMachineLiveControlFields,
});
export type ConnectedMachineRow = Infer<typeof vConnectedMachineRow>;

export const vConnectedMachineView = object({
  machineId: string(),
  displayName: string(),
  hostname: string(),
  // Browser consumers should always see one effective order value even when the
  // stored row still relies on the deterministic creation-time fallback.
  sidebarOrder: number(),
  os: vConnectedMachineOs,
  status: vConnectedMachineStatus,
  lastSeenAt: number(),
  connectorVersion: string(),
  capabilities: array(vConnectedMachineCapability),
  allowedRoots: array(string()),
  ...connectedMachineLiveControlFields,
});
export type ConnectedMachineView = Infer<typeof vConnectedMachineView>;

export const vMachineRegistrationRequestRow = object({
  requestId: string(),
  credentialHash: string(),
  userId: optional(id("users")),
  machineId: string(),
  displayName: string(),
  hostname: string(),
  os: vConnectedMachineOs,
  connectorVersion: string(),
  createdAt: number(),
  expiresAt: number(),
  approvedAt: optional(number()),
});
export type MachineRegistrationRequestRow = Infer<typeof vMachineRegistrationRequestRow>;

export const vMachineCredentialRow = object({
  userId: id("users"),
  machineId: string(),
  credentialHash: string(),
  createdAt: number(),
  lastUsedAt: optional(number()),
});
export type MachineCredentialRow = Infer<typeof vMachineCredentialRow>;

export const vMachineControlTokenRow = object({
  userId: id("users"),
  machineId: string(),
  tokenHash: string(),
  createdAt: number(),
  expiresAt: number(),
  lastUsedAt: optional(number()),
  revokedAt: optional(number()),
});
export type MachineControlTokenRow = Infer<typeof vMachineControlTokenRow>;

export const vMachineRegistrationBootstrapRateLimitRow = object({
  fingerprint: string(),
  requestCount: number(),
  windowStartedAt: number(),
});
export type MachineRegistrationBootstrapRateLimitRow = Infer<
  typeof vMachineRegistrationBootstrapRateLimitRow
>;

export const vPublishHeartbeatFromConnectorArgs = object({
  credentialHash: string(),
  now: number(),
  machineId: string(),
  displayName: string(),
  hostname: string(),
  os: vConnectedMachineOs,
  status: optional(vConnectedMachineStatus),
  connectorVersion: string(),
  capabilities: array(vConnectedMachineCapability),
  allowedRoots: array(string()),
  ...connectedMachineLiveControlFields,
});
export type PublishHeartbeatFromConnectorArgs = Infer<typeof vPublishHeartbeatFromConnectorArgs>;

export const vCreateMachineRegistrationRequestArgs = object({
  bootstrapFingerprint: string(),
  requestId: string(),
  credentialHash: string(),
  machineId: string(),
  displayName: string(),
  hostname: string(),
  os: vConnectedMachineOs,
  connectorVersion: string(),
  createdAt: number(),
  expiresAt: number(),
});
export type CreateMachineRegistrationRequestArgs = Infer<
  typeof vCreateMachineRegistrationRequestArgs
>;

export const vMachineRegistrationBrowserView = union(
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
    os: vConnectedMachineOs,
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
    os: vConnectedMachineOs,
    connectorVersion: string(),
    approvedAt: number(),
  }),
  object({
    kind: literal("expired"),
    requestId: string(),
    machineId: string(),
    displayName: string(),
    hostname: string(),
    os: vConnectedMachineOs,
    connectorVersion: string(),
    expiresAt: number(),
  }),
);
export type MachineRegistrationBrowserView = Infer<typeof vMachineRegistrationBrowserView>;

export const vValidateMachineCredentialResult = union(
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
export type ValidateMachineCredentialResult = Infer<typeof vValidateMachineCredentialResult>;

export const vApproveMachineRegistrationRequestReturns = vNull();

export const vIssueMachineControlTokenArgs = object({
  machineId: string(),
});
export type IssueMachineControlTokenArgs = Infer<typeof vIssueMachineControlTokenArgs>;

export const vIssueMachineControlTokenReturns = object({
  expiresAt: number(),
  token: string(),
});
export type IssueMachineControlTokenResult = Infer<typeof vIssueMachineControlTokenReturns>;

export const vIntrospectMachineControlTokenArgs = object({
  machineId: string(),
  now: number(),
  tokenHash: string(),
});
export type IntrospectMachineControlTokenArgs = Infer<typeof vIntrospectMachineControlTokenArgs>;

export const vMachineControlTokenIntrospectionResult = union(
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
  typeof vMachineControlTokenIntrospectionResult
>;

export const vMachineControlTokenIntrospectionHttpResponse = object({
  active: boolean(),
  audience: optional(literal("machine-control")),
  expiresAt: optional(number()),
  machineId: optional(string()),
  userId: optional(string()),
});
export type MachineControlTokenIntrospectionHttpResponse = Infer<
  typeof vMachineControlTokenIntrospectionHttpResponse
>;
