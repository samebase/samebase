"use node";

import { Infer, v } from "convex/values";
import { action, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { getUserId } from "../common";
import type { Id } from "../_generated/dataModel";
import { isObjectRecord, readString } from "../jsonUtils";
import { assertCodespacesEnabled } from "../../shared/featureFlags";

type PortVisibility = "public" | "private";

const tunnelsApiVersion = "2023-09-27-preview";
const githubApiVersion = "2022-11-28";

const ensureCodespacePortsVisibilityResult = v.object({
  ensured: v.boolean(),
  results: v.array(
    v.object({
      portNumber: v.number(),
      desiredVisibility: v.union(v.literal("public"), v.literal("private")),
      applied: v.boolean(),
      reason: v.optional(v.string()),
    }),
  ),
});

async function getGithubAccessToken(ctx: ActionCtx, userId: Id<"users">): Promise<string> {
  const connection = await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
    userId,
    kind: "github",
  });
  if (connection?.kind !== "github") {
    throw new Error("GitHub is not connected");
  }
  return connection.auth.credential;
}

function readRecord(
  record: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const value = record[key];
  return isObjectRecord(value) ? value : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const output: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string") {
      output.push(entry);
    }
  }
  return output;
}

function parseAllowedPortPrivacySettings(value: unknown): Set<PortVisibility> {
  const raw = readStringArray(value);
  const settings = new Set<PortVisibility>();
  if (!raw) {
    return settings;
  }
  for (const entry of raw) {
    if (entry === "public" || entry === "private") {
      settings.add(entry);
    }
  }
  return settings;
}

function stripTrailingSlashes(value: string): string {
  let trimmed = value.trim();
  while (trimmed.endsWith("/")) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed;
}

function buildTunnelsBaseUrl(args: {
  clusterId: string | null;
  serviceUri: string | null;
}): string {
  if (args.clusterId) {
    return `https://${args.clusterId}.rel.tunnels.api.visualstudio.com`;
  }
  if (args.serviceUri) {
    return stripTrailingSlashes(args.serviceUri);
  }
  return "https://global.rel.tunnels.api.visualstudio.com";
}

function buildTunnelPortUrl(args: {
  tunnelsBaseUrl: string;
  tunnelId: string;
  portNumber: number;
}): string {
  const url = new URL(
    `/tunnels/${encodeURIComponent(args.tunnelId)}/ports/${args.portNumber}`,
    args.tunnelsBaseUrl,
  );
  url.searchParams.set("includePorts", "true");
  url.searchParams.set("api-version", tunnelsApiVersion);
  return url.toString();
}

async function readResponseBodyTextTruncated(
  response: Response,
  maxChars: number,
): Promise<string> {
  try {
    const text = await response.text();
    if (text.length <= maxChars) {
      return text;
    }
    return `${text.slice(0, maxChars)}...`;
  } catch {
    return "<unreadable>";
  }
}

function parseErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

type CodespaceTunnelAuth = {
  tunnelId: string;
  clusterId: string | null;
  serviceUri: string | null;
  managePortsAccessToken: string;
  allowedPortPrivacySettings: Set<PortVisibility>;
};

async function fetchCodespaceTunnelAuth(args: {
  githubAccessToken: string;
  codespaceName: string;
}): Promise<CodespaceTunnelAuth> {
  const url = new URL(
    `https://api.github.com/user/codespaces/${encodeURIComponent(args.codespaceName)}`,
  );
  url.searchParams.set("internal", "true");
  url.searchParams.set("refresh", "true");

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${args.githubAccessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": githubApiVersion,
    },
  });

  if (!response.ok) {
    const body = await readResponseBodyTextTruncated(response, 600);
    throw new Error(`Failed to fetch codespace metadata (${response.status}): ${body}`);
  }

  const json: unknown = await response.json();
  if (!isObjectRecord(json)) {
    throw new Error("Unexpected codespace metadata response shape");
  }

  const runtimeConstraints = readRecord(json, "runtime_constraints");
  const allowedPortPrivacySettings = parseAllowedPortPrivacySettings(
    runtimeConstraints?.allowed_port_privacy_settings,
  );

  const connection = readRecord(json, "connection");
  const tunnelProperties = connection ? readRecord(connection, "tunnelProperties") : undefined;

  const tunnelId = tunnelProperties ? readString(tunnelProperties, "tunnelId") : undefined;
  const managePortsAccessToken = tunnelProperties
    ? readString(tunnelProperties, "managePortsAccessToken")
    : undefined;

  if (!tunnelId || !managePortsAccessToken) {
    throw new Error("Codespace tunnel properties not available yet");
  }

  const clusterId = tunnelProperties ? readString(tunnelProperties, "clusterId") : undefined;
  const serviceUri = tunnelProperties ? readString(tunnelProperties, "serviceUri") : undefined;

  return {
    tunnelId,
    clusterId: clusterId ?? null,
    serviceUri: serviceUri ?? null,
    managePortsAccessToken,
    allowedPortPrivacySettings,
  };
}

