"use node";

import { Infer, v } from "convex/values";

import { internal } from "./_generated/api";
import { action } from "./functions";
import { CLOUDFLARE_OAUTH_SCOPES } from "./cloudflareOAuth";
import {
  listCloudflareAccountsForToken,
  type CloudflareAccount,
} from "./cloudflareAccountDiscovery";
import {
  CloudflareApiError,
  requestCloudflareApi,
  resolveCloudflareApiTransport,
} from "./cloudflareApi/client";
import { CLOUDFLARE_MCP_OAUTH_SCOPES } from "./cloudflareMcpOAuth";
import { deriveMcpTokenStatusFromExpiry, type McpTokenHealth } from "./mcpTokenHealth";

const { array, boolean, id, literal, number, object, optional, string, union } = v;

const vCloudflareProviderAuthMethod = union(
  literal("api_key"),
  literal("oauth"),
  literal("mcp_oauth"),
);

const vCloudflareAccessCheckKey = union(
  literal("token"),
  literal("accounts"),
  literal("workers"),
  literal("workers_builds"),
);

const vCloudflareAccessCheckStatus = union(literal("ok"), literal("error"), literal("unknown"));

const vCloudflareRequestedScope = object({
  scope: string(),
  label: string(),
});

const vCloudflareTokenVerification = object({
  id: optional(string()),
  status: optional(string()),
  expiresOn: optional(string()),
  notBefore: optional(string()),
});

const vCloudflareAccessCheck = object({
  key: vCloudflareAccessCheckKey,
  label: string(),
  status: vCloudflareAccessCheckStatus,
  message: string(),
});

export const vCloudflareConnectionAccess = object({
  connected: boolean(),
  authMethod: optional(vCloudflareProviderAuthMethod),
  checkedAt: number(),
  requestedScopes: array(vCloudflareRequestedScope),
  token: optional(vCloudflareTokenVerification),
  checks: array(vCloudflareAccessCheck),
});

type CloudflareProviderAuthMethod = Infer<typeof vCloudflareProviderAuthMethod>;
type CloudflareAccessCheck = Infer<typeof vCloudflareAccessCheck>;
type CloudflareAccessCheckKey = Infer<typeof vCloudflareAccessCheckKey>;
type CloudflareConnectionAccess = Infer<typeof vCloudflareConnectionAccess>;
type CloudflareRequestedScope = Infer<typeof vCloudflareRequestedScope>;
type CloudflareTokenVerification = Infer<typeof vCloudflareTokenVerification>;

type CloudflareOAuthAuth = {
  method: "oauth" | "mcp_oauth";
  credential: string;
  credentialExpiresAt: number;
  refreshCredential: string;
  clientId?: string;
};

type CloudflareApiKeyAuth = {
  method: "api_key";
  credential: string;
};

type CloudflareProviderAuth = CloudflareApiKeyAuth | CloudflareOAuthAuth;

type CloudflareResolvedConnection = {
  auth: CloudflareProviderAuth;
  account?: ConfiguredCloudflareAccount;
  tokenHealth?: McpTokenHealth;
};

type CloudflareVisibleAccount = CloudflareAccount;

type ConfiguredCloudflareAccount = {
  accountId: string;
  accountName: string;
};

type CloudflareProbeResult<Value> =
  | {
      state: "ok";
      value: Value;
      check: CloudflareAccessCheck;
    }
  | {
      state: "error";
      check: CloudflareAccessCheck;
    };

