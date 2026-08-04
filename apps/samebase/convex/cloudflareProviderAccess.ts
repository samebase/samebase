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
import type { CloudflareDefaultAccount } from "./providerConnectionModel";

const { array, boolean, id, literal, number, object, optional, string, union } = v;

const vCloudflareProviderAuthMethod = union(
  literal("api_key"),
  literal("oauth"),
  literal("mcp_oauth"),
);

const vCloudflareAccessCheckKey = union(
  literal("token"),
  literal("accounts"),
  literal("selected_account"),
  literal("workers"),
  literal("workers_builds"),
);

const vCloudflareAccessCheckStatus = union(literal("ok"), literal("error"), literal("unknown"));

const vCloudflareRequestedScope = object({
  scope: string(),
  label: string(),
});

const vCloudflareAccountAccess = object({
  accountId: string(),
  accountName: string(),
  selected: boolean(),
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
  accounts: array(vCloudflareAccountAccess),
  checks: array(vCloudflareAccessCheck),
});

type CloudflareProviderAuthMethod = Infer<typeof vCloudflareProviderAuthMethod>;
type CloudflareAccessCheck = Infer<typeof vCloudflareAccessCheck>;
type CloudflareAccessCheckKey = Infer<typeof vCloudflareAccessCheckKey>;
type CloudflareConnectionAccess = Infer<typeof vCloudflareConnectionAccess>;
type CloudflareRequestedScope = Infer<typeof vCloudflareRequestedScope>;
type CloudflareTokenVerification = Infer<typeof vCloudflareTokenVerification>;
type CloudflareAccountAccess = Infer<typeof vCloudflareAccountAccess>;

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
  defaultAccount: CloudflareDefaultAccount;
  tokenHealth?: McpTokenHealth;
};

type CloudflareVisibleAccount = CloudflareAccount;

