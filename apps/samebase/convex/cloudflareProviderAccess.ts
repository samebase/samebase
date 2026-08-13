"use node";

import { Infer, v } from "convex/values";

import { internal } from "./_generated/api";
import { action } from "./functions";
import { CLOUDFLARE_OAUTH_SCOPES, type ResolvedCloudflareConnection } from "./cloudflareOAuth";
import {
  listCloudflareAccountsForToken,
  type CloudflareAccount,
} from "./cloudflareAccountDiscovery";
import { requestCloudflareApiOrThrow, resolveCloudflareApiTransport } from "./cloudflareApi/client";
import { CLOUDFLARE_MCP_OAUTH_SCOPES } from "./cloudflareMcpOAuth";
import { deriveMcpTokenStatusFromExpiry, type McpTokenHealth } from "./mcpTokenHealth";

const { array, boolean, id, literal, object, string, union } = v;

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

const vCloudflareAccessCheckStatus = union(
  literal("ok"),
  literal("error"),
  literal("unknown"),
  literal("not_run"),
);

const vCloudflareRequestedScope = object({
  scope: string(),
});

const vCloudflareAccessCheck = object({
  key: vCloudflareAccessCheckKey,
  status: vCloudflareAccessCheckStatus,
});

export const vCloudflareConnectionAccess = object({
  connected: boolean(),
  requestedScopes: array(vCloudflareRequestedScope),
  checks: array(vCloudflareAccessCheck),
});

type CloudflareProviderAuthMethod = Infer<typeof vCloudflareProviderAuthMethod>;
type CloudflareAccessCheck = Infer<typeof vCloudflareAccessCheck>;
type CloudflareAccessCheckKey = Infer<typeof vCloudflareAccessCheckKey>;
type CloudflareConnectionAccess = Infer<typeof vCloudflareConnectionAccess>;
type CloudflareRequestedScope = Infer<typeof vCloudflareRequestedScope>;

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
    let connection: ResolvedCloudflareConnection | null;
    try {
      const configuration = await ctx.runQuery(
        internal.organizationProviderCredentials.loadForOrganization,
        {
          organizationId,
          userId: ctx.viewer.userId,
        },
      );
      const credential = configuration.cloudflareCredential;
      if (credential === undefined) {
        connection = null;
      } else {
        const account = configuration.cloudflareAccount;
        if (account === undefined) {
          throw new Error("Cloudflare credential has no configured account.");
        }
        connection = {
          auth: credential.auth,
          account,
          ...(credential.tokenHealth ? { tokenHealth: credential.tokenHealth } : {}),
        };
      }
    } catch {
      throw new Error("Cloudflare access check failed.");
    }
    if (connection === null) {
      return {
        connected: false,
        requestedScopes: [],
        checks: [
          {
            key: "token",
            status: "not_run",
          },
        ],
      };
    }

    const resolvedConnection = connection;
    const authMethod = resolvedConnection.auth.method;
    const token = resolvedConnection.auth.credential.trim();
    const transport = resolveCloudflareApiTransport(authMethod);
    const checks: CloudflareAccessCheck[] = [];

    if (authMethod === "api_key") {
      const tokenProbe = await runCloudflareProbe({
        key: "token",
        run: async () => {
          await checkCloudflareApiTokenAccess({
            token,
            transport,
          });
        },
      });
      checks.push(tokenProbe.check);
    } else {
      checks.push(
        buildCloudflareOAuthTokenCheck({
          auth: resolvedConnection.auth,
          tokenHealth: resolvedConnection.tokenHealth,
          checkedAt,
        }),
      );
    }

    const configuredAccount = resolvedConnection.account;
    const rawAccountsProbe = await runCloudflareProbe({
      key: "accounts",
      run: async () => {
        const accounts = await listCloudflareAccountsForToken({
          token,
          transport,
        });
        return accounts.filter((account) => account.accountId === configuredAccount.accountId);
      },
    });
    const accountsProbe = markMissingConfiguredCloudflareAccount({
      accountsProbe: rawAccountsProbe,
      configuredAccount,
    });
    checks.push(accountsProbe.check);

    const visibleAccounts = accountsProbe.state === "ok" ? accountsProbe.value : [];
    const configuredVisibleAccount =
      visibleAccounts.find((account) => account.accountId === configuredAccount.accountId) ?? null;

    if (configuredVisibleAccount === null) {
      checks.push(
        { key: "workers", status: "not_run" },
        { key: "workers_builds", status: "not_run" },
      );
    } else {
      const [workersProbe, buildsProbe] = await Promise.all([
        runCloudflareProbe({
          key: "workers",
          run: async () => {
            await checkCloudflareWorkersAccess({
              accountId: configuredVisibleAccount.accountId,
              token,
              transport,
            });
          },
        }),
        runCloudflareProbe({
          key: "workers_builds",
          run: async () => {
            await checkCloudflareWorkersBuildsAccess({
              accountId: configuredVisibleAccount.accountId,
              token,
              transport,
            });
          },
        }),
      ]);
      checks.push(workersProbe.check, buildsProbe.check);
    }

    return {
      connected: true,
      requestedScopes: getCloudflareRequestedScopes(authMethod),
      checks,
    };
  },
});

