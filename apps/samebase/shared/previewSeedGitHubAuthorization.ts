import { array, literal, number, object, string, union, type InferGood } from "@samebase/sure";
import { normalizeAccountEmail } from "./accountPresentation.ts";

export const PREVIEW_SEED_GITHUB_USER_AUTHORIZATION_ENV_NAME =
  "PREVIEW_SEED_GITHUB_USER_AUTHORIZATION";

const previewSeedConnectedGitHubOrganizationSchema = object({
  githubInstallationId: string,
  githubOwnerId: string,
  githubOwnerType: union(literal("organization"), literal("user")),
  githubOwnerLogin: string,
});

const previewSeedGitHubUserAuthorizationSchema = object({
  version: literal(2),
  githubUserId: string,
  githubUserLogin: string,
  githubUserEmail: string,
  accessToken: string,
  accessTokenExpiresAt: number,
  refreshToken: string,
  refreshTokenExpiresAt: number,
  connectedOrganizations: array(previewSeedConnectedGitHubOrganizationSchema),
});

export type PreviewSeedGitHubUserAuthorization = InferGood<
  typeof previewSeedGitHubUserAuthorizationSchema
>;

function requireUnpaddedValue(value: string, label: string): void {
  if (!value || value !== value.trim()) {
    throw new Error(`Preview seed ${label} is invalid.`);
  }
}

function requireGitHubId(value: string, label: string): void {
  if (!/^\d+$/.test(value)) {
    throw new Error(`Preview seed ${label} is invalid.`);
  }
}

function requireTimestamp(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Preview seed ${label} is invalid.`);
  }
}

export function parsePreviewSeedGitHubUserAuthorization(
  serialized: string,
): PreviewSeedGitHubUserAuthorization {
  let input: unknown;
  try {
    input = JSON.parse(serialized);
  } catch {
    throw new Error("Preview seed GitHub user authorization is not valid JSON.");
  }

  const [valid, authorization] = previewSeedGitHubUserAuthorizationSchema(input);
  if (!valid) {
    throw new Error("Preview seed GitHub user authorization has an invalid shape.");
  }

  requireGitHubId(authorization.githubUserId, "GitHub user ID");
  requireUnpaddedValue(authorization.githubUserLogin, "GitHub user login");
  if (normalizeAccountEmail(authorization.githubUserEmail) !== authorization.githubUserEmail) {
    throw new Error("Preview seed GitHub user email is invalid.");
  }
  requireUnpaddedValue(authorization.accessToken, "GitHub access token");
  requireTimestamp(authorization.accessTokenExpiresAt, "GitHub access token expiry");
  if (authorization.accessTokenExpiresAt <= Date.now()) {
    throw new Error("Preview seed GitHub access token has expired.");
  }
  requireUnpaddedValue(authorization.refreshToken, "GitHub refresh token");
  requireTimestamp(authorization.refreshTokenExpiresAt, "GitHub refresh token expiry");
  if (authorization.refreshTokenExpiresAt <= authorization.accessTokenExpiresAt) {
    throw new Error("Preview seed GitHub refresh token expiry is invalid.");
  }
  if (authorization.connectedOrganizations.length === 0) {
    throw new Error("Preview seed must connect at least one GitHub organization.");
  }

  const ownerIds = new Set<string>();
  const installationIds = new Set<string>();
  for (const organization of authorization.connectedOrganizations) {
    requireGitHubId(organization.githubOwnerId, "GitHub owner ID");
    requireGitHubId(organization.githubInstallationId, "GitHub installation ID");
    requireUnpaddedValue(organization.githubOwnerLogin, "GitHub owner login");
    if (ownerIds.has(organization.githubOwnerId)) {
      throw new Error("Preview seed GitHub owner IDs must be unique.");
    }
    if (installationIds.has(organization.githubInstallationId)) {
      throw new Error("Preview seed GitHub installation IDs must be unique.");
    }
    ownerIds.add(organization.githubOwnerId);
    installationIds.add(organization.githubInstallationId);
  }

  return authorization;
}
