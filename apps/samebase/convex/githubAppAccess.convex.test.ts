import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const githubMocks = vi.hoisted(() => ({
  createRepositoryOctokit: vi.fn(),
  request: vi.fn(),
}));

vi.mock("@octokit/rest", () => ({
  Octokit: class {
    readonly request = githubMocks.request;
  },
}));

vi.mock("./githubApp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./githubApp")>();
  return {
    ...actual,
    createGitHubRepositoryInstallationOctokit: githubMocks.createRepositoryOctokit,
  };
});

import { api, internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

type ConvexTest = ReturnType<typeof makeConvexTest>;

beforeEach(() => {
  vi.clearAllMocks();
  githubMocks.createRepositoryOctokit.mockResolvedValue({ request: githubMocks.request });
  vi.stubEnv("GITHUB_APP_ID", "42");
  vi.stubEnv("GITHUB_APP_SLUG", "samebase-test");
  vi.stubEnv("GITHUB_APP_CLIENT_ID", "client-id");
  vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "client-secret");
  vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "private-key");
  vi.stubEnv("GITHUB_APP_OAUTH_CALLBACK_URL", "https://samebase.test/oauth/github/callback");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// Source: https://docs.github.com/en/rest/apps/apps#list-installations-for-the-authenticated-app
// Captured 2026-08-07. The permission order is changed to prove deterministic UI output.
function appInstallationFixture(suspendedAt: string | null = null) {
  return {
    id: 1001,
    account: {
      login: "installation-owner",
      id: 101,
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
      type: "Organization",
      site_admin: false,
    },
    access_tokens_url: "https://api.github.com/app/installations/1001/access_tokens",
    repositories_url: "https://api.github.com/installation/repositories",
    html_url: "https://github.com/organizations/installation-owner/settings/installations/1001",
    app_id: 42,
    target_id: 101,
    target_type: "Organization",
    permissions: { metadata: "read", contents: "write", administration: "write" },
    events: ["push", "pull_request"],
    single_file_name: "config.yaml",
    has_multiple_single_files: true,
    single_file_paths: ["config.yml", ".github/issue_TEMPLATE.md"],
    repository_selection: "selected",
    created_at: "2017-07-08T16:18:44-04:00",
    updated_at: "2017-07-08T16:18:44-04:00",
    app_slug: "samebase-test",
    suspended_at: suspendedAt,
    suspended_by: null,
  };
}

// Source: https://docs.github.com/en/rest/apps/installations?apiVersion=2022-11-28#list-repositories-accessible-to-the-app-installation
// Captured 2026-08-14. Tests clone this full provider example and change only identity fields.
const officialInstallationRepositoryResponseItem = {
  id: 1296269,
  node_id: "MDEwOlJlcG9zaXRvcnkxMjk2MjY5",
  name: "Hello-World",
  full_name: "octocat/Hello-World",
  owner: {
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
  private: false,
  html_url: "https://github.com/octocat/Hello-World",
  description: "This your first repo!",
  fork: false,
  url: "https://api.github.com/repos/octocat/Hello-World",
  archive_url: "https://api.github.com/repos/octocat/Hello-World/{archive_format}{/ref}",
  assignees_url: "https://api.github.com/repos/octocat/Hello-World/assignees{/user}",
  blobs_url: "https://api.github.com/repos/octocat/Hello-World/git/blobs{/sha}",
  branches_url: "https://api.github.com/repos/octocat/Hello-World/branches{/branch}",
  collaborators_url:
    "https://api.github.com/repos/octocat/Hello-World/collaborators{/collaborator}",
  comments_url: "https://api.github.com/repos/octocat/Hello-World/comments{/number}",
  commits_url: "https://api.github.com/repos/octocat/Hello-World/commits{/sha}",
  compare_url: "https://api.github.com/repos/octocat/Hello-World/compare/{base}...{head}",
  contents_url: "https://api.github.com/repos/octocat/Hello-World/contents/{+path}",
  contributors_url: "https://api.github.com/repos/octocat/Hello-World/contributors",
  deployments_url: "https://api.github.com/repos/octocat/Hello-World/deployments",
  downloads_url: "https://api.github.com/repos/octocat/Hello-World/downloads",
  events_url: "https://api.github.com/repos/octocat/Hello-World/events",
  forks_url: "https://api.github.com/repos/octocat/Hello-World/forks",
  git_commits_url: "https://api.github.com/repos/octocat/Hello-World/git/commits{/sha}",
  git_refs_url: "https://api.github.com/repos/octocat/Hello-World/git/refs{/sha}",
  git_tags_url: "https://api.github.com/repos/octocat/Hello-World/git/tags{/sha}",
  git_url: "git:github.com/octocat/Hello-World.git",
  issue_comment_url: "https://api.github.com/repos/octocat/Hello-World/issues/comments{/number}",
  issue_events_url: "https://api.github.com/repos/octocat/Hello-World/issues/events{/number}",
  issues_url: "https://api.github.com/repos/octocat/Hello-World/issues{/number}",
  keys_url: "https://api.github.com/repos/octocat/Hello-World/keys{/key_id}",
  labels_url: "https://api.github.com/repos/octocat/Hello-World/labels{/name}",
  languages_url: "https://api.github.com/repos/octocat/Hello-World/languages",
  merges_url: "https://api.github.com/repos/octocat/Hello-World/merges",
  milestones_url: "https://api.github.com/repos/octocat/Hello-World/milestones{/number}",
  notifications_url:
    "https://api.github.com/repos/octocat/Hello-World/notifications{?since,all,participating}",
  pulls_url: "https://api.github.com/repos/octocat/Hello-World/pulls{/number}",
  releases_url: "https://api.github.com/repos/octocat/Hello-World/releases{/id}",
  ssh_url: "git@github.com:octocat/Hello-World.git",
  stargazers_url: "https://api.github.com/repos/octocat/Hello-World/stargazers",
  statuses_url: "https://api.github.com/repos/octocat/Hello-World/statuses/{sha}",
  subscribers_url: "https://api.github.com/repos/octocat/Hello-World/subscribers",
  subscription_url: "https://api.github.com/repos/octocat/Hello-World/subscription",
  tags_url: "https://api.github.com/repos/octocat/Hello-World/tags",
  teams_url: "https://api.github.com/repos/octocat/Hello-World/teams",
  trees_url: "https://api.github.com/repos/octocat/Hello-World/git/trees{/sha}",
  clone_url: "https://github.com/octocat/Hello-World.git",
  mirror_url: "git:git.example.com/octocat/Hello-World",
  hooks_url: "https://api.github.com/repos/octocat/Hello-World/hooks",
  svn_url: "https://svn.github.com/octocat/Hello-World",
  homepage: "https://github.com",
  language: null,
  forks_count: 9,
  stargazers_count: 80,
  watchers_count: 80,
  size: 108,
  default_branch: "master",
  open_issues_count: 0,
  is_template: true,
  topics: ["octocat", "atom", "electron", "api"],
  has_issues: true,
  has_projects: true,
  has_wiki: true,
  has_pages: false,
  has_downloads: true,
  archived: false,
  disabled: false,
  visibility: "public",
  pushed_at: "2011-01-26T19:06:43Z",
  created_at: "2011-01-26T19:01:12Z",
  updated_at: "2011-01-26T19:14:43Z",
  allow_rebase_merge: true,
  template_repository: null,
  temp_clone_token: "ABTLWHOULUVAXGTRYU7OC2876QJ2O",
  allow_squash_merge: true,
  allow_auto_merge: false,
  delete_branch_on_merge: true,
  allow_merge_commit: true,
  subscribers_count: 42,
  network_count: 0,
  license: {
    key: "mit",
    name: "MIT License",
    url: "https://api.github.com/licenses/mit",
    spdx_id: "MIT",
    node_id: "MDc6TGljZW5zZW1pdA==",
    html_url: "https://github.com/licenses/mit",
  },
  forks: 1,
  open_issues: 1,
  watchers: 1,
  custom_properties: {
    environment: "production",
    service: "web",
  },
};

function installationRepositoryFixture(args?: { ownerId?: number; ownerLogin?: string }) {
  const ownerId = args?.ownerId ?? 101;
  const ownerLogin = args?.ownerLogin ?? "installation-owner";
  return {
    ...officialInstallationRepositoryResponseItem,
    id: 501,
    owner: {
      ...officialInstallationRepositoryResponseItem.owner,
      id: ownerId,
      login: ownerLogin,
    },
    name: "plugin",
    full_name: `${ownerLogin}/plugin`,
  };
}

async function createIdentityRepository(t: ConvexTest) {
  const ownerUserId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      state: "active",
      email: "github-identity-owner@example.com",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
  });
  const { organizationId } = await t.mutation(
    internal.organizations.createOrReconnectVerifiedOrganization,
    {
      userId: ownerUserId,
      githubOwnerId: "101",
      githubOwnerType: "organization",
      githubOwnerLogin: "installation-owner",
      githubInstallationId: "1001",
    },
  );
  await t.run(async (ctx) => {
    await ctx.db.patch(organizationId, {
      convexTeam: { teamId: "identity-convex-team" },
      cloudflareAccount: {
        accountId: "identity-cloudflare-account",
        accountName: "Identity account",
      },
    });
  });
  const repository = await t.mutation(
    internal.repository.records.createInitializingExistingRepositoryForUser,
    {
      userId: ownerUserId,
      organizationId,
      githubRepositoryDatabaseId: "501",
      githubOwnerLogin: "installation-owner",
      githubRepositoryName: "agent-plugins",
    },
  );
  await t.mutation(internal.repository.records.connectExistingRepositoryGitHub, {
    userId: ownerUserId,
    repositoryId: repository.repositoryId,
    runId: repository.runId,
    githubRepositoryDatabaseId: "501",
    githubOwnerLogin: "installation-owner",
    githubRepositoryName: "agent-plugins",
    defaultBranch: "main",
    visibility: "private",
  });
  return { organizationId, ownerUserId, repositoryId: repository.repositoryId };
}