async function runCloudflareProbe<Value>({
  key,
  run,
}: {
  key: CloudflareAccessCheckKey;
  run: () => Promise<Value>;
}): Promise<CloudflareProbeResult<Value>> {
  try {
    const value = await run();
    return {
      state: "ok",
      value,
      check: {
        key,
        status: "ok",
      },
    };
  } catch (error) {
    console.warn("cloudflare:provider_access_probe_failed", {
      check: key,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return {
      state: "error",
      check: {
        key,
        status: "error",
      },
    };
  }
}

async function checkCloudflareApiTokenAccess({
  token,
  transport,
}: {
  token: string;
  transport: ReturnType<typeof resolveCloudflareApiTransport>;
}): Promise<void> {
  await requestCloudflareApiOrThrow({
    token,
    transport,
    method: "GET",
    path: "/user/tokens/verify",
    params: {},
  });
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
  await requestCloudflareApiOrThrow({
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
  await requestCloudflareApiOrThrow({
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
  auth: Extract<ResolvedCloudflareConnection["auth"], { method: "oauth" | "mcp_oauth" }>;
  tokenHealth?: McpTokenHealth;
  checkedAt: number;
}): CloudflareAccessCheck {
  const expiresAt = tokenHealth?.expiresAt ?? auth.credentialExpiresAt;
  const status = tokenHealth?.status ?? deriveMcpTokenStatusFromExpiry(expiresAt, checkedAt);

  if (status === "expired" || status === "invalid") {
    return {
      key: "token",
      status: "error",
    };
  }
  if (status === "unknown") {
    return {
      key: "token",
      status: "unknown",
    };
  }

  return {
    key: "token",
    status: "ok",
  };
}

function markMissingConfiguredCloudflareAccount({
  accountsProbe,
  configuredAccount,
}: {
  accountsProbe: CloudflareProbeResult<CloudflareAccount[]>;
  configuredAccount: ResolvedCloudflareConnection["account"];
}): CloudflareProbeResult<CloudflareAccount[]> {
  if (
    accountsProbe.state === "ok" &&
    !accountsProbe.value.some((account) => account.accountId === configuredAccount.accountId)
  ) {
    return {
      ...accountsProbe,
      check: {
        key: "accounts",
        status: "error",
      },
    };
  }
  return accountsProbe;
}

function getCloudflareRequestedScopes(
  authMethod: CloudflareProviderAuthMethod,
): CloudflareRequestedScope[] {
  switch (authMethod) {
    case "api_key":
      return [];
    case "oauth":
      return CLOUDFLARE_OAUTH_SCOPES.map((scope) => ({ scope }));
    case "mcp_oauth":
      return CLOUDFLARE_MCP_OAUTH_SCOPES.map((scope) => ({ scope }));
    default:
      authMethod satisfies never;
      return [];
  }
}