type SelectedCloudflareAccount = {
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
    const selectedConnection = await ctx.runQuery(
      internal.providerConnections.loadSelectedForOrganization,
      {
        organizationId,
        userId: ctx.viewer.userId,
        kind: "cloudflare",
      },
    );
    const connection =
      selectedConnection?.kind === "cloudflare"
        ? await ctx.runAction(internal.cloudflareOAuth.resolveConnectionForOrganization, {
            organizationId,
            providerConnectionId: selectedConnection._id,
            userId: ctx.viewer.userId,
          })
        : null;

    if (connection === null) {
      return {
        connected: false,
        checkedAt,
        requestedScopes: [],
        accounts: [],
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

    const accountsProbe = await runCloudflareProbe({
      key: "accounts",
      label: "Accounts",
      run: async () => {
        return listCloudflareAccountsForToken({
          token,
          transport,
          perPage: 100,
        });
      },
      describe: (accounts) => {
        if (accounts.length === 0) {
          return "Probe GET /accounts succeeded and returned no visible accounts.";
        }
        if (accounts.length === 1) {
          return `Probe GET /accounts returned 1 visible account: ${accounts[0].accountName}.`;
        }
        return `Probe GET /accounts returned ${accounts.length} visible accounts.`;
      },
    });
    checks.push(accountsProbe.check);

    const visibleAccounts = accountsProbe.state === "ok" ? accountsProbe.value : [];
    const selectedAccount = readSelectedCloudflareAccount(resolvedConnection.defaultAccount);
    const selectedVisibleAccount =
      selectedAccount === null
        ? null
        : (visibleAccounts.find((account) => account.accountId === selectedAccount.accountId) ??
          null);
    checks.push(
      buildSelectedCloudflareAccountCheck({
        selectedAccount,
        accountsProbe,
        selectedVisibleAccount,
      }),
    );

    if (selectedVisibleAccount === null) {
      checks.push(
        buildUnknownCloudflareCheck({
          key: "workers",
          label: "Workers",
          message: buildSkippedCloudflareCapabilityProbeMessage({
            accountsProbe,
            capabilityLabel: "Workers",
            selectedAccount,
          }),
        }),
        buildUnknownCloudflareCheck({
          key: "workers_builds",
          label: "Workers Builds",
          message: buildSkippedCloudflareCapabilityProbeMessage({
            accountsProbe,
            capabilityLabel: "Workers Builds",
            selectedAccount,
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
              accountId: selectedVisibleAccount.accountId,
              token,
              transport,
            });
          },
          describe: () => {
            return `Probe GET /accounts/{account_id}/workers/account-settings succeeded for ${selectedVisibleAccount.accountName}.`;
          },
        }),
        runCloudflareProbe({
          key: "workers_builds",
          label: "Workers Builds",
          run: async () => {
            await checkCloudflareWorkersBuildsAccess({
              accountId: selectedVisibleAccount.accountId,
              token,
              transport,
            });
          },
          describe: () => {
            return `Probe GET /accounts/{account_id}/builds/account/limits succeeded for ${selectedVisibleAccount.accountName}.`;
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
      ...(tokenVerification !== undefined ? { token: tokenVerification } : {}),
      accounts: buildCloudflareAccountAccess({
        selectedAccount,
        visibleAccounts,
      }),
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

  const id = normalizeOptionalString(verification.id);
  const status = normalizeOptionalString(verification.status);
  const expiresOn = normalizeOptionalString(verification.expires_on);
  const notBefore = normalizeOptionalString(verification.not_before);
  return {
    ...(id !== undefined ? { id } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(expiresOn !== undefined ? { expiresOn } : {}),
    ...(notBefore !== undefined ? { notBefore } : {}),
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
  tokenHealth: McpTokenHealth | undefined;
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

function buildSelectedCloudflareAccountCheck({
  selectedAccount,
  accountsProbe,
  selectedVisibleAccount,
}: {
  selectedAccount: SelectedCloudflareAccount | null;
  accountsProbe: CloudflareProbeResult<CloudflareVisibleAccount[]>;
  selectedVisibleAccount: CloudflareVisibleAccount | null;
}): CloudflareAccessCheck {
  if (selectedAccount === null) {
    return {
      key: "selected_account",
      label: "Selected account",
      status: "unknown",
      message: "Skipped: no Cloudflare account is selected.",
    };
  }

  if (accountsProbe.state === "error") {
    return {
      key: "selected_account",
      label: "Selected account",
      status: "unknown",
      message:
        "Skipped: the Accounts probe failed, so selected-account visibility could not be checked.",
    };
  }

  if (selectedVisibleAccount === null) {
    return {
      key: "selected_account",
      label: "Selected account",
      status: "error",
      message: `The Accounts probe did not return selected account ${selectedAccount.accountName} (${selectedAccount.accountId}).`,
    };
  }

  return {
    key: "selected_account",
    label: "Selected account",
    status: "ok",
    message: `The Accounts probe returned selected account ${selectedVisibleAccount.accountName} (${selectedVisibleAccount.accountId}).`,
  };
}

function buildSkippedCloudflareCapabilityProbeMessage({
  accountsProbe,
  capabilityLabel,
  selectedAccount,
}: {
  accountsProbe: CloudflareProbeResult<CloudflareVisibleAccount[]>;
  capabilityLabel: string;
  selectedAccount: SelectedCloudflareAccount | null;
}): string {
  if (selectedAccount === null) {
    return `Skipped: choose a Cloudflare account before probing ${capabilityLabel}.`;
  }

  if (accountsProbe.state === "error") {
    return `Skipped: the Accounts probe failed, so Samebase could not confirm the selected account before probing ${capabilityLabel}.`;
  }

  return `Skipped: the Accounts probe did not return selected account ${selectedAccount.accountName} (${selectedAccount.accountId}).`;
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

function buildCloudflareAccountAccess({
  selectedAccount,
  visibleAccounts,
}: {
  selectedAccount: SelectedCloudflareAccount | null;
  visibleAccounts: CloudflareVisibleAccount[];
}): CloudflareAccountAccess[] {
  return visibleAccounts.map((account) => ({
    accountId: account.accountId,
    accountName: account.accountName,
    selected: selectedAccount?.accountId === account.accountId,
  }));
}

function readSelectedCloudflareAccount(
  defaultAccount: CloudflareDefaultAccount,
): SelectedCloudflareAccount | null {
  switch (defaultAccount.state) {
    case "not_selected":
      return null;
    case "selected":
      return {
        accountId: defaultAccount.accountId,
        accountName: defaultAccount.accountName,
      };
    default:
      defaultAccount satisfies never;
      return null;
  }
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
