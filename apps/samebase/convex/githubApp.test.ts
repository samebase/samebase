import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const githubMocks = vi.hoisted(() => ({
  exchangeUserCode: vi.fn(),
  request: vi.fn(),
  requestAuthentication: vi.fn(),
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
    readonly request;

    constructor(options: unknown) {
      this.request = (route: string, requestOptions?: unknown) => {
        githubMocks.requestAuthentication(options, route);
        return requestOptions === undefined
          ? githubMocks.request(route)
          : githubMocks.request(route, requestOptions);
      };
    }
  },
}));

import {
  createGitHubUserOctokit,
  discoverPreviewSeedGitHubAppInstallations,
  listGitHubAppConnectionInstallations,
  readGitHubAppInstallation,
  verifyGitHubAppConnectionInstallation,
  verifyGitHubUserAuthorization,
} from "./githubApp";

// Source: https://docs.github.com/en/rest/orgs/members#list-organization-memberships-for-the-authenticated-user
// Captured 2026-08-07. Tests mutate this provider example only to cover distinct owners and states.
function organizationMembershipFixture() {
  return {
    url: "https://api.github.com/orgs/octocat/memberships/defunkt",
    state: "active",
    role: "admin",
    organization_url: "https://api.github.com/orgs/octocat",
    direct_membership: true,
    enterprise_teams_providing_indirect_membership: [],
    organization: {
      login: "github",
      id: 1,
      node_id: "MDEyOk9yZ2FuaXphdGlvbjE=",
      url: "https://api.github.com/orgs/github",
      repos_url: "https://api.github.com/orgs/github/repos",
      events_url: "https://api.github.com/orgs/github/events",
      hooks_url: "https://api.github.com/orgs/github/hooks",
      issues_url: "https://api.github.com/orgs/github/issues",
      members_url: "https://api.github.com/orgs/github/members{/member}",
      public_members_url: "https://api.github.com/orgs/github/public_members{/member}",
      avatar_url: "https://github.com/images/error/octocat_happy.gif",
      description: "A great organization",
    },
    user: {
      login: "octocat",
      id: 1,
      node_id: "MDQ6VXNlcjE=",
      avatar_url: "https://github.com/images/error/octocat_happy.gif",
      gravatar_id: "",
      url: "https://api.github.com/users/octocat",
      html_url: "https://github.com/octocat",
      followers_url: "https://api.github.com/users/octocat/followers",
      following_url: "https://api.github.com/users/octocat/following{/other_user}",
      gists_url: "https://api.github.com/users/octocat/gists{/gist_id}",
      starred_url: "https://api.github.com/users/octocat/starred{/owner}{/repo}",
      subscriptions_url: "https://api.github.com/users/octocat/subscriptions",
      organizations_url: "https://api.github.com/users/octocat/orgs",
      repos_url: "https://api.github.com/users/octocat/repos",
      events_url: "https://api.github.com/users/octocat/events{/privacy}",
      received_events_url: "https://api.github.com/users/octocat/received_events",
      type: "User",
      site_admin: false,
    },
  };
}