describe("repository GitHub token scope", () => {
  it("scopes an old repository route to the repository stable repository ID", async () => {
    const t = makeConvexTest();
    const { ownerUserId, repositoryId } = await createIdentityRepository(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(ownerUserId, { email: "nicu@samebase.com" });
    });
    const asOwner = t.withIdentity({
      subject: ownerUserId,
      tokenIdentifier: `test:${ownerUserId}`,
    });
    const listForRef = vi.fn().mockResolvedValue({ data: { check_runs: [] } });
    const getCombinedStatusForRef = vi.fn().mockResolvedValue({ data: { statuses: [] } });
    githubMocks.createRepositoryOctokit.mockResolvedValue({
      checks: { listForRef },
      repos: { getCombinedStatusForRef },
    });

    await expect(
      t.query(internal.githubAppAccess.loadInstallationAccess, {
        userId: ownerUserId,
        target: { kind: "repository", repositoryId },
      }),
    ).resolves.toMatchObject({
      kind: "repository",
      githubInstallationId: "1001",
      githubRepositoryDatabaseId: "501",
    });
    await expect(
      asOwner.action(api.githubChecks.getCommitStatus, {
        owner: "installation-owner",
        repo: "agent-plugins",
        ref: "main",
      }),
    ).resolves.toEqual({ kind: "ok", check_runs: [], statuses: [] });

    expect(githubMocks.createRepositoryOctokit).toHaveBeenCalledWith("1001", "501");
    expect(githubMocks.request).not.toHaveBeenCalled();
    expect(listForRef).toHaveBeenCalledWith({
      owner: "installation-owner",
      repo: "agent-plugins",
      ref: "main",
    });
  });
});