export const checkCloudflareConnectionAccess = action({
  access: "access_provider_connections",
  args: {
    organizationId: id("organizations"),
  },
  returns: vCloudflareConnectionAccess,
  handler: async (ctx, args): Promise<CloudflareConnectionAccess> => {
    const checkedAt = Date.now();
    const organizationId = await ctx.runQuery(
      internal.organizationAccess.requireOrganizationIdForUser,
      {
        userId: ctx.viewer.userId,
        organizationId: args.organizationId,
      },
    );
    const role = await ctx.runQuery(internal.organizationAccess.requireOrganizationRoleForUser, {
      organizationId,
      userId: ctx.viewer.userId,
    });
    let connection: CloudflareResolvedConnection | null;
    try {
      connection = await ctx.runAction(internal.cloudflareOAuth.resolveConnectionForOrganization, {
        organizationId,
        userId: ctx.viewer.userId,
      });
    } catch {
      throw new Error("Cloudflare access check failed.");
    }
    if (connection === null) {
      return {
        connected: false,
        checkedAt,
        requestedScopes: [],
        checks: [
          {
            key: "token",
            label: "Credential",
            status: "unknown",
            message: "Cloudflare is not connected.",
          },
        ],
      };
    }

    const resolvedConnection: CloudflareResolvedConnection = connection;
    const authMethod = resolvedConnection.auth.method;
    const token = resolvedConnection.auth.credential.trim();
    const transport = resolveCloudflareApiTransport(authMethod);
    const checks: CloudflareAccessCheck[] = [];
    let tokenVerification: CloudflareTokenVerification | undefined;

    if (authMethod === "api_key") {
      const tokenProbe = await runCloudflareProbe({
        key: "token",
        label: "API token",
        run: async () => {
          return verifyCloudflareApiToken({
            token,
            transport,
          });
        },
        describe: (verification) => {
          const status = verification.status ?? "verified";
          return `Probe GET /user/tokens/verify succeeded (${status}).`;
        },
      });
      checks.push(tokenProbe.check);
      if (tokenProbe.state === "ok") {
        tokenVerification = tokenProbe.value;
      }
    } else {
      checks.push(
        buildCloudflareOAuthTokenCheck({
          auth: resolvedConnection.auth,
          tokenHealth: resolvedConnection.tokenHealth,
          checkedAt,
        }),
      );
    }

    const configuredAccount = resolvedConnection.account ?? null;
    const rawAccountsProbe: CloudflareProbeResult<CloudflareAccount[]> =
      configuredAccount === null && role !== "owner"
        ? {
            state: "ok",
            value: [],
            check: {
              key: "accounts",
              label: "Accounts",
              status: "unknown",
              message: "Cloudflare account selection is pending for an organization owner.",
            },
          }
        : await runCloudflareProbe({
            key: "accounts",
            label: "Accounts",
            run: async () => {
              const accounts = await listCloudflareAccountsForToken({
                token,
                transport,
                perPage: 100,
              });
              return configuredAccount === null
                ? accounts
                : accounts.filter((account) => account.accountId === configuredAccount.accountId);
            },
            describe: (accounts) => {
              if (accounts.length === 0) {
                return configuredAccount === null
                  ? "Probe GET /accounts succeeded and returned no visible accounts."
                  : "The connected Cloudflare account is not visible to this credential.";
              }
              if (configuredAccount !== null) {
                return `Probe GET /accounts confirmed the connected account: ${accounts[0].accountName}.`;
              }
              if (accounts.length === 1) {
                return `Probe GET /accounts returned 1 visible account: ${accounts[0].accountName}.`;
              }
              return `Probe GET /accounts returned ${accounts.length} visible accounts.`;
            },
          });
    const accountsProbe = markMissingConfiguredCloudflareAccount({
      accountsProbe: rawAccountsProbe,
      configuredAccount,
    });
    checks.push(accountsProbe.check);

    const visibleAccounts = accountsProbe.state === "ok" ? accountsProbe.value : [];
    const configuredVisibleAccount =
      configuredAccount === null
        ? null
        : (visibleAccounts.find((account) => account.accountId === configuredAccount.accountId) ??
          null);

    if (configuredVisibleAccount === null) {
      checks.push(
        buildUnknownCloudflareCheck({
          key: "workers",
          label: "Workers",
          message: buildSkippedCloudflareCapabilityProbeMessage({
            accountsProbe,
            capabilityLabel: "Workers",
            configuredAccount,
          }),
        }),
        buildUnknownCloudflareCheck({
          key: "workers_builds",
          label: "Workers Builds",
          message: buildSkippedCloudflareCapabilityProbeMessage({
            accountsProbe,
            capabilityLabel: "Workers Builds",
            configuredAccount,
          }),
        }),
      );
    } else {
      const [workersProbe, buildsProbe] = await Promise.all([
        runCloudflareProbe({
          key: "workers",
          label: "Workers",
          run: async () => {
            await checkCloudflareWorkersAccess({
              accountId: configuredVisibleAccount.accountId,
              token,
              transport,
            });
          },
          describe: () => {
            return `Probe GET /accounts/{account_id}/workers/account-settings succeeded for ${configuredVisibleAccount.accountName}.`;
          },
        }),
        runCloudflareProbe({
          key: "workers_builds",
          label: "Workers Builds",
          run: async () => {
            await checkCloudflareWorkersBuildsAccess({
              accountId: configuredVisibleAccount.accountId,
              token,
              transport,
            });
          },
          describe: () => {
            return `Probe GET /accounts/{account_id}/builds/account/limits succeeded for ${configuredVisibleAccount.accountName}.`;
          },
        }),
      ]);
      checks.push(workersProbe.check, buildsProbe.check);
    }

    return {
      connected: true,
      authMethod,
      checkedAt,
      requestedScopes: getCloudflareRequestedScopes(authMethod),
      token: tokenVerification,
      checks,
    };
  },
});

