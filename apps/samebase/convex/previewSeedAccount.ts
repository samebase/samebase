import type { Octokit } from "@octokit/rest";
import { v } from "convex/values";

import { normalizeAccountEmail } from "../shared/accountPresentation";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { env, internalQuery, type ActionCtx, type DatabaseReader } from "./_generated/server";
import { resolveDeploymentProfile } from "./deploymentProfile";
import {
  createGitHubUserOctokit,
  discoverPreviewSeedGitHubAppInstallations,
  type PreviewSeedGitHubAppInstallation,
} from "./githubApp";
import { readOptionalEnv } from "./oauthUtils";

const { boolean, id } = v;

export const PREVIEW_SEED_PERSONAL_GITHUB_OWNER_LOGIN = "nicu-chiciuc";

export async function isPreviewSeedUser(db: DatabaseReader, userId: Id<"users">): Promise<boolean> {
  if (resolveDeploymentProfile().kind !== "preview") {
    return false;
  }
  const seedEmail = readOptionalEnv("DEV_SEED_AUTH_EMAIL");
  if (seedEmail === null || readOptionalEnv("DEV_SEED_AUTH_PASSWORD") === null) {
    return false;
  }
  const email = normalizeAccountEmail(seedEmail);
  const passwordAccounts = await db
    .query("authAccounts")
    .withIndex("providerAndAccountId", (query) =>
      query.eq("provider", "password").eq("providerAccountId", email),
    )
    .take(2);
  return passwordAccounts.length === 1 && passwordAccounts[0].userId === userId;
}

export const matchesUser = internalQuery({
  args: { userId: id("users") },
  returns: boolean(),
  handler: async (ctx, args) => await isPreviewSeedUser(ctx.db, args.userId),
});

function readPreviewSeedGitHubApiKey(): string {
  const apiKey = env.DEV_SEED_GITHUB_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("DEV_SEED_GITHUB_API_KEY is required for preview GitHub access.");
  }
  return apiKey;
}

export async function resolvePreviewSeedGitHubInstallations(
  ctx: Pick<ActionCtx, "runQuery">,
  userId: Id<"users">,
): Promise<PreviewSeedGitHubAppInstallation[] | null> {
  const previewSeedUser = await ctx.runQuery(internal.previewSeedAccount.matchesUser, { userId });
  if (!previewSeedUser) {
    return null;
  }
  return await discoverPreviewSeedGitHubAppInstallations(readPreviewSeedGitHubApiKey());
}

export async function resolvePreviewSeedGitHubUserOctokit(
  ctx: Pick<ActionCtx, "runQuery">,
  args: { userId: Id<"users">; githubUserId: string },
): Promise<Octokit | null> {
  const installations = await resolvePreviewSeedGitHubInstallations(ctx, args.userId);
  if (installations === null) {
    return null;
  }
  const personalInstallation = installations.find(
    (installation) =>
      installation.githubOwnerType === "user" &&
      installation.githubOwnerId === args.githubUserId &&
      installation.githubOwnerLogin.trim().toLowerCase() ===
        PREVIEW_SEED_PERSONAL_GITHUB_OWNER_LOGIN,
  );
  if (personalInstallation === undefined) {
    throw new Error("Preview GitHub access does not match the personal repository owner.");
  }
  return createGitHubUserOctokit(readPreviewSeedGitHubApiKey());
}
