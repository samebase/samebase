"use node";

import { Infer, v } from "convex/values";
import { action, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { getUserId } from "../common";
import { toErrorMessage } from "../jsonUtils";
import type { McpTokenHealth } from "../mcpTokenHealth";
import { listCloudflareAccountsForToken } from "../cloudflareAccountDiscovery";
import { validateAppResourceName } from "../../shared/appResourceNames";
import {
  createCloudflareWorker,
  deleteCloudflareResources,
  listCloudflareWorkers,
  readOptionalWorkersDevUrl,
} from "../cloudflareResources";

const { array, id, object, optional, string } = v;

const cloudflareAccountResult = object({
  accountId: string(),
  accountName: string(),
});
const cloudflareWorkerResult = object({
  workerName: string(),
  workerTag: string(),
  modifiedOn: optional(string()),
});

type CloudflareAccountResult = Infer<typeof cloudflareAccountResult>;
type CloudflareActionConnection = {
  auth:
    | {
        method: "api_key";
        credential: string;
      }
    | {
        method: "mcp_oauth";
        credential: string;
        refreshCredential: string;
        credentialExpiresAt: number;
        clientId: string;
      };
  token: string;
  tokenHealth?: McpTokenHealth;
};

async function resolveCloudflareConnection(
  ctx: ActionCtx,
  userId: Id<"users">,
): Promise<CloudflareActionConnection> {
  const connection = await ctx.runAction(internal.cloudflareMcpOAuth.resolveConnectionForUser, {
    userId,
  });
  const token = connection?.auth.credential.trim();
  if (!connection || !token) {
    throw new Error("Cloudflare connection is required.");
  }

  return {
    auth: connection.auth,
    token,
    tokenHealth: connection.tokenHealth,
  };
}

async function listAccountsForConnection(token: string): Promise<CloudflareAccountResult[]> {
  return await listCloudflareAccountsForToken({
    token,
    perPage: 100,
  });
}

async function resolveAccount(ctx: ActionCtx, args: { token: string; accountId: string }) {
  const accounts = await listAccountsForConnection(args.token);
  const account = accounts.find((candidate) => candidate.accountId === args.accountId);
  if (!account) {
    throw new Error("Cloudflare account is not available for this connection.");
  }
  return account;
}

async function rememberDefaultAccount(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    auth: Awaited<ReturnType<typeof resolveCloudflareConnection>>["auth"];
    account: CloudflareAccountResult;
    tokenHealth: Awaited<ReturnType<typeof resolveCloudflareConnection>>["tokenHealth"];
  },
) {
  const now = Date.now();
  await ctx.runMutation(internal.providerConnections.upsertCloudflare, {
    userId: args.userId,
    auth: args.auth,
    defaultAccount: {
      state: "selected",
      accountId: args.account.accountId,
      accountName: args.account.accountName,
      selectedAt: now,
      lastVerifiedAt: now,
    },
    ...(args.tokenHealth ? { tokenHealth: args.tokenHealth } : {}),
  });
}

async function resolveListedWorker(args: { token: string; accountId: string; workerName: string }) {
  const workers = await listCloudflareWorkers({
    token: args.token,
    accountId: args.accountId,
    limit: 100,
  });
  const worker = workers.find((candidate) => candidate.workerName === args.workerName);
  if (!worker) {
    throw new Error(`Cloudflare Worker ${args.workerName} was not found.`);
  }
  return {
    workerName: worker.workerName,
    workerTag: worker.workerTag,
    workersDevUrl: await readOptionalWorkersDevUrl({
      token: args.token,
      accountId: args.accountId,
      workerName: worker.workerName,
    }),
  };
}

export const listAccounts = action({
  args: {},
  returns: array(cloudflareAccountResult),
  handler: async (ctx): Promise<CloudflareAccountResult[]> => {
    const userId = await getUserId(ctx);
    const connection = await resolveCloudflareConnection(ctx, userId);
    return await listAccountsForConnection(connection.token);
  },
});

