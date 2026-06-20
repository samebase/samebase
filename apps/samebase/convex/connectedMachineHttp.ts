import { asRecord, readNumber, readString } from "./jsonUtils";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { MACHINE_REGISTRATION_REQUEST_TTL_MS } from "./connectedMachineModel";
import { sha256Hex } from "./mcp/tokens";

const MACHINE_REGISTRATION_RATE_LIMIT_ERROR =
  "Too many machine registration requests from this machine. Wait a few minutes and try again.";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function errorResponse(status: number, error: string): Response {
  return jsonResponse({ error }, status);
}

function hasJsonContentType(request: Request): boolean {
  const contentType = request.headers.get("content-type");
  return contentType?.includes("application/json") ?? false;
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const payload = await request.json();
  return asRecord(payload);
}

function readConnectedMachineOs(value: string | undefined): "linux" | "macos" | "windows" | null {
  if (value === "linux" || value === "macos" || value === "windows") {
    return value;
  }
  return null;
}

function readConnectedMachineCapabilities(
  value: unknown,
): Array<"presence" | "liveControl"> | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const capabilities: Array<"presence" | "liveControl"> = [];
  for (const entry of Array.from(new Set(value))) {
    if (entry !== "presence" && entry !== "liveControl") {
      return null;
    }
    capabilities.push(entry);
  }

  return capabilities;
}

function readConnectedMachineControlStatus(
  value: string | undefined,
): "ready" | "starting" | "unavailable" | undefined | null {
  if (value === undefined) {
    return undefined;
  }
  if (value === "ready" || value === "starting" || value === "unavailable") {
    return value;
  }
  return null;
}

function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    return null;
  }

  return value;
}

function readBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token, ...rest] = authorizationHeader.trim().split(/\s+/);
  if (scheme !== "Bearer" || !token || rest.length > 0) {
    return null;
  }

  return token;
}

/**
 * Only heartbeats that explicitly advertise the live-control capability may
 * publish a "ready" control surface. This keeps the UI and token-minting path
 * aligned with what the connector says it can actually serve.
 */
export function machineHeartbeatHasConsistentLiveControlState(args: {
  capabilities: Array<"presence" | "liveControl">;
  controlStatus: "ready" | "starting" | "unavailable" | undefined;
}): boolean {
  return args.controlStatus !== "ready" || args.capabilities.includes("liveControl");
}

/**
 * Cloudflare populates `cf-connecting-ip` for public traffic through the Convex
 * HTTP surface. We only trust that proxy-managed identity signal here and fall
 * back to a broader deployment bucket when local/dev traffic does not expose
 * it.
 */
function readBootstrapFingerprint(request: Request): string {
  const clientIp = request.headers.get("cf-connecting-ip")?.trim();
  if (typeof clientIp === "string" && clientIp.length > 0) {
    return `ip:${clientIp}`;
  }

  return "connected-machine-bootstrap-global";
}

export const createMachineRegistrationRequest = httpAction(async (ctx, request) => {
  if (!hasJsonContentType(request)) {
    return errorResponse(415, "content-type must be application/json");
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(request);
  } catch {
    return errorResponse(400, "invalid json body");
  }

  const requestId = readString(body, "requestId");
  const credentialHash = readString(body, "credentialHash");
  const machineId = readString(body, "machineId");
  const displayName = readString(body, "displayName");
  const hostname = readString(body, "hostname");
  const os = readConnectedMachineOs(readString(body, "os"));
  const connectorVersion = readString(body, "connectorVersion");

  if (
    !requestId ||
    !credentialHash ||
    !machineId ||
    !displayName ||
    !hostname ||
    !os ||
    !connectorVersion
  ) {
    return errorResponse(400, "missing machine registration fields");
  }

  const now = Date.now();
  const expiresAt = now + MACHINE_REGISTRATION_REQUEST_TTL_MS;
  try {
    await ctx.runMutation(internal.connectedMachines.createMachineRegistrationRequest, {
      bootstrapFingerprint: readBootstrapFingerprint(request),
      requestId,
      credentialHash,
      machineId,
      displayName,
      hostname,
      os,
      connectorVersion,
      createdAt: now,
      expiresAt,
    });
  } catch (error) {
    if (error instanceof Error && error.message === MACHINE_REGISTRATION_RATE_LIMIT_ERROR) {
      return errorResponse(429, error.message);
    }
    throw error;
  }

  return jsonResponse({
    expiresAt,
    requestId,
  });
});