describe("viewer GitHub installation health", () => {
  it("returns live permissions while billing-limited and preserves each probe result", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        state: "active",
        email: "github-installation@example.com",
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
      });
    });
    const { organizationId } = await t.mutation(
      internal.organizations.createOrReconnectVerifiedOrganization,
      {
        userId,
        githubOwnerId: "101",
        githubOwnerType: "organization",
        githubOwnerLogin: "installation-owner",
        githubInstallationId: "1001",
      },
    );
    await t.run(async (ctx) => {
      for (const index of [1, 2]) {
        const extraMemberId = await ctx.db.insert("users", {
          state: "active",
          email: `github-installation-extra-${index}@example.com`,
          isApproved: true,
          termsVersion: "2026-08-12",
          termsAcceptedAt: 1,
        });
        await ctx.db.insert("organizationMemberships", {
          organizationId,
          userId: extraMemberId,
          role: "member",
        });
      }
    });
    const asUser = t.withIdentity({
      subject: userId,
      tokenIdentifier: `test:${userId}`,
    });

    githubMocks.request.mockImplementation(async (route: string) => {
      if (route === "GET /installation/repositories") {
        return { data: { repositories: [] } };
      }
      if (route === "GET /app/installations/{installation_id}") {
        return { data: appInstallationFixture() };
      }
      throw new Error(`Unexpected GitHub route: ${route}`);
    });
    const connected = await asUser.action(api.githubAppAccess.checkViewerInstallation, {
      organizationId,
    });
    expect(connected.status).toBe("connected");
    expect(connected.checks.map(({ key, status }) => ({ key, status }))).toEqual([
      { key: "repositories", status: "ok" },
      { key: "installation", status: "ok" },
    ]);
    expect(connected.permissions).toEqual([
      { access: "write", key: "administration" },
      { access: "write", key: "contents" },
      { access: "read", key: "metadata" },
    ]);
    expect(connected.repositorySelection).toBe("selected");
    expect(githubMocks.request).toHaveBeenCalledWith("GET /installation/repositories", {
      per_page: 1,
    });
    expect(githubMocks.request).toHaveBeenCalledWith("GET /app/installations/{installation_id}", {
      installation_id: 1001,
    });

    githubMocks.request.mockImplementation(async (route: string) => {
      if (route === "GET /installation/repositories") {
        throw new Error("GitHub unavailable");
      }
      if (route === "GET /app/installations/{installation_id}") {
        return { data: appInstallationFixture() };
      }
      throw new Error(`Unexpected GitHub route: ${route}`);
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const degraded = await asUser.action(api.githubAppAccess.checkViewerInstallation, {
      organizationId,
    });
    expect(degraded.status).toBe("unavailable");
    expect(degraded.checks.map(({ key, status }) => ({ key, status }))).toEqual([
      { key: "repositories", status: "error" },
      { key: "installation", status: "ok" },
    ]);
    expect(degraded.permissions).toEqual(connected.permissions);
    expect(degraded.repositorySelection).toBe("selected");
    expect(warn).toHaveBeenCalledWith(
      "github:installation_access_probe_failed",
      { check: "repositories" },
      expect.objectContaining({ message: "GitHub unavailable" }),
    );

    githubMocks.request.mockImplementation(async (route: string) => {
      if (route === "GET /installation/repositories") {
        return { data: { repositories: [] } };
      }
      if (route === "GET /app/installations/{installation_id}") {
        return { data: appInstallationFixture("2026-08-08T00:00:00Z") };
      }
      throw new Error(`Unexpected GitHub route: ${route}`);
    });
    const suspended = await asUser.action(api.githubAppAccess.checkViewerInstallation, {
      organizationId,
    });
    expect(suspended.status).toBe("unavailable");
    expect(suspended.checks.map(({ key, status }) => ({ key, status }))).toEqual([
      { key: "repositories", status: "ok" },
      { key: "installation", status: "error" },
    ]);
    expect(suspended.permissions).toEqual([]);
    expect(suspended.repositorySelection).toBeUndefined();

    await t.run(async (ctx) => {
      const membership = await ctx.db
        .query("organizationMemberships")
        .withIndex("by_organization_and_user", (query) =>
          query.eq("organizationId", organizationId).eq("userId", userId),
        )
        .unique();
      if (membership !== null) {
        await ctx.db.delete(membership._id);
      }
    });
    githubMocks.request.mockClear();
    const unavailable = await asUser.action(api.githubAppAccess.checkViewerInstallation, {
      organizationId,
    });
    expect(unavailable.status).toBe("unavailable");
    expect(unavailable.checks.map(({ key, status }) => ({ key, status }))).toEqual([
      { key: "repositories", status: "not_run" },
      { key: "installation", status: "not_run" },
    ]);
    expect(unavailable.permissions).toEqual([]);
    expect(githubMocks.request).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "github:installation_access_probe_failed",
      { check: "initialization" },
      expect.objectContaining({ message: "Organization membership is required." }),
    );
  });
});

