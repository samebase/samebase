import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const githubMocks = vi.hoisted(() => ({
  request: vi.fn(),
}));

vi.mock("@octokit/rest", () => ({
  Octokit: class {
    readonly request = githubMocks.request;
  },
}));

import { api, internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

beforeEach(() => {
  vi.clearAllMocks();
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

describe("viewer GitHub installation health", () => {
  it("returns live permissions and preserves each probe result", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        state: "active",
        email: "github-installation@example.com",
        isApproved: true,
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
    const asUser = t.withIdentity({
      subject: `${userId}|github-installation`,
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
  });
});
