"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { requestCloudflareApi } from "./cloudflareApi/client";
import { vCloudflareDefaultAccount } from "./schema";

type CloudflareAccountIdentity = {
  id?: string | null;
  name?: string | null;
};

export type CloudflareAccount = {
  accountId: string;
  accountName: string;
};

function readCloudflareAccount(account: CloudflareAccountIdentity): CloudflareAccount | null {
  const accountId = account.id?.trim();
  if (!accountId) {
    return null;
  }

  const accountName = account.name?.trim();
  return {
    accountId,
    accountName: accountName ? accountName : accountId,
  };
}

export function normalizeCloudflareAccounts(
  accounts: readonly CloudflareAccountIdentity[],
): CloudflareAccount[] {
  const normalizedAccounts: CloudflareAccount[] = [];
  for (const account of accounts) {
    const normalizedAccount = readCloudflareAccount(account);
    if (normalizedAccount) {
      normalizedAccounts.push(normalizedAccount);
    }
  }

  return normalizedAccounts.sort(
    (left, right) =>
      left.accountName.localeCompare(right.accountName) ||
      left.accountId.localeCompare(right.accountId),
  );
}

export function selectSingleCloudflareAccountId(
  accounts: readonly CloudflareAccountIdentity[],
): string {
  const accountIds = normalizeCloudflareAccounts(accounts).map((account) => account.accountId);

  const [accountId] = accountIds;
  if (!accountId) {
    throw new Error(
      "Cloudflare OAuth did not expose any accounts. Reconnect Cloudflare and grant account access.",
    );
  }
  if (accountIds.length > 1) {
    throw new Error(
      "Cloudflare OAuth exposed multiple accounts. Account selection is not supported yet.",
    );
  }
  return accountId;
}

export function selectSingleCloudflareDefaultAccount(
  normalizedAccounts: readonly CloudflareAccount[],
  now: number,
) {
  if (normalizedAccounts.length === 0) {
    throw new Error(
      "Cloudflare OAuth did not expose any accounts. Reconnect Cloudflare and grant account access.",
    );
  }
  if (normalizedAccounts.length > 1) {
    return { state: "not_selected" as const };
  }

  const [account] = normalizedAccounts;
  return {
    state: "selected" as const,
    accountId: account.accountId,
    accountName: account.accountName,
    selectedAt: now,
    lastVerifiedAt: now,
  };
}

export async function listCloudflareAccountsForToken(args: {
  token: string;
  perPage: number;
}): Promise<CloudflareAccount[]> {
  const accounts = await requestCloudflareApi({
    token: args.token,
    method: "GET",
    path: "/accounts",
    params: {
      query: {
        page: 1,
        per_page: args.perPage,
      },
    },
  });
  if (!accounts) {
    throw new Error("Cloudflare account response did not include accounts.");
  }
  return normalizeCloudflareAccounts(accounts);
}

export const listAccountsForToken = internalAction({
  args: {
    token: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      accountId: v.string(),
      accountName: v.string(),
    }),
  ),
  handler: async (_ctx, args) => {
    const limit = Math.min(Math.max(Math.floor(args.limit ?? 50), 1), 100);
    return await listCloudflareAccountsForToken({
      token: args.token,
      perPage: limit,
    });
  },
});

export const resolveDefaultAccountForToken = internalAction({
  args: {
    token: v.string(),
  },
  returns: vCloudflareDefaultAccount,
  handler: async (_ctx, args) => {
    const accounts = await listCloudflareAccountsForToken({
      token: args.token,
      perPage: 2,
    });
    return selectSingleCloudflareDefaultAccount(accounts, Date.now());
  },
});

export const resolveSingleAccountIdForToken = internalAction({
  args: {
    token: v.string(),
  },
  returns: v.string(),
  handler: async (_ctx, args) => {
    const accounts = await requestCloudflareApi({
      token: args.token,
      method: "GET",
      path: "/accounts",
      params: {
        query: {
          page: 1,
          per_page: 2,
        },
      },
    });
    if (!accounts) {
      throw new Error("Cloudflare account response did not include accounts.");
    }
    return selectSingleCloudflareAccountId(accounts);
  },
});
