import { v } from "convex/values";

const { id, number, object, string } = v;

export const vGitHubObservationActionLease = object({
  userId: id("users"),
  vaultId: id("vaults"),
  leaseGroupId: string(),
  expiresAt: number(),
});
