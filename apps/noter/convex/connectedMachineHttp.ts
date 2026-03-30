import { asRecord, readString } from "./jsonUtils";
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

async function readJsonBody(
  request: Request,
): Promise<Record<string, unknown>> {
  const payload = await request.json();
  return asRecord(payload);
}

function readConnectedMachineOs(
  value: string | undefined,
): "linux" | "macos" | "windows" | null {
  if (value === "linux" || value === "macos" || value === "windows") {
    return value;
  }
  return null;
}

function readConnectedMachineCapabilities(
  value: unknown,
): Array<"presence"> | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const capabilities: Array<"presence"> = [];
  for (const entry of Array.from(new Set(value))) {
    if (entry !== "presence") {
      return null;
    }
    capabilities.push(entry);
  }

  return capabilities;
}

function readStringArray(value: unknown): string[] | null {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string")
  ) {
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
 * This HTTP action does not currently have a trusted caller identity surface,
 * so a deployment-global window is safer than trusting spoofable forwarded-IP
 * headers from arbitrary clients.
 */
function readBootstrapFingerprint(): string {
  return "connected-machine-bootstrap-global";
}

export const createMachineRegistrationRequest = httpAction(
  async (ctx, request) => {
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
      await ctx.runMutation(
        internal.connectedMachines.createMachineRegistrationRequest,
        {
          bootstrapFingerprint: readBootstrapFingerprint(),
          requestId,
          credentialHash,
          machineId,
          displayName,
          hostname,
          os,
          connectorVersion,
          createdAt: now,
          expiresAt,
        },
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === MACHINE_REGISTRATION_RATE_LIMIT_ERROR
      ) {
        return errorResponse(429, error.message);
      }
      throw error;
    }

    return jsonResponse({
      expiresAt,
      requestId,
    });
  },
);

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
  const capabilities = readConnectedMachineCapabilities(body.capabilities);
  const allowedRoots = readStringArray(body.allowedRoots);

  if (
    !machineId ||
    !displayName ||
    !hostname ||
    !os ||
    !connectorVersion ||
    status === null ||
    capabilities === null ||
    allowedRoots === null
  ) {
    return errorResponse(400, "missing machine heartbeat fields");
  }

  const credentialHash = await sha256Hex(bearerToken);
  const validation = await ctx.runMutation(
    internal.connectedMachines.validateMachineCredential,
    {
      credentialHash,
      machineId,
      now: Date.now(),
    },
  );
  if (!validation.ok) {
    return errorResponse(401, "invalid machine credential");
  }

  await ctx.runMutation(
    internal.connectedMachines.upsertHeartbeatFromConnector,
    {
      userId: validation.userId,
      machineId,
      displayName,
      hostname,
      os,
      status,
      connectorVersion,
      capabilities,
      allowedRoots,
    },
  );

  return jsonResponse({ ok: true });
});
