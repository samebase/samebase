import {
  createAppAuth,
  createOAuthUserAuth,
  type GitHubAppUserAuthentication,
  type GitHubAppUserAuthenticationWithExpiration,
} from "@octokit/auth-app";
import { RequestError } from "@octokit/request-error";
import { Octokit } from "@octokit/rest";

import { isRecord } from "./jsonUtils";
import { env } from "./_generated/server";

const GITHUB_PAGE_SIZE = 100;
const MAX_GITHUB_PAGES = 100;

export type GitHubAppConfiguration = {
  appId: number;
  appSlug: string;
  clientId: string;
  clientSecret: string;
  privateKey: string;
  oauthCallbackUrl: string;
};

export type ExpiringGitHubUserAuthentication = {
  accessToken: string;
  accessTokenExpiresAt: number;
  refreshToken: string;
  refreshTokenExpiresAt: number;
};

export type VerifiedGitHubUserAuthorization = ExpiringGitHubUserAuthentication & {
  githubUserId: string;
  githubUserLogin: string;
};

export type PreviewSeedGitHubAppInstallation = {
  githubInstallationId: string;
  githubOwnerId: string;
  githubOwnerType: "organization" | "user";
  githubOwnerLogin: string;
};

export type GitHubAppConnectionInstallation = {
  installationId: string;
  githubOwnerId: string;
  githubOwnerType: "organization" | "user";
  githubOwnerLogin: string;
  canManage: boolean;
};

function requireTrimmed(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${label} is required.`);
  }
  return trimmed;
}

function requirePositiveSafeInteger(value: string, label: string): number {
  const normalized = requireTrimmed(value, label);
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${label} must be a positive integer.`);
  }

  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return parsed;
}

function requireProviderPositiveSafeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`GitHub returned an invalid ${label}.`);
  }
  return value;
}

function requireProviderTimestamp(value: string, label: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`GitHub returned an invalid ${label}.`);
  }
  return timestamp;
}

export function getGitHubAppConfiguration(): GitHubAppConfiguration {
  const oauthCallbackUrl = requireTrimmed(
    env.GITHUB_APP_OAUTH_CALLBACK_URL,
    "GitHub App OAuth callback URL",
  );
  try {
    new URL(oauthCallbackUrl);
  } catch {
    throw new Error("GitHub App OAuth callback URL must be an absolute URL.");
  }

  return {
    appId: requirePositiveSafeInteger(env.GITHUB_APP_ID, "GitHub App ID"),
    appSlug: requireTrimmed(env.GITHUB_APP_SLUG, "GitHub App slug"),
    clientId: requireTrimmed(env.GITHUB_APP_CLIENT_ID, "GitHub App client ID"),
    clientSecret: requireTrimmed(env.GITHUB_APP_CLIENT_SECRET, "GitHub App client secret"),
    privateKey: requireTrimmed(env.GITHUB_APP_PRIVATE_KEY, "GitHub App private key"),
    oauthCallbackUrl,
  };
}

function createGitHubAppOctokit(configuration: GitHubAppConfiguration): Octokit {
  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: configuration.appId,
      privateKey: configuration.privateKey,
    },
    userAgent: "samebase-app",
  });
}

export function createGitHubInstallationOctokit(installationId: string): Octokit {
  const configuration = getGitHubAppConfiguration();
  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: configuration.appId,
      privateKey: configuration.privateKey,
      installationId: requirePositiveSafeInteger(installationId, "GitHub installation ID"),
    },
    userAgent: "samebase-app",
  });
}

export function createGitHubUserOctokit(accessToken: string): Octokit {
  return new Octokit({
    auth: requireTrimmed(accessToken, "GitHub user access token"),
    userAgent: "samebase-app",
  });
}

/** Revoke one uncommitted GitHub App user token without deleting the user's full App grant. */
export async function revokeGitHubAppUserToken(accessToken: string): Promise<void> {
  const configuration = getGitHubAppConfiguration();
  const auth = createOAuthUserAuth({
    clientType: "github-app",
    clientId: configuration.clientId,
    clientSecret: configuration.clientSecret,
    token: requireTrimmed(accessToken, "GitHub user access token"),
  });
  await auth({ type: "delete" });
}

