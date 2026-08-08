import { Infer, v } from "convex/values";

const { literal, number, object, union } = v;

export const AUTH_ACCOUNT_LINK_INTENT_DURATION_MS = 5 * 60 * 1000;

export const vAuthAccountProvider = union(literal("google"), literal("github"));
export type AuthAccountProvider = Infer<typeof vAuthAccountProvider>;

export const vAuthAccountLinkIntent = object({
  provider: vAuthAccountProvider,
  expiresAt: number(),
});
