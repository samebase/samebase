"use node";

import { v } from "convex/values";

import { internalAction } from "./_generated/server";
import { createCloudflareClient, type CloudflareApiTransport } from "./cloudflareApi/client";
import { Cloudflare } from "./cloudflareApi/generated/sdk.gen";
import type { IamAccount } from "./cloudflareApi/generated/types.gen";

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

export function resolveCloudflareAccountAfterAuthorization(
  normalizedAccounts: readonly CloudflareAccount[],
  currentAccount: CloudflareAccount | undefined,
): CloudflareAccount | null {
  if (normalizedAccounts.length !== 1) {
    return null;
  }
  const [account] = normalizedAccounts;
  return currentAccount === undefined || account.accountId === currentAccount.accountId
    ? account
    : null;
}

export async function listCloudflareAccountsForToken(args: {
  token: string;
  transport: CloudflareApiTransport;
}): Promise<CloudflareAccount[]> {
  const { result: accounts } = await Cloudflare.GET["/accounts"]({
    client: createCloudflareClient({ token: args.token, transport: args.transport }),
    query: {
      page: 1,
      per_page: 5,
    },
  });
  if (!accounts) {
    throw new Error("Cloudflare account response did not include accounts.");
  }
  return normalizeCloudflareAccounts(accounts);
}

/** Verify the user token required by Workers Builds, then return its direct-API accounts. */
export const listAccountsForUserApiToken = internalAction({
  args: {
    token: v.string(),
  },
  returns: v.array(vCloudflareAccount),
  handler: async (_ctx, args) => {
    const { result: verification } = await Cloudflare.GET["/user/tokens/verify"]({
      client: createCloudflareClient({ token: args.token, transport: "direct" }),
    });
    if (!verification?.id.trim() || verification.status !== "active") {
      throw new Error("Cloudflare API token is not active.");
    }
    return await listCloudflareAccountsForToken({
      token: args.token,
      transport: "direct",
    });
  },
});
