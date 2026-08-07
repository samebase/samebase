"use node";

import { v } from "convex/values";

import { internalAction } from "./_generated/server";
import { requestCloudflareApi, type CloudflareApiTransport } from "./cloudflareApi/client";
import type { IamAccount } from "./cloudflareApi/types.generated";

const vCloudflareApiTransport = v.union(v.literal("mcp"), v.literal("direct"));

type CloudflareAccountIdentity = Pick<IamAccount, "id" | "name">;

export type CloudflareAccount = {
  accountId: string;
  accountName: string;
};

export const vCloudflareAccount = v.object({
  accountId: v.string(),
  accountName: v.string(),
});

export function normalizeCloudflareAccounts(
  accounts: readonly CloudflareAccountIdentity[],
): CloudflareAccount[] {
  const normalizedAccounts = accounts.map((account) => {
    const accountId = account.id.trim();
    if (!accountId) {
      throw new Error("Cloudflare account response included an account without an ID.");
    }

    const accountName = account.name.trim();
    if (!accountName) {
      throw new Error("Cloudflare account response included an account without a name.");
    }

    return { accountId, accountName };
  });

  return normalizedAccounts.sort(
    (left, right) =>
      left.accountName.localeCompare(right.accountName) ||
      left.accountId.localeCompare(right.accountId),
  );
}

export function selectSingleCloudflareAccount(
  normalizedAccounts: readonly CloudflareAccount[],
): CloudflareAccount | null {
  if (normalizedAccounts.length === 0) {
    throw new Error(
      "Cloudflare OAuth did not expose any accounts. Reconnect Cloudflare and grant account access.",
    );
  }
  if (normalizedAccounts.length > 1) {
    return null;
  }

  const [account] = normalizedAccounts;
  return account;
}

export function resolveCloudflareAccountAfterAuthorization(
  normalizedAccounts: readonly CloudflareAccount[],
  currentAccount: CloudflareAccount | undefined,
): CloudflareAccount | null {
  if (normalizedAccounts.length > 1) {
    return null;
  }
  if (currentAccount === undefined) {
    return selectSingleCloudflareAccount(normalizedAccounts);
  }
  const selectedAccount = normalizedAccounts.find(
    (account) => account.accountId === currentAccount.accountId,
  );
  return selectedAccount ?? null;
}

export async function listCloudflareAccountsForToken(args: {
  token: string;
  perPage: number;
  transport: CloudflareApiTransport;
}): Promise<CloudflareAccount[]> {
  const accounts = await requestCloudflareApi({
    token: args.token,
    transport: args.transport,
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

export const listAccounts = internalAction({
  args: {
    token: v.string(),
    transport: vCloudflareApiTransport,
  },
  returns: v.array(vCloudflareAccount),
  handler: async (_ctx, args) => {
    return await listCloudflareAccountsForToken({ ...args, perPage: 100 });
  },
});
