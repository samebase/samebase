"use node";

import { notEmpty } from "@samebase/dependent/main";
import { v } from "convex/values";

import { internalAction } from "./_generated/server";
import { requestCloudflareApi, type CloudflareApiTransport } from "./cloudflareApi/client";

const vCloudflareApiTransport = v.union(v.literal("mcp"), v.literal("direct"));

type CloudflareAccountIdentity = {
  id?: string | null;
  name?: string | null;
};

export type CloudflareAccount = {
  accountId: string;
  accountName: string;
};

export const vCloudflareAccount = v.object({
  accountId: v.string(),
  accountName: v.string(),
});

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
  const normalizedAccounts = accounts.map(readCloudflareAccount).filter(notEmpty);

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
  if (currentAccount === undefined) {
    return selectSingleCloudflareAccount(normalizedAccounts);
  }
  const selectedAccount = normalizedAccounts.find(
    (account) => account.accountId === currentAccount.accountId,
  );
  if (selectedAccount === undefined) {
    throw new Error("The new Cloudflare authorization cannot access the connected account.");
  }
  return selectedAccount;
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