export const publishMachineHeartbeat = httpAction(async (ctx, request) => {
  if (!hasJsonContentType(request)) {
    return errorResponse(415, "content-type must be application/json");
  }

  const bearerToken = readBearerToken(request.headers.get("authorization"));
  if (!bearerToken) {
    return errorResponse(401, "missing bearer token");
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(request);
  } catch {
    return errorResponse(400, "invalid json body");
  }

  const machineId = readString(body, "machineId");
  const displayName = readString(body, "displayName");
  const hostname = readString(body, "hostname");
  const os = readConnectedMachineOs(readString(body, "os"));
  const connectorVersion = readString(body, "connectorVersion");
  const statusValue = readString(body, "status");
  const status =
    statusValue === undefined
      ? undefined
      : statusValue === "online" || statusValue === "offline"
        ? statusValue
        : null;
  const controlStatus = readConnectedMachineControlStatus(readString(body, "controlStatus"));
  const controlStatusDetail = readString(body, "controlStatusDetail");
  const controlUrl = readString(body, "controlUrl");
  const controlUrlUpdatedAt =
    body.controlUrlUpdatedAt === undefined
      ? undefined
      : (readNumber(body, "controlUrlUpdatedAt") ?? null);
  const capabilities = readConnectedMachineCapabilities(body.capabilities);
  const allowedRoots = readStringArray(body.allowedRoots);
  const hasLiveControlPayload =
    controlStatus !== undefined ||
    controlStatusDetail !== undefined ||
    controlUrl !== undefined ||
    controlUrlUpdatedAt !== undefined;

  if (
    !machineId ||
    !displayName ||
    !hostname ||
    !os ||
    !connectorVersion ||
    status === null ||
    controlStatus === null ||
    controlUrlUpdatedAt === null ||
    capabilities === null ||
    allowedRoots === null ||
    (hasLiveControlPayload && controlStatus === undefined) ||
    (controlStatus !== undefined && controlUrlUpdatedAt === undefined) ||
    (controlStatus === "ready" && controlUrl === undefined) ||
    !machineHeartbeatHasConsistentLiveControlState({
      capabilities,
      controlStatus,
    }) ||
    (controlStatus !== undefined && controlStatus !== "ready" && controlUrl !== undefined)
  ) {
    return errorResponse(400, "missing machine heartbeat fields");
  }

  const credentialHash = await sha256Hex(bearerToken);
  const validation = await ctx.runMutation(
    internal.connectedMachines.publishHeartbeatFromConnector,
    {
      credentialHash,
      displayName,
      hostname,
      machineId,
      os,
      now: Date.now(),
      connectorVersion,
      capabilities,
      allowedRoots,
      controlStatus,
      controlStatusDetail,
      controlUrl,
      controlUrlUpdatedAt,
      status,
    },
  );
  if (!validation.ok) {
    return errorResponse(401, "invalid machine credential");
  }

  return jsonResponse({ ok: true });
});

export const introspectMachineControlToken = httpAction(async (ctx, request) => {
  if (!hasJsonContentType(request)) {
    return errorResponse(415, "content-type must be application/json");
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(request);
  } catch {
    return errorResponse(400, "invalid json body");
  }

  const machineId = readString(body, "machineId");
  const token = readString(body, "token");
  if (!machineId || !token) {
    return errorResponse(400, "missing machine control token fields");
  }

  const tokenHash = await sha256Hex(token);
  const introspection = await ctx.runMutation(
    internal.connectedMachineControl.introspectMachineControlToken,
    {
      machineId,
      now: Date.now(),
      tokenHash,
    },
  );

  if (!introspection.active) {
    return jsonResponse({
      active: false,
    });
  }

  return jsonResponse({
    active: true,
    audience: introspection.audience,
    expiresAt: introspection.expiresAt,
    machineId: introspection.machineId,
    userId: `${introspection.userId}`,
  });
});
