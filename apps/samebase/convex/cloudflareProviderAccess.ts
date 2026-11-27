"use node";

import { Infer, v } from "convex/values";

import { internal } from "./_generated/api";
import { action } from "./functions";
import type { ResolvedCloudflareConnection } from "./cloudflareOAuth";
import {
  listCloudflareAccountsForToken,
  type CloudflareAccount,
} from "./cloudflareAccountDiscovery";
import * as user from "@distilled.cloud/cloudflare/user";
import * as workers from "@distilled.cloud/cloudflare/workers";
import * as workersBuilds from "@distilled.cloud/cloudflare/workers_builds";

import { runCloudflare } from "./cloudflareApi";
import { deriveMcpTokenStatusFromExpiry, type McpTokenHealth } from "./mcpTokenHealth";
import { organizationProviderCredentialAad } from "./organization/providerCredentialModel";
import { openSecret } from "./sealedSecret";

const { array, boolean, id, literal, object, string, union } = v;

const CLOUDFLARE_OAUTH_SCOPES = [
  "workers-ci.read",
  "workers-ci.write",
  "workers-scripts.read",
  "workers-scripts.write",
  "account-settings.read",
  "secrets-store.read",
  "secrets-store.write",
  "offline_access",
] as const;

const vCloudflareProviderAuthMethod = union(literal("api_key"), literal("oauth"));

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
      internal.organizationAccess.requireOrganizationIdForMember,
      {
        userId: ctx.viewer.userId,
        organizationId: args.organizationId,
      },
    );
    const configuration = await ctx.runQuery(
      internal.organizationProviderCredentials.loadForProviderStatus,
      {
        organizationId,
        userId: ctx.viewer.userId,
      },
    );
    const credential = configuration.cloudflareCredential;
    let connection: ResolvedCloudflareConnection | null;
    if (credential === undefined) {
      connection = null;
    } else if (credential.auth.method === "api_key") {
      const account = configuration.cloudflareAccount;
      if (account === undefined) {
        throw new Error("Cloudflare credential has no configured account.");
      }
      connection = {
        auth: credential.auth,
        account,
        ...(credential.tokenHealth ? { tokenHealth: credential.tokenHealth } : {}),
      };
    } else {
      try {
        connection = await ctx.runAction(
          internal.cloudflareOAuth.resolveConnectionForOrganization,
          { organizationId, userId: ctx.viewer.userId },
        );
      } catch (error) {
        // The resolver records a grant the broker refused. Only a reconnect repairs it, not a reload.
        const current = await ctx.runQuery(
          internal.organizationProviderCredentials.loadForProviderStatus,
          { organizationId, userId: ctx.viewer.userId },
        );
        if (current.cloudflareCredential?.tokenHealth?.status !== "invalid") throw error;
        return {
          connected: true,
          requestedScopes: getCloudflareRequestedScopes(current.cloudflareCredential.auth.method),
          checks: [{ key: "token", status: "error" }],
        };
      }
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
    const token = (
      await openSecret({
        sealed: resolvedConnection.auth.credential,
        aad: organizationProviderCredentialAad(organizationId, "cloudflare.auth.credential"),
      })
    ).trim();
    const checks: CloudflareAccessCheck[] = [];

    if (authMethod === "api_key") {
      const tokenProbe = await runCloudflareProbe({
        key: "token",
        run: async () => {
          await runCloudflare(token, user.verifyToken({}));
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
        const accounts = await listCloudflareAccountsForToken(token);
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
            await runCloudflare(
              token,
              workers.getAccountSetting({ accountId: configuredVisibleAccount.accountId }),
            );
          },
        }),
        runCloudflareProbe({
          key: "workers_builds",
          run: async () => {
            await runCloudflare(
              token,
              workersBuilds.getAccountLimits({ accountId: configuredVisibleAccount.accountId }),
            );
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
    // The error can quote the provider body, so only its tag and Cloudflare code are logged.
    const tag =
      typeof error === "object" && error !== null && "_tag" in error ? String(error._tag) : null;
    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "number"
        ? error.code
        : null;
    console.warn("cloudflare:provider_access_probe_failed", { check: key, error: tag, code });
    return {
      state: "error",
      check: {
        key,
        status: "error",
      },
    };
  }
}

function buildCloudflareOAuthTokenCheck({
  auth,
  tokenHealth,
  checkedAt,
}: {
  auth: Extract<ResolvedCloudflareConnection["auth"], { method: "oauth" }>;
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
    default:
      authMethod satisfies never;
      return [];
  }
}
