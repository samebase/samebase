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

describe("viewer GitHub installation health", () => {
  it("checks current membership and returns only connected or unavailable", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "github-installation@example.com",
        isApproved: true,
      });
    });
    const { organizationId } = await t.mutation(
      internal.organizations.createOrReconnectVerifiedOrganization,
      {
        userId,
        githubOwnerId: "installation-owner",
        githubOwnerType: "organization",
        githubOwnerLogin: "installation-owner",
        githubInstallationId: "1001",
      },
    );
    const asUser = t.withIdentity({
      subject: `${userId}|github-installation`,
      tokenIdentifier: `test:${userId}`,
    });

    githubMocks.request.mockResolvedValue({ data: { repositories: [] } });
    await expect(
      asUser.action(api.githubAppAccess.checkViewerInstallation, { organizationId }),
    ).resolves.toEqual({ status: "connected" });
    expect(githubMocks.request).toHaveBeenCalledWith("GET /installation/repositories", {
      per_page: 1,
    });

    githubMocks.request.mockRejectedValue(new Error("GitHub unavailable"));
    await expect(
      asUser.action(api.githubAppAccess.checkViewerInstallation, { organizationId }),
    ).resolves.toEqual({ status: "unavailable" });

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
    await expect(
      asUser.action(api.githubAppAccess.checkViewerInstallation, { organizationId }),
    ).resolves.toEqual({ status: "unavailable" });
    expect(githubMocks.request).not.toHaveBeenCalled();
  });
});
