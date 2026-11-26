import { Infer, v } from "convex/values";

const { literal, union } = v;

export const vAuthAccountProvider = union(literal("google"), literal("github"));
export type AuthAccountProvider = Infer<typeof vAuthAccountProvider>;

// The Convex Auth provider ids of the broker's sign-in methods. Each user's account row stores them.
export const BROKER_GITHUB_ACCOUNT_PROVIDER_ID = "hub-github" as const;
export const BROKER_GOOGLE_ACCOUNT_PROVIDER_ID = "hub-google" as const;
