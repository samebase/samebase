"use node";

import { v } from "convex/values";

import * as accounts from "@distilled.cloud/cloudflare/accounts";
import * as user from "@distilled.cloud/cloudflare/user";

import { internalAction } from "./_generated/server";
import { runCloudflare } from "./cloudflareApi";

type CloudflareAccountIdentity = { id: string; name: string };

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

export async function listCloudflareAccountsForToken(token: string): Promise<CloudflareAccount[]> {
  const { result } = await runCloudflare(token, accounts.listAccounts({ page: 1, perPage: 5 }));
  return normalizeCloudflareAccounts(result);
}

/** Verify a user API token with GET /user/tokens/verify, then return its direct-API accounts. */
export async function listAccountsForVerifiedUserApiToken(
  token: string,
): Promise<CloudflareAccount[]> {
  const verification = await runCloudflare(token, user.verifyToken({}));
  if (!verification.id.trim() || verification.status !== "active") {
    throw new Error("Cloudflare API token is not active.");
  }
  return await listCloudflareAccountsForToken(token);
}

/** Verify the user token required by Workers Builds, then return its direct-API accounts. */
export const listAccountsForUserApiToken = internalAction({
  args: {
    token: v.string(),
  },
  returns: v.array(vCloudflareAccount),
  handler: async (_ctx, args) => await listAccountsForVerifiedUserApiToken(args.token),
});