// Source: https://docs.github.com/en/rest/apps/apps#list-installations-for-the-authenticated-app
// Captured 2026-08-07. Tests mutate this provider example only to cover distinct installations.
function appInstallationFixture(suspendedAt: string | null = null) {
  return {
    id: 1,
    account: {
      login: "octocat",
      id: 1,
      node_id: "MDQ6VXNlcjE=",
      avatar_url: "https://github.com/images/error/octocat_happy.gif",
      gravatar_id: "",
      url: "https://api.github.com/users/octocat",
      html_url: "https://github.com/octocat",
      followers_url: "https://api.github.com/users/octocat/followers",
      following_url: "https://api.github.com/users/octocat/following{/other_user}",
      gists_url: "https://api.github.com/users/octocat/gists{/gist_id}",
      starred_url: "https://api.github.com/users/octocat/starred{/owner}{/repo}",
      subscriptions_url: "https://api.github.com/users/octocat/subscriptions",
      organizations_url: "https://api.github.com/users/octocat/orgs",
      repos_url: "https://api.github.com/users/octocat/repos",
      events_url: "https://api.github.com/users/octocat/events{/privacy}",
      received_events_url: "https://api.github.com/users/octocat/received_events",
      type: "User",
      site_admin: false,
    },
    access_tokens_url: "https://api.github.com/app/installations/1/access_tokens",
    repositories_url: "https://api.github.com/installation/repositories",
    html_url: "https://github.com/organizations/github/settings/installations/1",
    app_id: 1,
    target_id: 1,
    target_type: "Organization",
    permissions: { checks: "write", metadata: "read", contents: "read" },
    events: ["push", "pull_request"],
    single_file_name: "config.yaml",
    has_multiple_single_files: true,
    single_file_paths: ["config.yml", ".github/issue_TEMPLATE.md"],
    repository_selection: "selected",
    created_at: "2017-07-08T16:18:44-04:00",
    updated_at: "2017-07-08T16:18:44-04:00",
    app_slug: "github-actions",
    suspended_at: suspendedAt,
    suspended_by: null,
  };
}