export function requireExpiringGitHubUserAuthentication(
  authentication: GitHubAppUserAuthentication | GitHubAppUserAuthenticationWithExpiration,
): ExpiringGitHubUserAuthentication {
  if (!("refreshToken" in authentication)) {
    throw new Error("GitHub App user token expiration must be enabled.");
  }

  const accessToken = requireTrimmed(authentication.token, "GitHub user access token");
  const refreshToken = requireTrimmed(authentication.refreshToken, "GitHub user refresh token");
  const accessTokenExpiresAt = requireProviderTimestamp(
    authentication.expiresAt,
    "user access token expiry",
  );
  const refreshTokenExpiresAt = requireProviderTimestamp(
    authentication.refreshTokenExpiresAt,
    "user refresh token expiry",
  );
  if (accessTokenExpiresAt <= Date.now() || refreshTokenExpiresAt <= accessTokenExpiresAt) {
    throw new Error("GitHub returned unusable user token expiry values.");
  }

  return {
    accessToken,
    accessTokenExpiresAt,
    refreshToken,
    refreshTokenExpiresAt,
  };
}

async function exchangeGitHubAppUserCode(args: {
  code: string;
  state: string;
  configuration: GitHubAppConfiguration;
}): Promise<ExpiringGitHubUserAuthentication> {
  const auth = createAppAuth({
    appId: args.configuration.appId,
    privateKey: args.configuration.privateKey,
    clientId: args.configuration.clientId,
    clientSecret: args.configuration.clientSecret,
  });
  const authentication = await auth({
    type: "oauth-user",
    code: requireTrimmed(args.code, "GitHub OAuth code"),
    state: requireTrimmed(args.state, "GitHub OAuth state"),
    redirectUrl: args.configuration.oauthCallbackUrl,
  });
  return requireExpiringGitHubUserAuthentication(authentication);
}

async function verifyGitHubUserAuthorizationWithConfiguration(args: {
  code: string;
  state: string;
  configuration: GitHubAppConfiguration;
}): Promise<VerifiedGitHubUserAuthorization> {
  const authentication = await exchangeGitHubAppUserCode(args);
  const userOctokit = createGitHubUserOctokit(authentication.accessToken);
  const userResponse = await userOctokit.request("GET /user");
  const user = parseAuthenticatedGitHubUser(userResponse.data);
  return { ...authentication, ...user };
}

export async function verifyGitHubUserAuthorization(args: {
  code: string;
  state: string;
}): Promise<VerifiedGitHubUserAuthorization> {
  return await verifyGitHubUserAuthorizationWithConfiguration({
    ...args,
    configuration: getGitHubAppConfiguration(),
  });
}

function parseAuthenticatedGitHubUser(value: unknown): {
  githubUserId: string;
  githubUserLogin: string;
} {
  if (!isRecord(value)) {
    throw new Error("GitHub returned an invalid user profile.");
  }

  const githubUserId = requireProviderPositiveSafeInteger(value["id"], "user ID");
  if (typeof value["login"] !== "string" || value["login"].trim().length === 0) {
    throw new Error("GitHub returned an invalid user login.");
  }

  return {
    githubUserId: String(githubUserId),
    githubUserLogin: value["login"].trim(),
  };
}

function parseGitHubInstallation(value: unknown) {
  if (!isRecord(value) || !isRecord(value["account"])) {
    throw new Error("GitHub returned an invalid installation.");
  }

  const installationId = requireProviderPositiveSafeInteger(value["id"], "installation ID");
  const appId = requireProviderPositiveSafeInteger(value["app_id"], "installation App ID");
  const githubOwnerId = requireProviderPositiveSafeInteger(value["account"]["id"], "owner ID");
  if (
    typeof value["account"]["login"] !== "string" ||
    value["account"]["login"].trim().length === 0
  ) {
    throw new Error("GitHub returned an invalid installation owner login.");
  }

  let githubOwnerType: "organization" | "user";
  if (value["account"]["type"] === "Organization") {
    githubOwnerType = "organization";
  } else if (value["account"]["type"] === "User") {
    githubOwnerType = "user";
  } else {
    throw new Error("GitHub returned an unsupported installation owner type.");
  }

  if (!isRecord(value["permissions"])) {
    throw new Error("GitHub returned invalid installation permissions.");
  }
  const permissions = Object.entries(value["permissions"])
    .map(([key, access]) => {
      if (!/^[a-z][a-z0-9_]*$/.test(key) || (access !== "read" && access !== "write")) {
        throw new Error("GitHub returned invalid installation permissions.");
      }
      return { access, key } as const;
    })
    .sort((left, right) => left.key.localeCompare(right.key));

  const repositorySelection = value["repository_selection"];
  if (repositorySelection !== "all" && repositorySelection !== "selected") {
    throw new Error("GitHub returned an invalid installation repository selection.");
  }

  return {
    installationId: String(installationId),
    appId,
    githubOwnerId: String(githubOwnerId),
    githubOwnerType,
    githubOwnerLogin: value["account"]["login"].trim(),
    permissions,
    repositorySelection,
    suspended: value["suspended_at"] !== null && value["suspended_at"] !== undefined,
  } as const;
}

