import { RequestError } from "@octokit/request-error";
import { Octokit } from "@octokit/rest";
import { z } from "zod";

import { isRecord } from "./jsonUtils";

export type GitHubRelationship =
  | "organization_owner"
  | "organization_member"
  | "not_in_organization"
  | "github_account_not_connected"
  | "owner_account"
  | "different_account"
  | "unavailable";

const GITHUB_LOGIN_MAX_LENGTH = 39;
const INVALID_GITHUB_AVATAR_URL = "GitHub returned an invalid user avatar URL.";

const githubInvitationTargetSchema = z
  .object(
    {
      id: z
        .number("GitHub returned an invalid user ID.")
        .int("GitHub returned an invalid user ID.")
        .positive("GitHub returned an invalid user ID."),
      login: z
        .string("GitHub returned an invalid user login.")
        .trim()
        .min(1, "GitHub returned an invalid user login."),
      type: z.literal("User", "Only a GitHub user can be invited."),
      avatar_url: z
        .string(INVALID_GITHUB_AVATAR_URL)
        .trim()
        .min(1, INVALID_GITHUB_AVATAR_URL)
        .pipe(z.url(INVALID_GITHUB_AVATAR_URL))
        .refine((value) => new URL(value).protocol === "https:", INVALID_GITHUB_AVATAR_URL)
        .nullable()
        .optional(),
    },
    "GitHub returned an invalid user profile.",
  )
  .transform(({ id, login, avatar_url: avatarUrl }) => ({
    expectedGithubAccountId: String(id),
    githubLogin: login,
    ...(avatarUrl ? { githubAvatarUrl: avatarUrl } : {}),
  }));

export type GitHubInvitationTarget = z.infer<typeof githubInvitationTargetSchema>;

const publicGitHubOctokit = new Octokit({ userAgent: "samebase-app" });

function normalizeGitHubLogin(githubLogin: string): string {
  const normalizedLogin = githubLogin.trim();
  if (normalizedLogin.length === 0) {
    throw new Error("GitHub username is required.");
  }
  if (normalizedLogin.length > GITHUB_LOGIN_MAX_LENGTH) {
    throw new Error(`GitHub username must be ${GITHUB_LOGIN_MAX_LENGTH} characters or fewer.`);
  }
  return normalizedLogin;
}

function requireProviderPositiveSafeInteger(value: unknown, label: string): string {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`GitHub returned an invalid ${label}.`);
  }
  return String(value);
}

export function parseGitHubInvitationTarget(value: unknown) {
  return githubInvitationTargetSchema.parse(value);
}

export function parseGitHubOrganizationRelationship(
  value: unknown,
  expected: {
    githubOrganizationId: string;
    githubAccountId: string;
  },
): GitHubRelationship {
  if (!isRecord(value) || !isRecord(value["organization"]) || !isRecord(value["user"])) {
    throw new Error("GitHub returned an invalid organization membership.");
  }

  const githubOrganizationId = requireProviderPositiveSafeInteger(
    value["organization"]["id"],
    "organization ID",
  );
  const githubAccountId = requireProviderPositiveSafeInteger(value["user"]["id"], "member ID");
  if (
    githubOrganizationId !== expected.githubOrganizationId ||
    githubAccountId !== expected.githubAccountId
  ) {
    throw new Error("GitHub organization membership did not match the requested identities.");
  }
  if (value["state"] === "pending") {
    return "not_in_organization";
  }
  if (value["state"] !== "active") {
    throw new Error("GitHub returned an invalid organization membership state.");
  }
  if (value["role"] === "admin") {
    return "organization_owner";
  }
  if (value["role"] === "member" || value["role"] === "billing_manager") {
    return "organization_member";
  }
  throw new Error("GitHub returned an invalid organization membership role.");
}

export async function readGitHubUserByLogin(
  octokit: Octokit,
  githubLogin: string,
): Promise<GitHubInvitationTarget> {
  const normalizedLogin = normalizeGitHubLogin(githubLogin);
  const response = await octokit.rest.users.getByUsername({ username: normalizedLogin });
  return parseGitHubInvitationTarget(response.data);
}

export async function readGitHubUserByAccountId(
  octokit: Octokit,
  githubAccountId: string,
): Promise<GitHubInvitationTarget> {
  const response = await octokit.rest.users.getById({
    account_id: Number(githubAccountId),
  });
  const target = parseGitHubInvitationTarget(response.data);
  if (target.expectedGithubAccountId !== githubAccountId) {
    throw new Error("GitHub user lookup did not match the requested identity.");
  }
  return target;
}

export async function readPublicGitHubUserByLogin(
  githubLogin: string,
): Promise<GitHubInvitationTarget> {
  const normalizedLogin = normalizeGitHubLogin(githubLogin);
  const response = await publicGitHubOctokit.rest.users
    .getByUsername({
      username: normalizedLogin,
      headers: {
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
      },
    })
    .catch((error: unknown) => {
      if (error instanceof RequestError && error.status === 404) {
        throw new Error("GitHub user not found.");
      }
      throw new Error("GitHub user lookup is unavailable.");
    });
  return parseGitHubInvitationTarget(response.data);
}

export async function readGitHubOrganizationRelationship(
  octokit: Octokit,
  args: {
    githubOrganizationId: string;
    githubOrganizationLogin: string;
    githubAccountId: string;
    githubLogin: string;
  },
): Promise<GitHubRelationship> {
  try {
    const response = await octokit.request("GET /orgs/{org}/memberships/{username}", {
      org: args.githubOrganizationLogin,
      username: args.githubLogin,
    });
    return parseGitHubOrganizationRelationship(response.data, {
      githubOrganizationId: args.githubOrganizationId,
      githubAccountId: args.githubAccountId,
    });
  } catch (error) {
    if (error instanceof RequestError && error.status === 404) {
      return "not_in_organization";
    }
    return "unavailable";
  }
}