async function fetchCodespaceTunnelAuthWithRetry(args: {
  githubAccessToken: string;
  codespaceName: string;
  maxAttempts: number;
}): Promise<CodespaceTunnelAuth> {
  let attempt = 0;
  let lastError: string | null = null;

  while (attempt < args.maxAttempts) {
    attempt += 1;
    try {
      return await fetchCodespaceTunnelAuth({
        githubAccessToken: args.githubAccessToken,
        codespaceName: args.codespaceName,
      });
    } catch (error) {
      lastError = parseErrorMessage(error);
      const delayMs = Math.min(15000, 750 * 2 ** (attempt - 1));
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error(lastError ?? "Failed to fetch codespace tunnel metadata");
}

function tunnelPortPutBody(args: { portNumber: number; visibility: PortVisibility }): {
  portNumber: number;
  labels: string[];
  protocol: "http";
  accessControl: {
    entries: Array<
      | { type: "Anonymous"; subjects: string[]; scopes: Array<"connect"> }
      | {
          type: "Organizations";
          isDeny: true;
          subjects: string[];
          scopes: string[];
        }
    >;
  };
  portForwardingUris: null;
  inspectionUri: string;
} {
  if (args.visibility === "public") {
    return {
      portNumber: args.portNumber,
      labels: ["UserForwardedPort"],
      protocol: "http",
      accessControl: {
        entries: [
          {
            type: "Anonymous",
            subjects: [],
            scopes: ["connect"],
          },
        ],
      },
      portForwardingUris: null,
      inspectionUri: "",
    };
  }

  // Matches `gh codespace ports visibility <port>:private`.
  return {
    portNumber: args.portNumber,
    labels: ["UserForwardedPort"],
    protocol: "http",
    accessControl: {
      entries: [
        {
          type: "Organizations",
          isDeny: true,
          subjects: ["1"],
          scopes: [],
        },
      ],
    },
    portForwardingUris: null,
    inspectionUri: "",
  };
}

function portDefinitionMatchesVisibility(args: {
  portDefinitionJson: unknown;
  desired: PortVisibility;
}): boolean {
  if (!isObjectRecord(args.portDefinitionJson)) {
    return false;
  }
  const accessControl = readRecord(args.portDefinitionJson, "accessControl");
  const entriesValue = accessControl?.entries;
  if (!Array.isArray(entriesValue)) {
    return args.desired === "private";
  }

  let hasAnonymousConnect = false;
  for (const entry of entriesValue) {
    if (!isObjectRecord(entry)) {
      continue;
    }
    const type = readString(entry, "type");
    if (type !== "Anonymous") {
      continue;
    }
    const scopes = readStringArray(entry.scopes);
    if (scopes?.includes("connect")) {
      hasAnonymousConnect = true;
      break;
    }
  }

  return args.desired === "public" ? hasAnonymousConnect : !hasAnonymousConnect;
}

async function ensureTunnelPortVisibility(args: {
  tunnelsBaseUrl: string;
  managePortsAccessToken: string;
  tunnelId: string;
  portNumber: number;
  desired: PortVisibility;
}): Promise<{ applied: boolean; reason?: string }> {
  const portUrl = buildTunnelPortUrl({
    tunnelsBaseUrl: args.tunnelsBaseUrl,
    tunnelId: args.tunnelId,
    portNumber: args.portNumber,
  });

  const commonHeaders: Record<string, string> = {
    Authorization: `Tunnel ${args.managePortsAccessToken}`,
    Accept: "application/vnd.github.merge-info-preview+json, application/vnd.github.nebula-preview",
  };

  // Best-effort fast-path: if it's already correct, do nothing.
  const getCurrent = await fetch(portUrl, {
    method: "GET",
    headers: commonHeaders,
  });
  if (getCurrent.ok) {
    const json: unknown = await getCurrent.json();
    if (
      portDefinitionMatchesVisibility({
        portDefinitionJson: json,
        desired: args.desired,
      })
    ) {
      return { applied: true, reason: "already_in_desired_state" };
    }
  }

  // gh deletes and recreates the port entry; follow the same approach for determinism.
  const deleted = await fetch(portUrl, {
    method: "DELETE",
    headers: commonHeaders,
  });
  if (!deleted.ok && deleted.status !== 404) {
    const body = await readResponseBodyTextTruncated(deleted, 400);
    throw new Error(`Failed to delete tunnel port ${args.portNumber} (${deleted.status}): ${body}`);
  }

  const putResponse = await fetch(portUrl, {
    method: "PUT",
    headers: {
      ...commonHeaders,
      "Content-Type": "application/json;charset=UTF-8",
    },
    body: JSON.stringify(
      tunnelPortPutBody({
        portNumber: args.portNumber,
        visibility: args.desired,
      }),
    ),
  });
  if (!putResponse.ok) {
    const body = await readResponseBodyTextTruncated(putResponse, 600);
    throw new Error(
      `Failed to set tunnel port ${args.portNumber} visibility (${putResponse.status}): ${body}`,
    );
  }

  const verify = await fetch(portUrl, {
    method: "GET",
    headers: commonHeaders,
  });
  if (!verify.ok) {
    return { applied: false, reason: `verify_failed_${verify.status}` };
  }
  const verifyJson: unknown = await verify.json();
  if (
    !portDefinitionMatchesVisibility({
      portDefinitionJson: verifyJson,
      desired: args.desired,
    })
  ) {
    return { applied: false, reason: "verify_mismatch" };
  }

  return { applied: true };
}

async function ensureTunnelPortVisibilityWithRetry(args: {
  tunnelsBaseUrl: string;
  managePortsAccessToken: string;
  tunnelId: string;
  portNumber: number;
  desired: PortVisibility;
  maxAttempts: number;
}): Promise<{ applied: boolean; reason?: string }> {
  let attempt = 0;
  let lastError: string | null = null;

  while (attempt < args.maxAttempts) {
    attempt += 1;
    try {
      const result = await ensureTunnelPortVisibility({
        tunnelsBaseUrl: args.tunnelsBaseUrl,
        managePortsAccessToken: args.managePortsAccessToken,
        tunnelId: args.tunnelId,
        portNumber: args.portNumber,
        desired: args.desired,
      });
      return result;
    } catch (error) {
      lastError = parseErrorMessage(error);
      const delayMs = Math.min(15000, 750 * 2 ** (attempt - 1));
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return { applied: false, reason: lastError ?? "unknown_error" };
}

/**
 * Ensure desired port visibility for a Codespace.
 *
 * This uses the user's GitHub OAuth access token to fetch a short-lived
 * tunnels management token, then applies ACL updates via the Dev Tunnels API.
 */
export const ensureCodespacePortsVisibility = action({
  args: { codespaceId: v.id("codespaces") },
  returns: ensureCodespacePortsVisibilityResult,
  handler: async (ctx, args): Promise<Infer<typeof ensureCodespacePortsVisibilityResult>> => {
    assertCodespacesEnabled();
    const ensuredAt = Date.now();
    let userId: Id<"users">;

    try {
      userId = await getUserId(ctx);

      const codespace = await ctx.runQuery(internal.codespaces.mutations.getCodespace, {
        codespaceId: args.codespaceId,
      });
      if (!codespace || codespace.userId !== userId) {
        throw new Error("Codespace not found");
      }

      if (codespace.state !== "running") {
        throw new Error(`Codespace is not running (current state: ${codespace.state})`);
      }

      const githubAccessToken = await getGithubAccessToken(ctx, userId);

      const desiredPorts: Array<{
        portNumber: number;
        visibility: PortVisibility;
      }> = [
        { portNumber: 3000, visibility: "public" },
        { portNumber: 1455, visibility: "private" },
      ];

      // Fetch tunnel metadata and short-lived managePorts token (eventual consistency).
      const tunnelAuth = await fetchCodespaceTunnelAuthWithRetry({
        githubAccessToken,
        codespaceName: codespace.ghCodespaceName,
        maxAttempts: 8,
      });
      const tunnelsBaseUrl = buildTunnelsBaseUrl({
        clusterId: tunnelAuth.clusterId,
        serviceUri: tunnelAuth.serviceUri,
      });

      const results: Array<{
        portNumber: number;
        desiredVisibility: PortVisibility;
        applied: boolean;
        reason?: string;
      }> = [];

      for (const desired of desiredPorts) {
        if (
          tunnelAuth.allowedPortPrivacySettings.size > 0 &&
          !tunnelAuth.allowedPortPrivacySettings.has(desired.visibility)
        ) {
          results.push({
            portNumber: desired.portNumber,
            desiredVisibility: desired.visibility,
            applied: false,
            reason: `visibility_not_allowed:${desired.visibility}`,
          });
          continue;
        }

        const ensured = await ensureTunnelPortVisibilityWithRetry({
          tunnelsBaseUrl,
          managePortsAccessToken: tunnelAuth.managePortsAccessToken,
          tunnelId: tunnelAuth.tunnelId,
          portNumber: desired.portNumber,
          desired: desired.visibility,
          maxAttempts: 5,
        });

        results.push({
          portNumber: desired.portNumber,
          desiredVisibility: desired.visibility,
          applied: ensured.applied,
          reason: ensured.reason,
        });
      }

      const ensured = results.every((entry) => entry.applied);
      await ctx.runMutation(internal.codespaces.mutations.updatePortsVisibilityStatus, {
        codespaceId: args.codespaceId,
        ensured,
        ensuredAt,
        lastError: ensured ? undefined : JSON.stringify(results).slice(0, 800),
      });

      return { ensured, results };
    } catch (error) {
      const message = parseErrorMessage(error);
      await ctx.runMutation(internal.codespaces.mutations.updatePortsVisibilityStatus, {
        codespaceId: args.codespaceId,
        ensured: false,
        ensuredAt,
        lastError: message.slice(0, 800),
      });
      throw error;
    }
  },
});