export async function readGitHubAppInstallation(installationId: string) {
  const configuration = getGitHubAppConfiguration();
  const expectedInstallationId = requirePositiveSafeInteger(
    installationId,
    "GitHub installation ID",
  );
  const response = await createGitHubAppOctokit(configuration).request(
    "GET /app/installations/{installation_id}",
    { installation_id: expectedInstallationId },
  );
  const installation = parseGitHubInstallation(response.data);
  if (
    installation.installationId !== String(expectedInstallationId) ||
    installation.appId !== configuration.appId
  ) {
    throw new Error("GitHub App installation verification did not match this App.");
  }
  if (installation.suspended) {
    throw new Error("The GitHub App installation is suspended.");
  }
  return installation;
}

function parseGitHubOrganizationMembership(value: unknown): {
  githubOrganizationId: string;
  githubUserId: string;
  role: "admin" | "billing_manager" | "member";
  state: "active" | "pending";
} {
  if (!isRecord(value) || !isRecord(value["organization"]) || !isRecord(value["user"])) {
    throw new Error("GitHub returned an invalid organization membership.");
  }

  const githubOrganizationId = requireProviderPositiveSafeInteger(
    value["organization"]["id"],
    "organization ID",
  );
  const githubUserId = requireProviderPositiveSafeInteger(value["user"]["id"], "member user ID");
  if (
    value["role"] !== "admin" &&
    value["role"] !== "billing_manager" &&
    value["role"] !== "member"
  ) {
    throw new Error("GitHub returned an invalid organization membership role.");
  }
  if (value["state"] !== "active" && value["state"] !== "pending") {
    throw new Error("GitHub returned an invalid organization membership state.");
  }

  return {
    githubOrganizationId: String(githubOrganizationId),
    githubUserId: String(githubUserId),
    role: value["role"],
    state: value["state"],
  };
}

/**
 * Preview seeding uses a personal access token only for GitHub identity discovery.
 * Returned organizations keep using GitHub App installation authentication at runtime.
 */
