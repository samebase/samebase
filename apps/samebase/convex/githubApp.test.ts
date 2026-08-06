import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const githubMocks = vi.hoisted(() => ({
  exchangeUserCode: vi.fn(),
  request: vi.fn(),
  owner: {
    id: 101,
    login: "samebase",
    type: "Organization",
  },
  membership: {
    organizationId: 101,
    role: "admin",
    state: "active",
  },
}));

vi.mock("@octokit/auth-app", () => ({
  createAppAuth: () => githubMocks.exchangeUserCode,
}));

vi.mock("@octokit/rest", () => ({
  Octokit: class {
    readonly request = githubMocks.request;
  },
}));

import { verifyGitHubAppInstallation } from "./githubApp";

function installation() {
  return {
    id: 1001,
    app_id: 42,
    account: githubMocks.owner,
    suspended_at: null,
  };
}

describe("GitHub App installation verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["GITHUB_APP_ID"] = "42";
    process.env["GITHUB_APP_SLUG"] = "samebase-development";
    process.env["GITHUB_APP_CLIENT_ID"] = "client-id";
    process.env["GITHUB_APP_CLIENT_SECRET"] = "client-secret";
    process.env["GITHUB_APP_PRIVATE_KEY"] = "private-key";
    process.env["GITHUB_APP_OAUTH_CALLBACK_URL"] = "https://example.com/github/callback";

    githubMocks.owner.id = 101;
    githubMocks.owner.login = "samebase";
    githubMocks.owner.type = "Organization";
    githubMocks.membership.organizationId = 101;
    githubMocks.membership.role = "admin";
    githubMocks.membership.state = "active";
    githubMocks.exchangeUserCode.mockResolvedValue({
      token: "access-token",
      expiresAt: "2099-01-01T00:00:00.000Z",
      refreshToken: "refresh-token",
      refreshTokenExpiresAt: "2099-02-01T00:00:00.000Z",
    });
    githubMocks.request.mockImplementation(async (route: string) => {
      if (route === "GET /user") {
        return { data: { id: 202, login: "alice" } };
      }
      if (route === "GET /user/installations") {
        return { data: { installations: [installation()] } };
      }
      if (route === "GET /app/installations/{installation_id}") {
        return { data: installation() };
      }
      if (route === "GET /user/memberships/orgs/{org}") {
        return {
          data: {
            organization: { id: githubMocks.membership.organizationId },
            role: githubMocks.membership.role,
            state: githubMocks.membership.state,
          },
        };
      }
      throw new Error(`Unexpected GitHub route: ${route}`);
    });
  });

  it("requires active administrator membership in the installation organization", async () => {
    await expect(
      verifyGitHubAppInstallation({
        code: "code",
        state: "state",
        installationId: 1001,
      }),
    ).resolves.toMatchObject({
      githubOwnerId: "101",
      githubOwnerType: "organization",
      githubUserId: "202",
    });
    expect(githubMocks.request).toHaveBeenCalledWith("GET /user/memberships/orgs/{org}", {
      org: "samebase",
    });

    githubMocks.membership.role = "member";
    await expect(
      verifyGitHubAppInstallation({
        code: "code",
        state: "state",
        installationId: 1001,
      }),
    ).rejects.toThrow("GitHub organization administrator verification failed.");

    githubMocks.membership.role = "admin";
    githubMocks.membership.state = "pending";
    await expect(
      verifyGitHubAppInstallation({
        code: "code",
        state: "state",
        installationId: 1001,
      }),
    ).rejects.toThrow("GitHub organization administrator verification failed.");
  });

  it("requires the membership organization stable ID to match the installation owner", async () => {
    githubMocks.membership.organizationId = 303;

    await expect(
      verifyGitHubAppInstallation({
        code: "code",
        state: "state",
        installationId: 1001,
      }),
    ).rejects.toThrow("GitHub organization administrator verification failed.");
  });

  it("keeps personal installation verification on the existing exact-user path", async () => {
    githubMocks.owner.id = 202;
    githubMocks.owner.login = "alice";
    githubMocks.owner.type = "User";

    await expect(
      verifyGitHubAppInstallation({
        code: "code",
        state: "state",
        installationId: 1001,
      }),
    ).resolves.toMatchObject({
      githubOwnerId: "202",
      githubOwnerType: "user",
      githubUserId: "202",
    });
    expect(githubMocks.request).not.toHaveBeenCalledWith(
      "GET /user/memberships/orgs/{org}",
      expect.anything(),
    );
  });
});