export const listWorkers = action({
  args: {
    accountId: string(),
  },
  returns: object({
    account: cloudflareAccountResult,
    workers: array(cloudflareWorkerResult),
  }),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const connection = await resolveCloudflareConnection(ctx, userId);
    const account = await resolveAccount(ctx, {
      token: connection.token,
      accountId: args.accountId,
    });
    await rememberDefaultAccount(ctx, {
      userId,
      auth: connection.auth,
      account,
      tokenHealth: connection.tokenHealth,
    });
    const workers = await listCloudflareWorkers({
      token: connection.token,
      accountId: account.accountId,
      limit: 100,
    });
    return {
      account,
      workers,
    };
  },
});

export const connectExistingWorker = action({
  args: {
    vaultId: id("vaults"),
    accountId: string(),
    workerName: string(),
  },
  returns: object({
    workerName: string(),
  }),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    await ctx.runQuery(internal.vault.cloudflareMutations.requireAttachableVault, {
      vaultId: args.vaultId,
      userId,
    });
    const connection = await resolveCloudflareConnection(ctx, userId);
    const account = await resolveAccount(ctx, {
      token: connection.token,
      accountId: args.accountId,
    });
    const worker = await resolveListedWorker({
      token: connection.token,
      accountId: account.accountId,
      workerName: args.workerName,
    });
    await rememberDefaultAccount(ctx, {
      userId,
      auth: connection.auth,
      account,
      tokenHealth: connection.tokenHealth,
    });
    await ctx.runMutation(internal.vault.cloudflareMutations.attachWorker, {
      vaultId: args.vaultId,
      userId,
      accountId: account.accountId,
      accountName: account.accountName,
      workerName: worker.workerName,
      workerTag: worker.workerTag,
      workersDevUrl: worker.workersDevUrl,
      origin: "selected_existing",
      management: "external",
    });

    return {
      workerName: worker.workerName,
    };
  },
});

export const createWorker = action({
  args: {
    vaultId: id("vaults"),
    accountId: string(),
    workerName: string(),
  },
  returns: object({
    workerName: string(),
  }),
  handler: async (ctx, args) => {
    const validation = validateAppResourceName(args.workerName, "cloudflare");
    if (!validation.valid) {
      throw new Error(validation.message);
    }

    const userId = await getUserId(ctx);
    await ctx.runQuery(internal.vault.cloudflareMutations.requireAttachableVault, {
      vaultId: args.vaultId,
      userId,
    });
    const connection = await resolveCloudflareConnection(ctx, userId);
    const account = await resolveAccount(ctx, {
      token: connection.token,
      accountId: args.accountId,
    });
    // Recheck immediately before the provider write; if the final attach loses
    // the vault race, the rollback below deletes the Worker this action made.
    await ctx.runQuery(internal.vault.cloudflareMutations.requireAttachableVault, {
      vaultId: args.vaultId,
      userId,
    });
    let worker: Awaited<ReturnType<typeof createCloudflareWorker>>;
    try {
      worker = await createCloudflareWorker({
        token: connection.token,
        accountId: account.accountId,
        workerName: validation.value,
      });
    } catch (error) {
      throw new Error(toErrorMessage(error));
    }

    await rememberDefaultAccount(ctx, {
      userId,
      auth: connection.auth,
      account,
      tokenHealth: connection.tokenHealth,
    });
    try {
      await ctx.runMutation(internal.vault.cloudflareMutations.attachWorker, {
        vaultId: args.vaultId,
        userId,
        accountId: account.accountId,
        accountName: account.accountName,
        workerName: worker.workerName,
        workerTag: worker.workerTag,
        workersDevUrl: worker.workersDevUrl,
        origin: "provisioned",
        management: "managed",
      });
    } catch (error) {
      await deleteCloudflareResources({
        cloudflareToken: connection.token,
        accountId: account.accountId,
        workerName: worker.workerName,
        workerTag: worker.workerTag,
      }).catch((cleanupError: unknown) => {
        console.warn("cloudflare:create:rollback_failed", {
          accountId: account.accountId,
          workerName: worker.workerName,
          error: toErrorMessage(cleanupError),
        });
      });
      throw error;
    }

    return {
      workerName: worker.workerName,
    };
  },
});