export async function discoverPreviewSeedGitHubAppInstallations(
  apiKey: string,
): Promise<PreviewSeedGitHubAppInstallation[]> {
  const configuration = getGitHubAppConfiguration();
  const userOctokit = createGitHubUserOctokit(apiKey);
  const userResponse = await userOctokit.request("GET /user");
  const user = parseAuthenticatedGitHubUser(userResponse.data);

  const adminOrganizationIds = new Set<string>();
  let membershipsComplete = false;
  for (let page = 1; page <= MAX_GITHUB_PAGES; page += 1) {
    const response = await userOctokit.request("GET /user/memberships/orgs", {
      state: "active",
      per_page: GITHUB_PAGE_SIZE,
      page,
    });
    const payload: unknown = response.data;
    if (!Array.isArray(payload)) {
      throw new Error("GitHub returned an invalid organization membership list.");
    }

    for (const value of payload) {
      const membership = parseGitHubOrganizationMembership(value);
      if (membership.githubUserId !== user.githubUserId) {
        throw new Error("GitHub organization membership user verification failed.");
      }
      if (membership.state === "active" && membership.role === "admin") {
        adminOrganizationIds.add(membership.githubOrganizationId);
      }
    }

    if (payload.length < GITHUB_PAGE_SIZE) {
      membershipsComplete = true;
      break;
    }
  }
  if (!membershipsComplete) {
    throw new Error("GitHub organization memberships exceeded the preview seed page limit.");
  }

  const installations: PreviewSeedGitHubAppInstallation[] = [];
  let installationsComplete = false;
  const appOctokit = createGitHubAppOctokit(configuration);
  for (let page = 1; page <= MAX_GITHUB_PAGES; page += 1) {
    const response = await appOctokit.request("GET /app/installations", {
      per_page: GITHUB_PAGE_SIZE,
      page,
    });
    const payload: unknown = response.data;
    if (!Array.isArray(payload)) {
      throw new Error("GitHub returned an invalid App installation list.");
    }

    for (const value of payload) {
      const installation = parseGitHubInstallation(value);
      if (installation.appId !== configuration.appId) {
        throw new Error("GitHub App installation discovery did not match this App.");
      }
      if (installation.suspended) {
        continue;
      }

      const belongsToSeedUser =
        installation.githubOwnerType === "user"
          ? installation.githubOwnerId === user.githubUserId
          : adminOrganizationIds.has(installation.githubOwnerId);
      if (belongsToSeedUser) {
        installations.push({
          githubInstallationId: installation.installationId,
          githubOwnerId: installation.githubOwnerId,
          githubOwnerType: installation.githubOwnerType,
          githubOwnerLogin: installation.githubOwnerLogin,
        });
      }
    }

    if (payload.length < GITHUB_PAGE_SIZE) {
      installationsComplete = true;
      break;
    }
  }
  if (!installationsComplete) {
    throw new Error("GitHub App installations exceeded the preview seed page limit.");
  }

  installations.sort(
    (left, right) =>
      left.githubOwnerLogin.toLowerCase().localeCompare(right.githubOwnerLogin.toLowerCase()) ||
      left.githubInstallationId.localeCompare(right.githubInstallationId),
  );
  if (installations.length === 0) {
    throw new Error("No active GitHub App installation matched the preview seed API key.");
  }

  return installations;
}

async function findUserVisibleInstallation(args: {
  octokit: Octokit;
  installationId: number;
}): Promise<ReturnType<typeof parseGitHubInstallation>> {
  for (let page = 1; page <= MAX_GITHUB_PAGES; page += 1) {
    const response = await args.octokit.request("GET /user/installations", {
      per_page: GITHUB_PAGE_SIZE,
      page,
    });
    const payload: unknown = response.data;
    if (!isRecord(payload) || !Array.isArray(payload["installations"])) {
      throw new Error("GitHub returned an invalid user installation list.");
    }

    for (const value of payload["installations"]) {
      const installation = parseGitHubInstallation(value);
      if (installation.installationId === String(args.installationId)) {
        return installation;
      }
    }

    if (payload["installations"].length < GITHUB_PAGE_SIZE) {
      break;
    }
  }

  throw new Error("The GitHub user cannot access this App installation.");
}

async function listUserVisibleInstallations(
  octokit: Octokit,
): Promise<Array<ReturnType<typeof parseGitHubInstallation>>> {
  const installations = [];
  for (let page = 1; page <= MAX_GITHUB_PAGES; page += 1) {
    const response = await octokit.request("GET /user/installations", {
      per_page: GITHUB_PAGE_SIZE,
      page,
    });
    const payload: unknown = response.data;
    if (!isRecord(payload) || !Array.isArray(payload["installations"])) {
      throw new Error("GitHub returned an invalid user installation list.");
    }
    for (const value of payload["installations"]) {
      installations.push(parseGitHubInstallation(value));
    }
    if (payload["installations"].length < GITHUB_PAGE_SIZE) {
      return installations;
    }
  }
  throw new Error("GitHub App installations exceeded the user installation page limit.");
}

function assertMatchingInstallations(args: {
  appId: number;
  expectedInstallationId: number;
  userInstallation: ReturnType<typeof parseGitHubInstallation>;
  appInstallation: ReturnType<typeof parseGitHubInstallation>;
}): void {
  const expectedInstallationId = String(args.expectedInstallationId);
  if (
    args.userInstallation.installationId !== expectedInstallationId ||
    args.appInstallation.installationId !== expectedInstallationId ||
    args.userInstallation.appId !== args.appId ||
    args.appInstallation.appId !== args.appId
  ) {
    throw new Error("GitHub installation verification did not match this App.");
  }
  if (args.userInstallation.suspended || args.appInstallation.suspended) {
    throw new Error("The GitHub App installation is suspended.");
  }
  if (
    args.userInstallation.githubOwnerId !== args.appInstallation.githubOwnerId ||
    args.userInstallation.githubOwnerType !== args.appInstallation.githubOwnerType ||
    args.userInstallation.githubOwnerLogin.toLowerCase() !==
      args.appInstallation.githubOwnerLogin.toLowerCase()
  ) {
    throw new Error("GitHub installation owner verification failed.");
  }
}