function installation() {
  return {
    ...appInstallationFixture(),
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

  it("rejects invalid live permission and repository selection values", async () => {
    const invalidPermissions = installation();
    invalidPermissions.permissions.contents = "admin";
    githubMocks.request.mockResolvedValueOnce({ data: invalidPermissions });
    await expect(readGitHubAppInstallation("1001")).rejects.toThrow(
      "GitHub returned invalid installation permissions.",
    );

    const invalidRepositorySelection = installation();
    invalidRepositorySelection.repository_selection = "partial";
    githubMocks.request.mockResolvedValueOnce({ data: invalidRepositorySelection });
    await expect(readGitHubAppInstallation("1001")).rejects.toThrow(
      "GitHub returned an invalid installation repository selection.",
    );
  });

  it("discovers only the preview user's personal and active admin installations", async () => {
    process.env["GITHUB_APP_ID"] = "1";
    const adminMembership = organizationMembershipFixture();
    const memberMembership = organizationMembershipFixture();
    memberMembership.organization.id = 2;
    memberMembership.organization.login = "member-org";
    memberMembership.role = "member";
    const pendingMembership = organizationMembershipFixture();
    pendingMembership.organization.id = 3;
    pendingMembership.organization.login = "pending-org";
    pendingMembership.state = "pending";
    const suspendedMembership = organizationMembershipFixture();
    suspendedMembership.organization.id = 4;
    suspendedMembership.organization.login = "suspended-org";

    const personalInstallation = appInstallationFixture();
    const adminInstallation = appInstallationFixture();
    adminInstallation.id = 2;
    adminInstallation.account.login = "github";
    adminInstallation.account.type = "Organization";
    const memberInstallation = appInstallationFixture();
    memberInstallation.id = 3;
    memberInstallation.account.id = 2;
    memberInstallation.account.login = "member-org";
    memberInstallation.account.type = "Organization";
    const pendingInstallation = appInstallationFixture();
    pendingInstallation.id = 4;
    pendingInstallation.account.id = 3;
    pendingInstallation.account.login = "pending-org";
    pendingInstallation.account.type = "Organization";
    const suspendedInstallation = appInstallationFixture("2026-08-07T00:00:00Z");
    suspendedInstallation.id = 5;
    suspendedInstallation.account.id = 4;
    suspendedInstallation.account.login = "suspended-org";
    suspendedInstallation.account.type = "Organization";
    const otherUserInstallation = appInstallationFixture();
    otherUserInstallation.id = 6;
    otherUserInstallation.account.id = 9;
    otherUserInstallation.account.login = "other-user";

    githubMocks.request.mockImplementation(async (route: string) => {
      if (route === "GET /user") {
        return { data: { id: 1, login: "octocat" } };
      }
      if (route === "GET /user/memberships/orgs") {
        return {
          data: [adminMembership, memberMembership, pendingMembership, suspendedMembership],
        };
      }
      if (route === "GET /app/installations") {
        return {
          data: [
            personalInstallation,
            adminInstallation,
            memberInstallation,
            pendingInstallation,
            suspendedInstallation,
            otherUserInstallation,
          ],
        };
      }
      throw new Error(`Unexpected GitHub route: ${route}`);
    });

    await expect(discoverPreviewSeedGitHubAppInstallations("preview-api-key")).resolves.toEqual([
      {
        githubInstallationId: "2",
        githubOwnerId: "1",
        githubOwnerType: "organization",
        githubOwnerLogin: "github",
      },
      {
        githubInstallationId: "1",
        githubOwnerId: "1",
        githubOwnerType: "user",
        githubOwnerLogin: "octocat",
      },
    ]);
    expect(githubMocks.requestAuthentication).toHaveBeenCalledWith(
      {
        auth: "preview-api-key",
        userAgent: "samebase-app",
      },
      "GET /user",
    );
    expect(githubMocks.requestAuthentication).toHaveBeenCalledWith(
      {
        auth: "preview-api-key",
        userAgent: "samebase-app",
      },
      "GET /user/memberships/orgs",
    );
    expect(githubMocks.requestAuthentication).toHaveBeenCalledWith(
      {
        authStrategy: expect.any(Function),
        auth: {
          appId: 1,
          privateKey: "private-key",
        },
        userAgent: "samebase-app",
      },
      "GET /app/installations",
    );
  });

  it("paginates preview membership discovery and rejects installations from another App", async () => {
    process.env["GITHUB_APP_ID"] = "1";
    let membershipPage = 0;
    let installationPage = 0;
    const installation = appInstallationFixture();
    installation.app_id = 2;
    const firstInstallationPage = Array.from({ length: 100 }, (_, index) => {
      const pageInstallation = appInstallationFixture();
      pageInstallation.id = index + 10;
      pageInstallation.account.id = index + 1000;
      pageInstallation.account.login = `other-user-${index}`;
      return pageInstallation;
    });

    githubMocks.request.mockImplementation(async (route: string) => {
      if (route === "GET /user") {
        return { data: { id: 1, login: "octocat" } };
      }
      if (route === "GET /user/memberships/orgs") {
        membershipPage += 1;
        return {
          data:
            membershipPage === 1 ? Array.from({ length: 100 }, organizationMembershipFixture) : [],
        };
      }
      if (route === "GET /app/installations") {
        installationPage += 1;
        return { data: installationPage === 1 ? firstInstallationPage : [installation] };
      }
      throw new Error(`Unexpected GitHub route: ${route}`);
    });

    await expect(discoverPreviewSeedGitHubAppInstallations("preview-api-key")).rejects.toThrow(
      "GitHub App installation discovery did not match this App.",
    );
    expect(githubMocks.request).toHaveBeenCalledWith("GET /user/memberships/orgs", {
      state: "active",
      per_page: 100,
      page: 2,
    });
    expect(githubMocks.request).toHaveBeenCalledWith("GET /app/installations", {
      per_page: 100,
      page: 2,
    });
  });

  it("fails preview discovery when no active installation matches the API key user", async () => {
    process.env["GITHUB_APP_ID"] = "1";
    const installation = appInstallationFixture();
    installation.account.id = 9;
    installation.account.login = "other-user";
    githubMocks.request.mockImplementation(async (route: string) => {
      if (route === "GET /user") {
        return { data: { id: 1, login: "octocat" } };
      }
      if (route === "GET /user/memberships/orgs") {
        return { data: [] };
      }
      if (route === "GET /app/installations") {
        return { data: [installation] };
      }
      throw new Error(`Unexpected GitHub route: ${route}`);
    });

    await expect(discoverPreviewSeedGitHubAppInstallations("preview-api-key")).rejects.toThrow(
      "No active GitHub App installation matched the preview seed API key.",
    );
  });

  it("classifies visible installations by live GitHub owner authority", async () => {
    const adminInstallation = installation();
    const memberInstallation = appInstallationFixture();
    memberInstallation.id = 1002;
    memberInstallation.app_id = 42;
    memberInstallation.account = {
      ...memberInstallation.account,
      id: 303,
      login: "member-org",
      type: "Organization",
    };
    const personalInstallation = appInstallationFixture();
    personalInstallation.id = 1003;
    personalInstallation.app_id = 42;
    personalInstallation.account = {
      ...personalInstallation.account,
      id: 202,
      login: "alice",
      type: "User",
    };
    const memberships = [
      {
        organization: { id: 101 },
        role: "admin",
        state: "active",
      },
      {
        organization: { id: 303 },
        role: "member",
        state: "active",
      },
    ];
    githubMocks.request.mockImplementation(async (route: string) => {
      if (route === "GET /user/installations") {
        return {
          data: {
            installations: [adminInstallation, memberInstallation, personalInstallation],
          },
        };
      }
      if (route === "GET /user/memberships/orgs/{org}") {
        const nextMembership = memberships.shift();
        if (nextMembership === undefined) {
          throw new Error("Missing organization membership fixture.");
        }
        return { data: nextMembership };
      }
      throw new Error(`Unexpected GitHub route: ${route}`);
    });

    await expect(
      listGitHubAppConnectionInstallations({
        octokit: createGitHubUserOctokit("access-token"),
        githubUserId: "202",
      }),
    ).resolves.toEqual([
      {
        installationId: "1003",
        githubOwnerId: "202",
        githubOwnerType: "user",
        githubOwnerLogin: "alice",
        canManage: true,
      },
      {
        installationId: "1002",
        githubOwnerId: "303",
        githubOwnerType: "organization",
        githubOwnerLogin: "member-org",
        canManage: false,
      },
      {
        installationId: "1001",
        githubOwnerId: "101",
        githubOwnerType: "organization",
        githubOwnerLogin: "samebase",
        canManage: true,
      },
    ]);
    expect(githubMocks.request).not.toHaveBeenCalledWith(
      "GET /app/installations/{installation_id}",
      expect.anything(),
    );
  });

  it("rechecks live GitHub administrator authority when an installation is selected", async () => {
    githubMocks.membership.role = "member";

    await expect(
      verifyGitHubAppConnectionInstallation({
        octokit: createGitHubUserOctokit("access-token"),
        githubUserId: "202",
        installationId: "1001",
      }),
    ).resolves.toMatchObject({
      githubOwnerId: "101",
      githubOwnerType: "organization",
      canManage: false,
    });
  });

  it("requires the membership organization stable ID to match the installation owner", async () => {
    githubMocks.membership.organizationId = 303;

    await expect(
      verifyGitHubAppConnectionInstallation({
        octokit: createGitHubUserOctokit("access-token"),
        githubUserId: "202",
        installationId: "1001",
      }),
    ).resolves.toMatchObject({ canManage: false });
  });

  it("keeps personal installation verification on the existing exact-user path", async () => {
    githubMocks.owner.id = 202;
    githubMocks.owner.login = "alice";
    githubMocks.owner.type = "User";

    await expect(
      verifyGitHubAppConnectionInstallation({
        octokit: createGitHubUserOctokit("access-token"),
        githubUserId: "202",
        installationId: "1001",
      }),
    ).resolves.toMatchObject({
      githubOwnerId: "202",
      githubOwnerType: "user",
      canManage: true,
    });
    expect(githubMocks.request).not.toHaveBeenCalledWith(
      "GET /user/memberships/orgs/{org}",
      expect.anything(),
    );
  });

  it("authorizes a GitHub user without reading or creating an App installation", async () => {
    await expect(
      verifyGitHubUserAuthorization({
        code: "code",
        state: "state",
      }),
    ).resolves.toEqual({
      githubUserId: "202",
      githubUserLogin: "alice",
      accessToken: "access-token",
      accessTokenExpiresAt: Date.parse("2099-01-01T00:00:00.000Z"),
      refreshToken: "refresh-token",
      refreshTokenExpiresAt: Date.parse("2099-02-01T00:00:00.000Z"),
    });
    expect(githubMocks.request).toHaveBeenCalledOnce();
    expect(githubMocks.request).toHaveBeenCalledWith("GET /user");
  });
});
