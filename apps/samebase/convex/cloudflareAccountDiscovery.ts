"use node";

import { notEmpty } from "@samebase/dependent/main";
import { v } from "convex/values";

import { internalAction } from "./_generated/server";
import { requestCloudflareApi, type CloudflareApiTransport } from "./cloudflareApi/client";
import { vCloudflareDefaultAccount } from "./providerConnectionModel";

const vCloudflareApiTransport = v.union(v.literal("mcp"), v.literal("direct"));

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
  const normalizedAccounts = accounts.map(readCloudflareAccount).filter(notEmpty);

  return normalizedAccounts.sort(
    (left, right) =>
      left.accountName.localeCompare(right.accountName) ||
      left.accountId.localeCompare(right.accountId),
  );
}

export function selectSingleCloudflareDefaultAccount(
  normalizedAccounts: readonly CloudflareAccount[],
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
  };
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

export const resolveDefaultAccountForToken = internalAction({
  args: {
    token: v.string(),
    transport: vCloudflareApiTransport,
  },
  returns: vCloudflareDefaultAccount,
  handler: async (_ctx, args) => {
    const accounts = await listCloudflareAccountsForToken({
      token: args.token,
      transport: args.transport,
      perPage: 2,
    });
    return selectSingleCloudflareDefaultAccount(accounts);
  },
});