async function runCloudflareProbe<Value>({
  key,
  label,
  run,
  describe,
}: {
  key: CloudflareAccessCheckKey;
  label: string;
  run: () => Promise<Value>;
  describe: (value: Value) => string;
}): Promise<CloudflareProbeResult<Value>> {
  try {
    const value = await run();
    return {
      state: "ok",
      value,
      check: {
        key,
        label,
        status: "ok",
        message: describe(value),
      },
    };
  } catch (error) {
    return {
      state: "error",
      check: {
        key,
        label,
        status: "error",
        message: formatCloudflareAccessProbeError(error),
      },
    };
  }
}

async function verifyCloudflareApiToken({
  token,
  transport,
}: {
  token: string;
  transport: ReturnType<typeof resolveCloudflareApiTransport>;
}): Promise<CloudflareTokenVerification> {
  const verification = await requestCloudflareApi({
    token,
    transport,
    method: "GET",
    path: "/user/tokens/verify",
    params: {},
  });

  if (!verification) {
    return {};
  }

  return {
    id: normalizeOptionalString(verification.id),
    status: normalizeOptionalString(verification.status),
    expiresOn: normalizeOptionalString(verification.expires_on),
    notBefore: normalizeOptionalString(verification.not_before),
  };
}

async function checkCloudflareWorkersAccess({
  accountId,
  token,
  transport,
}: {
  accountId: string;
  token: string;
  transport: ReturnType<typeof resolveCloudflareApiTransport>;
}): Promise<void> {
  await requestCloudflareApi({
    token,
    transport,
    method: "GET",
    path: "/accounts/{account_id}/workers/account-settings",
    params: { path: { account_id: accountId } },
  });
}

async function checkCloudflareWorkersBuildsAccess({
  accountId,
  token,
  transport,
}: {
  accountId: string;
  token: string;
  transport: ReturnType<typeof resolveCloudflareApiTransport>;
}): Promise<void> {
  await requestCloudflareApi({
    token,
    transport,
    method: "GET",
    path: "/accounts/{account_id}/builds/account/limits",
    params: { path: { account_id: accountId } },
  });
}

function buildCloudflareOAuthTokenCheck({
  auth,
  tokenHealth,
  checkedAt,
}: {
  auth: CloudflareOAuthAuth;
  tokenHealth?: McpTokenHealth;
  checkedAt: number;
}): CloudflareAccessCheck {
  const expiresAt = tokenHealth?.expiresAt ?? auth.credentialExpiresAt;
  const status = tokenHealth?.status ?? deriveMcpTokenStatusFromExpiry(expiresAt, checkedAt);

  if (status === "expired" || status === "invalid") {
    return {
      key: "token",
      label: "OAuth token",
      status: "error",
      message: `The Cloudflare OAuth token is ${formatCloudflareTokenStatus(status)}.`,
    };
  }
  if (status === "unknown") {
    return {
      key: "token",
      label: "OAuth token",
      status: "unknown",
      message: "The Cloudflare OAuth token status could not be determined.",
    };
  }

  return {
    key: "token",
    label: "OAuth token",
    status: "ok",
    message: `Stored OAuth token metadata says the token is ${formatCloudflareTokenStatus(status)} until ${new Date(expiresAt).toISOString()}. Live probes below verify current Cloudflare access.`,
  };
}

