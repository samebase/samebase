import {
  createAppAuth,
  type GitHubAppUserAuthentication,
  type GitHubAppUserAuthenticationWithExpiration,
} from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";

import { isRecord } from "./jsonUtils";
import { env } from "./_generated/server";

const GITHUB_INSTALLATION_PAGE_SIZE = 100;
const MAX_GITHUB_INSTALLATION_PAGES = 100;

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

export type VerifiedGitHubAppInstallation = ExpiringGitHubUserAuthentication & {
  installationId: string;
  githubOwnerId: string;
  githubOwnerType: "organization" | "user";
  githubOwnerLogin: string;
  githubUserId: string;
  githubUserLogin: string;
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

function parseAuthenticatedGitHubUser(value: unknown): {
  githubUserId: string;
  githubUserLogin: string;
} {
  if (!isRecord(value)) {
    throw new Error("GitHub returned an invalid user profile.");
  }

  const githubUserId = requireProviderPositiveSafeInteger(value.id, "user ID");
  if (typeof value.login !== "string" || value.login.trim().length === 0) {
    throw new Error("GitHub returned an invalid user login.");
  }

  return {
    githubUserId: String(githubUserId),
    githubUserLogin: value.login.trim(),
  };
}

function parseGitHubInstallation(value: unknown): {
  installationId: string;
  appId: number;
  githubOwnerId: string;
  githubOwnerType: "organization" | "user";
  githubOwnerLogin: string;
  suspended: boolean;
} {
  if (!isRecord(value) || !isRecord(value.account)) {
    throw new Error("GitHub returned an invalid installation.");
  }

  const installationId = requireProviderPositiveSafeInteger(value.id, "installation ID");
  const appId = requireProviderPositiveSafeInteger(value.app_id, "installation App ID");
  const githubOwnerId = requireProviderPositiveSafeInteger(value.account.id, "owner ID");
  if (typeof value.account.login !== "string" || value.account.login.trim().length === 0) {
    throw new Error("GitHub returned an invalid installation owner login.");
  }

  let githubOwnerType: "organization" | "user";
  if (value.account.type === "Organization") {
    githubOwnerType = "organization";
  } else if (value.account.type === "User") {
    githubOwnerType = "user";
  } else {
    throw new Error("GitHub returned an unsupported installation owner type.");
  }

  return {
    installationId: String(installationId),
    appId,
    githubOwnerId: String(githubOwnerId),
    githubOwnerType,
    githubOwnerLogin: value.account.login.trim(),
    suspended: value.suspended_at !== null && value.suspended_at !== undefined,
  };
}

async function findUserVisibleInstallation(args: {
  octokit: Octokit;
  installationId: number;
}): Promise<ReturnType<typeof parseGitHubInstallation>> {
  for (let page = 1; page <= MAX_GITHUB_INSTALLATION_PAGES; page += 1) {
    const response = await args.octokit.request("GET /user/installations", {
      per_page: GITHUB_INSTALLATION_PAGE_SIZE,
      page,
    });
    const payload: unknown = response.data;
    if (!isRecord(payload) || !Array.isArray(payload.installations)) {
      throw new Error("GitHub returned an invalid user installation list.");
    }

    for (const value of payload.installations) {
      const installation = parseGitHubInstallation(value);
      if (installation.installationId === String(args.installationId)) {
        return installation;
      }
    }

    if (payload.installations.length < GITHUB_INSTALLATION_PAGE_SIZE) {
      break;
    }
  }

  throw new Error("The GitHub user cannot access this App installation.");
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

export async function verifyGitHubAppInstallation(args: {
  code: string;
  state: string;
  installationId: number;
}): Promise<VerifiedGitHubAppInstallation> {
  const configuration = getGitHubAppConfiguration();
  const authentication = await exchangeGitHubAppUserCode({
    code: args.code,
    state: args.state,
    configuration,
  });
  const userOctokit = createGitHubUserOctokit(authentication.accessToken);
  const userResponse = await userOctokit.request("GET /user");
  const user = parseAuthenticatedGitHubUser(userResponse.data);
  const userInstallation = await findUserVisibleInstallation({
    octokit: userOctokit,
    installationId: args.installationId,
  });

  const appResponse = await createGitHubAppOctokit(configuration).request(
    "GET /app/installations/{installation_id}",
    { installation_id: args.installationId },
  );
  const appInstallation = parseGitHubInstallation(appResponse.data);
  assertMatchingInstallations({
    appId: configuration.appId,
    expectedInstallationId: args.installationId,
    userInstallation,
    appInstallation,
  });

  return {
    ...authentication,
    installationId: appInstallation.installationId,
    githubOwnerId: appInstallation.githubOwnerId,
    githubOwnerType: appInstallation.githubOwnerType,
    githubOwnerLogin: appInstallation.githubOwnerLogin,
    githubUserId: user.githubUserId,
    githubUserLogin: user.githubUserLogin,
  };
}