async function hasGitHubOrganizationAdministratorAccess(args: {
  octokit: Octokit;
  githubOwnerId: string;
  githubOwnerLogin: string;
}): Promise<boolean> {
  let response;
  try {
    response = await args.octokit.request("GET /user/memberships/orgs/{org}", {
      org: args.githubOwnerLogin,
    });
  } catch (error) {
    if (error instanceof RequestError && error.status === 404) {
      return false;
    }
    throw error;
  }
  const membership: unknown = response.data;
  if (!isRecord(membership) || !isRecord(membership["organization"])) {
    throw new Error("GitHub returned an invalid organization membership.");
  }

  const githubOwnerId = requireProviderPositiveSafeInteger(
    membership["organization"]["id"],
    "organization ID",
  );
  return (
    membership["state"] === "active" &&
    membership["role"] === "admin" &&
    String(githubOwnerId) === args.githubOwnerId
  );
}

export async function listGitHubAppConnectionInstallations(args: {
  octokit: Octokit;
  githubUserId: string;
}): Promise<GitHubAppConnectionInstallation[]> {
  const configuration = getGitHubAppConfiguration();
  const visibleInstallations = await listUserVisibleInstallations(args.octokit);
  const installations = [];

  for (const visibleInstallation of visibleInstallations) {
    if (visibleInstallation.appId !== configuration.appId || visibleInstallation.suspended) {
      continue;
    }
    const canManage =
      visibleInstallation.githubOwnerType === "user"
        ? visibleInstallation.githubOwnerId === args.githubUserId
        : await hasGitHubOrganizationAdministratorAccess({
            octokit: args.octokit,
            githubOwnerId: visibleInstallation.githubOwnerId,
            githubOwnerLogin: visibleInstallation.githubOwnerLogin,
          });
    installations.push({
      installationId: visibleInstallation.installationId,
      githubOwnerId: visibleInstallation.githubOwnerId,
      githubOwnerType: visibleInstallation.githubOwnerType,
      githubOwnerLogin: visibleInstallation.githubOwnerLogin,
      canManage,
    });
  }

  return installations.sort(
    (left, right) =>
      left.githubOwnerLogin.toLowerCase().localeCompare(right.githubOwnerLogin.toLowerCase()) ||
      left.installationId.localeCompare(right.installationId),
  );
}

export async function verifyGitHubAppConnectionInstallation(args: {
  octokit: Octokit;
  githubUserId: string;
  installationId: string;
}): Promise<GitHubAppConnectionInstallation> {
  const configuration = getGitHubAppConfiguration();
  const expectedInstallationId = requirePositiveSafeInteger(
    args.installationId,
    "GitHub installation ID",
  );
  const userInstallation = await findUserVisibleInstallation({
    octokit: args.octokit,
    installationId: expectedInstallationId,
  });
  let appInstallation;
  try {
    appInstallation = await readGitHubAppInstallation(args.installationId);
  } catch (error) {
    if (error instanceof RequestError && error.status === 401) {
      throw new Error("GitHub App authentication failed.");
    }
    throw error;
  }
  assertMatchingInstallations({
    appId: configuration.appId,
    expectedInstallationId,
    userInstallation,
    appInstallation,
  });
  const canManage =
    appInstallation.githubOwnerType === "user"
      ? appInstallation.githubOwnerId === args.githubUserId
      : await hasGitHubOrganizationAdministratorAccess({
          octokit: args.octokit,
          githubOwnerId: appInstallation.githubOwnerId,
          githubOwnerLogin: appInstallation.githubOwnerLogin,
        });
  return {
    installationId: appInstallation.installationId,
    githubOwnerId: appInstallation.githubOwnerId,
    githubOwnerType: appInstallation.githubOwnerType,
    githubOwnerLogin: appInstallation.githubOwnerLogin,
    canManage,
  };
}