function markMissingConfiguredCloudflareAccount({
  accountsProbe,
  configuredAccount,
}: {
  accountsProbe: CloudflareProbeResult<CloudflareVisibleAccount[]>;
  configuredAccount: ConfiguredCloudflareAccount | null;
}): CloudflareProbeResult<CloudflareVisibleAccount[]> {
  if (
    configuredAccount !== null &&
    accountsProbe.state === "ok" &&
    !accountsProbe.value.some((account) => account.accountId === configuredAccount.accountId)
  ) {
    return {
      ...accountsProbe,
      check: {
        key: "accounts",
        label: "Accounts",
        message: `The Accounts probe did not return connected account ${configuredAccount.accountName} (${configuredAccount.accountId}).`,
        status: "error",
      },
    };
  }
  return accountsProbe;
}

function buildSkippedCloudflareCapabilityProbeMessage({
  accountsProbe,
  capabilityLabel,
  configuredAccount,
}: {
  accountsProbe: CloudflareProbeResult<CloudflareVisibleAccount[]>;
  capabilityLabel: string;
  configuredAccount: ConfiguredCloudflareAccount | null;
}): string {
  if (configuredAccount === null) {
    return `Skipped: choose a Cloudflare account before probing ${capabilityLabel}.`;
  }

  if (accountsProbe.state === "error") {
    return `Skipped: the Accounts probe failed, so Samebase could not confirm the connected account before probing ${capabilityLabel}.`;
  }

  return `Skipped: the Accounts probe did not return connected account ${configuredAccount.accountName} (${configuredAccount.accountId}).`;
}

function buildUnknownCloudflareCheck({
  key,
  label,
  message,
}: {
  key: CloudflareAccessCheckKey;
  label: string;
  message: string;
}): CloudflareAccessCheck {
  return {
    key,
    label,
    status: "unknown",
    message,
  };
}

function getCloudflareRequestedScopes(
  authMethod: CloudflareProviderAuthMethod,
): CloudflareRequestedScope[] {
  switch (authMethod) {
    case "api_key":
      return [];
    case "oauth":
      return CLOUDFLARE_OAUTH_SCOPES.map((scope) => ({
        scope,
        label: labelCloudflareOAuthScope(scope),
      }));
    case "mcp_oauth":
      return CLOUDFLARE_MCP_OAUTH_SCOPES.map((scope) => ({
        scope,
        label: labelCloudflareOAuthScope(scope),
      }));
    default:
      authMethod satisfies never;
      return [];
  }
}

type CloudflareRequestedOAuthScope =
  | (typeof CLOUDFLARE_OAUTH_SCOPES)[number]
  | (typeof CLOUDFLARE_MCP_OAUTH_SCOPES)[number];

function labelCloudflareOAuthScope(scope: CloudflareRequestedOAuthScope): string {
  return CLOUDFLARE_OAUTH_SCOPE_LABELS[scope];
}

const CLOUDFLARE_OAUTH_SCOPE_LABELS = {
  "account-settings.read": "Read account metadata",
  "account:read": "Read account metadata",
  offline_access: "Refresh access without reconnecting",
  "user:read": "Read user profile",
  "workers-ci.read": "Read Workers Builds",
  "workers-ci.write": "Manage Workers Builds",
  "workers_builds:read": "Read Workers Builds",
  "workers_builds:write": "Manage Workers Builds",
  "workers-scripts.read": "Read Workers",
  "workers-scripts.write": "Manage Workers",
  "workers:read": "Read Workers",
  "workers:write": "Manage Workers",
  "workers_scripts:write": "Manage Workers",
} satisfies Record<
  (typeof CLOUDFLARE_OAUTH_SCOPES)[number] | (typeof CLOUDFLARE_MCP_OAUTH_SCOPES)[number],
  string
>;

function formatCloudflareTokenStatus(status: McpTokenHealth["status"]): string {
  switch (status) {
    case "valid":
      return "valid";
    case "expiring_soon":
      return "valid but expiring soon";
    case "expired":
      return "expired";
    case "invalid":
      return "invalid";
    case "unknown":
      return "unknown";
    default:
      status satisfies never;
      return "unknown";
  }
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === "" ? undefined : trimmed;
}

function formatCloudflareAccessProbeError(error: unknown): string {
  if (error instanceof CloudflareApiError) {
    return `Cloudflare probe ${error.method} ${error.path} failed.`;
  }
  return "Cloudflare access check failed.";
}