describe("GitHub identity observation and approval", () => {
  it("shows a blocked repository rename, then lets an owner approve repository and owner logins", async () => {
    const t = makeConvexTest();
    const { organizationId, ownerUserId, repositoryId } = await createIdentityRepository(t);
    const memberUserId = await t.run(async (ctx) => {
      const memberUserId = await ctx.db.insert("users", {
        state: "active",
        email: "github-identity-member@example.com",
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId: memberUserId,
        role: "member",
      });
      return memberUserId;
    });
    const collision = await t.mutation(
      internal.repository.records.createInitializingExistingRepositoryForUser,
      {
        userId: ownerUserId,
        organizationId,
        githubRepositoryDatabaseId: "collision-repository-id",
        githubOwnerLogin: "installation-owner",
        githubRepositoryName: "plugin",
      },
    );
    await t.mutation(internal.repository.records.markGithubProvisioningFailed, {
      runId: collision.runId,
    });
    const asOwner = t.withIdentity({
      subject: ownerUserId,
      tokenIdentifier: `test:${ownerUserId}`,
    });
    const asMember = t.withIdentity({
      subject: memberUserId,
      tokenIdentifier: `test:${memberUserId}`,
    });
    githubMocks.request.mockImplementation(async (route: string) => {
      if (route === "GET /app/installations/{installation_id}") {
        return { data: appInstallationFixture() };
      }
      if (route === "GET /installation/repositories") {
        return {
          data: { total_count: 1, repositories: [installationRepositoryFixture()] },
        };
      }
      throw new Error(`Unexpected GitHub route: ${route}`);
    });

    await expect(
      asMember.action(api.github.observeOrganizationGitHubIdentity, { organizationId }),
    ).resolves.toEqual({
      owner: { status: "current" },
      repositories: [
        {
          status: "renamed",
          repositoryId,
          repositoryName: "plugin",
          update: "blocked",
        },
      ],
    });
    githubMocks.request.mockClear();
    await expect(
      asMember.action(api.github.updateRepositoryGitHubRepositoryName, {
        repositoryId,
        expectedRepositoryName: "plugin",
      }),
    ).rejects.toThrow("Organization owner access is required.");
    expect(githubMocks.request).not.toHaveBeenCalled();

    await t.run(async (ctx) => {
      await ctx.db.delete(collision.repositoryId);
    });
    await expect(
      asOwner.action(api.github.updateRepositoryGitHubRepositoryName, {
        repositoryId,
        expectedRepositoryName: "plugin",
      }),
    ).resolves.toEqual({
      githubOwnerLogin: "installation-owner",
      repositoryName: "plugin",
    });

    const renamedInstallation = appInstallationFixture();
    renamedInstallation.account.login = "renamed-owner";
    githubMocks.request.mockImplementation(async (route: string) => {
      if (route === "GET /app/installations/{installation_id}") {
        return { data: renamedInstallation };
      }
      if (route === "GET /installation/repositories") {
        return {
          data: {
            total_count: 1,
            repositories: [installationRepositoryFixture({ ownerLogin: "renamed-owner" })],
          },
        };
      }
      throw new Error(`Unexpected GitHub route: ${route}`);
    });
    await expect(
      asMember.action(api.github.observeOrganizationGitHubIdentity, { organizationId }),
    ).resolves.toEqual({
      owner: {
        status: "renamed",
        githubOwnerLogin: "renamed-owner",
      },
      repositories: [],
    });
    githubMocks.request.mockClear();
    await expect(
      asMember.action(api.github.updateOrganizationGitHubOwnerLogin, {
        organizationId,
        expectedGithubOwnerLogin: "renamed-owner",
      }),
    ).rejects.toThrow("Organization owner access is required.");
    expect(githubMocks.request).not.toHaveBeenCalled();

    await expect(
      asOwner.action(api.github.updateOrganizationGitHubOwnerLogin, {
        organizationId,
        expectedGithubOwnerLogin: "renamed-owner",
      }),
    ).resolves.toEqual({ githubOwnerLogin: "renamed-owner" });
    expect(githubMocks.request).toHaveBeenCalledWith("GET /app/installations/{installation_id}", {
      installation_id: 1001,
    });
    expect(githubMocks.request).not.toHaveBeenCalledWith(
      "GET /installation/repositories",
      expect.anything(),
    );
  });

  it("keeps owner identity separate from repository access and rejects another owner", async () => {
    const t = makeConvexTest();
    const { organizationId, ownerUserId, repositoryId } = await createIdentityRepository(t);
    const asOwner = t.withIdentity({
      subject: ownerUserId,
      tokenIdentifier: `test:${ownerUserId}`,
    });
    const observe = async () =>
      await asOwner.action(api.github.observeOrganizationGitHubIdentity, { organizationId });

    githubMocks.request.mockRejectedValue(Object.assign(new Error("Not Found"), { status: 404 }));
    await expect(observe()).resolves.toEqual({
      owner: { status: "unavailable" },
      repositories: [],
    });

    const renamedInstallation = appInstallationFixture();
    renamedInstallation.account.login = "renamed-owner";
    githubMocks.request.mockImplementation(async (route: string) => {
      if (route === "GET /app/installations/{installation_id}") {
        return { data: renamedInstallation };
      }
      throw Object.assign(new Error("Forbidden"), { status: 403 });
    });
    await expect(observe()).resolves.toEqual({
      owner: { status: "renamed", githubOwnerLogin: "renamed-owner" },
      repositories: [{ status: "unavailable", repositoryId }],
    });

    githubMocks.request.mockImplementation(async (route: string) => {
      if (route === "GET /app/installations/{installation_id}") {
        return { data: appInstallationFixture() };
      }
      if (route === "GET /installation/repositories") {
        return {
          data: {
            total_count: 1,
            repositories: [
              installationRepositoryFixture({ ownerId: 202, ownerLogin: "transferred-owner" }),
            ],
          },
        };
      }
      throw new Error(`Unexpected GitHub route: ${route}`);
    });
    await expect(observe()).resolves.toEqual({
      owner: { status: "current" },
      repositories: [{ status: "unavailable", repositoryId }],
    });
    await expect(
      asOwner.action(api.github.updateRepositoryGitHubRepositoryName, {
        repositoryId,
        expectedRepositoryName: "plugin",
      }),
    ).rejects.toThrow("The GitHub repository moved to another owner.");
  });
});
