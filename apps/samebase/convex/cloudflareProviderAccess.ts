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
import { toErrorMessage } from "./jsonUtils";
import { deriveMcpTokenStatusFromExpiry, type McpTokenHealth } from "./mcpTokenHealth";
import type { CloudflareDefaultAccount } from "./schema";

const { array, boolean, literal, number, object, optional, string, union } = v;

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
  args: {},
  returns: vCloudflareConnectionAccess,
  handler: async (ctx): Promise<CloudflareConnectionAccess> => {
    const checkedAt = Date.now();
    const connection = await ctx.runAction(internal.cloudflareOAuth.resolveConnectionForUser, {
      userId: ctx.viewer.userId,
    });

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
          return `Cloudflare accepted the API token (${status}).`;
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
          return "Cloudflare returned no visible accounts.";
        }
        if (accounts.length === 1) {
          return `Cloudflare returned 1 visible account: ${accounts[0].accountName}.`;
        }
        return `Cloudflare returned ${accounts.length} visible accounts.`;
      },
    });
    checks.push(accountsProbe.check);

    const visibleAccounts = accountsProbe.state === "ok" ? accountsProbe.value : [];
    const selectedAccount = readSelectedCloudflareAccount(resolvedConnection.defaultAccount);
    checks.push(
      buildSelectedCloudflareAccountCheck({
        selectedAccount,
        accountsProbe,
        visibleAccounts,
      }),
    );

    const selectedVisibleAccount =
      selectedAccount === null
        ? null
        : (visibleAccounts.find((account) => account.accountId === selectedAccount.accountId) ??
          null);

    if (selectedVisibleAccount === null) {
      checks.push(
        buildUnknownCloudflareCheck({
          key: "workers",
          label: "Workers",
          message:
            selectedAccount === null
              ? "Choose a Cloudflare account before checking Workers access."
              : "The selected Cloudflare account was not visible to this credential.",
        }),
      );
      checks.push(
        buildUnknownCloudflareCheck({
          key: "workers_builds",
          label: "Workers Builds",
          message:
            selectedAccount === null
              ? "Choose a Cloudflare account before checking Workers Builds access."
              : "The selected Cloudflare account was not visible to this credential.",
        }),
      );
    } else {
      const workersProbe = await runCloudflareProbe({
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
          return `Cloudflare returned Workers account settings for ${selectedVisibleAccount.accountName}.`;
        },
      });
      checks.push(workersProbe.check);

      const buildsProbe = await runCloudflareProbe({
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
          return `Cloudflare returned Workers Builds account limits for ${selectedVisibleAccount.accountName}.`;
        },
      });
      checks.push(buildsProbe.check);
    }

    return {
      connected: true,
      authMethod,
      checkedAt,
      requestedScopes: getCloudflareRequestedScopes(authMethod),
      token: tokenVerification,
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

  return {
    id: normalizeOptionalString(verification?.id),
    status: normalizeOptionalString(verification?.status),
    expiresOn: normalizeOptionalString(verification?.expires_on),
    notBefore: normalizeOptionalString(verification?.not_before),
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
    message: `Samebase has a ${formatCloudflareTokenStatus(status)} Cloudflare OAuth token expiring ${new Date(expiresAt).toISOString()}.`,
  };
}

function buildSelectedCloudflareAccountCheck({
  selectedAccount,
  accountsProbe,
  visibleAccounts,
}: {
  selectedAccount: SelectedCloudflareAccount | null;
  accountsProbe: CloudflareProbeResult<CloudflareVisibleAccount[]>;
  visibleAccounts: CloudflareVisibleAccount[];
}): CloudflareAccessCheck {
  if (selectedAccount === null) {
    return {
      key: "selected_account",
      label: "Selected account",
      status: "unknown",
      message: "No Cloudflare account is selected.",
    };
  }

  if (accountsProbe.state === "error") {
    return {
      key: "selected_account",
      label: "Selected account",
      status: "unknown",
      message: "Account visibility could not be checked.",
    };
  }

  const matchingAccount = visibleAccounts.find(
    (account) => account.accountId === selectedAccount.accountId,
  );
  if (matchingAccount === undefined) {
    return {
      key: "selected_account",
      label: "Selected account",
      status: "error",
      message: `${selectedAccount.accountName} is selected but was not returned by Cloudflare.`,
    };
  }

  return {
    key: "selected_account",
    label: "Selected account",
    status: "ok",
    message: `${matchingAccount.accountName} is selected and visible to this credential.`,
  };
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

function labelCloudflareOAuthScope(scope: string): string {
  switch (scope) {
    case "account-settings.read":
    case "account:read":
      return "Read account metadata";
    case "offline_access":
      return "Refresh access without reconnecting";
    case "user:read":
      return "Read user profile";
    case "workers-ci.read":
    case "workers_builds:read":
      return "Read Workers Builds";
    case "workers-ci.write":
    case "workers_builds:write":
      return "Manage Workers Builds";
    case "workers-scripts.read":
    case "workers:read":
      return "Read Workers";
    case "workers-scripts.write":
    case "workers:write":
    case "workers_scripts:write":
      return "Manage Workers";
    default:
      return scope;
  }
}

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
    return error.message;
  }
  return toErrorMessage(error);
}
