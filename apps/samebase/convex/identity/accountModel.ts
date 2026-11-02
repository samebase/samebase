import { Infer, v } from "convex/values";

const { literal, union } = v;

export const vAuthAccountProvider = union(literal("google"), literal("github"));
export type AuthAccountProvider = Infer<typeof vAuthAccountProvider>;
