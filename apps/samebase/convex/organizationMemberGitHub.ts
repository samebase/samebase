import { RequestError } from "@octokit/request-error";
import type { Octokit } from "@octokit/rest";

import { isRecord } from "./jsonUtils";

export type GitHubRelationship =
  | "organization_owner"
  | "organization_member"
  | "not_in_organization"
  | "github_account_not_connected"
  | "owner_account"
  | "different_account"
  | "unavailable";

export type GitHubInvitationTarget = {
  expectedGithubAccountId: string;
  githubLogin: string;
  githubAvatarUrl?: string;
};

const GITHUB_LOGIN_MAX_LENGTH = 39;

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

function requireProviderLogin(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("GitHub returned an invalid user login.");
  }
  return value.trim();
}

export function parseGitHubInvitationTarget(value: unknown): GitHubInvitationTarget {
  if (!isRecord(value)) {
    throw new Error("GitHub returned an invalid user profile.");
  }
  if (value["type"] !== "User") {
    throw new Error("Only a GitHub user can be invited.");
  }

  const githubAvatarUrl = value["avatar_url"];
  if (
    githubAvatarUrl !== null &&
    githubAvatarUrl !== undefined &&
    (typeof githubAvatarUrl !== "string" || githubAvatarUrl.trim().length === 0)
  ) {
    throw new Error("GitHub returned an invalid user avatar URL.");
  }
  if (typeof githubAvatarUrl === "string") {
    let parsedAvatarUrl: URL;
    try {
      parsedAvatarUrl = new URL(githubAvatarUrl);
    } catch {
      throw new Error("GitHub returned an invalid user avatar URL.");
    }
    if (parsedAvatarUrl.protocol !== "https:") {
      throw new Error("GitHub returned an invalid user avatar URL.");
    }
  }

  return {
    expectedGithubAccountId: requireProviderPositiveSafeInteger(value["id"], "user ID"),
    githubLogin: requireProviderLogin(value["login"]),
    ...(typeof githubAvatarUrl === "string" ? { githubAvatarUrl: githubAvatarUrl.trim() } : {}),
  };
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
  const response = await octokit.request("GET /users/{username}", { username: normalizedLogin });
  return parseGitHubInvitationTarget(response.data);
}

export async function readGitHubUserByAccountId(
  octokit: Octokit,
  githubAccountId: string,
): Promise<GitHubInvitationTarget> {
  const response = await octokit.request("GET /user/{account_id}", {
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
  const response = await fetch(
    `https://api.github.com/users/${encodeURIComponent(normalizedLogin)}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "samebase-app",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (response.status === 404) {
    throw new Error("GitHub user not found.");
  }
  if (!response.ok) {
    throw new Error("GitHub user lookup is unavailable.");
  }
  return parseGitHubInvitationTarget(await response.json());
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
