import { Infer, v } from "convex/values";

const { literal, number, object, union } = v;

export const vAuthAccountProvider = union(literal("google"), literal("github"));
export type AuthAccountProvider = Infer<typeof vAuthAccountProvider>;

/** The account-linking intent that a Convex Auth 0.0.x session document can carry. */
export const vAuthAccountLinkIntent = object({
  provider: vAuthAccountProvider,
  expiresAt: number(),
});
