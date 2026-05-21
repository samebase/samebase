"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { requestCloudflareApi } from "./cloudflareApi/client";

type CloudflareAccountIdentity = {
  id?: string | null;
};

export function selectSingleCloudflareAccountId(
  accounts: readonly CloudflareAccountIdentity[],
): string {
  const accountIds: string[] = [];
  for (const account of accounts) {
    const accountId = account.id?.trim();
    if (accountId) {
      accountIds.push(accountId);
    }
  }

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
