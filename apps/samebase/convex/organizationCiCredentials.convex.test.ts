import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const managementMocks = vi.hoisted(() => ({
  verifyConvexTeamAccessToken: vi.fn(),
}));

vi.mock("./convexManagementApi/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./convexManagementApi/client")>();
  return {
    ...actual,
    verifyConvexTeamAccessToken: managementMocks.verifyConvexTeamAccessToken,
  };
});

import { api } from "./_generated/api";
import { ConvexManagementApiError } from "./convexManagementApi/errors";
import { requireCloudflareCiAccountAccess } from "./organization/ciCredentials";
import { insertTestOrganizationBillingAccount, makeConvexTest } from "./test.setup";

const cloudflareAccountId = "a".repeat(32);

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Cloudflare's API for one user API token that reaches `accounts`. */
function stubCloudflareCiToken(accounts: Array<{ id: string; name: string }>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      const result =
        url.pathname === "/client/v4/user/tokens/verify"
          ? { id: "c".repeat(32), status: "active" }
          : accounts.map((account) => ({ ...account, type: "standard" }));
      return Response.json({ success: true, errors: [], messages: [], result });
    }),
  );
}

async function createOrganization(role: "owner" | "member" = "owner") {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      state: "active",
      name: "Ada",
      email: "ci-credentials@example.test",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubInstallationId: "1001",
      githubOwnerId: "1",
      githubOwnerLogin: "samebase",
      githubOwnerLoginNormalized: "samebase",
      githubOwnerType: "organization",
      convexTeam: { teamId: "41", teamSlug: "samebase" },
      cloudflareAccount: { accountId: cloudflareAccountId, accountName: "Samebase" },
    });
    await insertTestOrganizationBillingAccount(ctx.db, organizationId);
    await ctx.db.insert("organizationMemberships", { organizationId, userId, role });
    await ctx.db.insert("organizationProviderCredentials", {
      organizationId,
      convex: {
        auth: { method: "api_key", credential: "samebase-convex-test-token" },
        connectedByUserId: userId,
        updatedAt: 1,
      },
      cloudflare: {
        auth: { method: "api_key", credential: "samebase-cloudflare-test-token" },
        connectedByUserId: userId,
        updatedAt: 1,
      },
    });
    return { organizationId, userId };
  });
  return {
    ...ids,
    t,
    viewer: t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  managementMocks.verifyConvexTeamAccessToken.mockResolvedValue(undefined);
});

describe("organization CI credentials", () => {
  it("saves a verified Cloudflare CI token for the connected account and removes it", async () => {
    const { organizationId, t, viewer } = await createOrganization();
    stubCloudflareCiToken([{ id: cloudflareAccountId, name: "Samebase" }]);

    await viewer.action(api.users.setCloudflareCiToken, {
      organizationId,
      token: "  cloudflare-ci-test-token  ",
    });

    await expect(
      viewer.query(api.users.getCiCredentialsStatus, { organizationId }),
    ).resolves.toMatchObject({
      cloudflare: {
        accountId: cloudflareAccountId,
        connectedBy: { kind: "email", label: "ci-credentials@example.test" },
      },
      convex: null,
    });
    await expect(
      t.run(async (ctx) => await ctx.db.query("organizationCiCredentials").unique()),
    ).resolves.toMatchObject({
      cloudflare: { apiToken: "cloudflare-ci-test-token", accountId: cloudflareAccountId },
    });

    await viewer.mutation(api.users.removeCiToken, { organizationId, provider: "cloudflare" });

    await expect(
      t.run(async (ctx) => await ctx.db.query("organizationCiCredentials").unique()),
    ).resolves.toBeNull();
  });

  it("rejects a Cloudflare CI token that cannot reach the connected account", async () => {
    const { organizationId, t, viewer } = await createOrganization();
    stubCloudflareCiToken([{ id: "b".repeat(32), name: "Other" }]);

    await expect(
      viewer.action(api.users.setCloudflareCiToken, {
        organizationId,
        token: "cloudflare-ci-test-token",
      }),
    ).rejects.toMatchObject({
      data: "The Cloudflare CI token cannot access the Cloudflare account Samebase.",
    });
    await expect(
      t.run(async (ctx) => await ctx.db.query("organizationCiCredentials").unique()),
    ).resolves.toBeNull();
  });

  it("saves a verified Convex CI token for the connected team and removes it", async () => {
    const { organizationId, t, viewer } = await createOrganization();

    await viewer.action(api.users.setConvexCiToken, {
      organizationId,
      token: "  convex-ci-test-token  ",
    });

    expect(managementMocks.verifyConvexTeamAccessToken).toHaveBeenCalledWith({
      token: "convex-ci-test-token",
      teamId: "41",
    });
    await expect(
      viewer.query(api.users.getCiCredentialsStatus, { organizationId }),
    ).resolves.toMatchObject({
      cloudflare: null,
      convex: {
        teamId: "41",
        connectedBy: { kind: "email", label: "ci-credentials@example.test" },
      },
    });
    await expect(
      t.run(async (ctx) => await ctx.db.query("organizationCiCredentials").unique()),
    ).resolves.toMatchObject({
      convex: { accessToken: "convex-ci-test-token", teamId: "41" },
    });

    await viewer.mutation(api.users.removeCiToken, { organizationId, provider: "convex" });

    await expect(
      t.run(async (ctx) => await ctx.db.query("organizationCiCredentials").unique()),
    ).resolves.toBeNull();
  });

  it("rejects a Convex CI token that cannot read the connected team", async () => {
    const { organizationId, t, viewer } = await createOrganization();
    managementMocks.verifyConvexTeamAccessToken.mockRejectedValue(
      new ConvexManagementApiError({
        status: 403,
        path: "/teams/41/projects",
        responseBodySummary: "Forbidden",
      }),
    );

    await expect(
      viewer.action(api.users.setConvexCiToken, { organizationId, token: "convex-ci-test-token" }),
    ).rejects.toMatchObject({
      data: "The Convex CI token cannot read the Convex team samebase.",
    });
    await expect(
      t.run(async (ctx) => await ctx.db.query("organizationCiCredentials").unique()),
    ).resolves.toBeNull();
  });

  it("lets only an owner save a CI token", async () => {
    const { organizationId, viewer } = await createOrganization("member");

    await expect(
      viewer.action(api.users.setConvexCiToken, { organizationId, token: "convex-ci-test-token" }),
    ).rejects.toThrow();
    expect(managementMocks.verifyConvexTeamAccessToken).not.toHaveBeenCalled();
  });

  it("requires the Cloudflare CI token to reach the connected account", () => {
    const account = { accountId: "cloudflare-account", accountName: "Samebase" };

    expect(() => requireCloudflareCiAccountAccess([account], account)).not.toThrow();
    expect(() =>
      requireCloudflareCiAccountAccess([{ accountId: "other", accountName: "Other" }], account),
    ).toThrow("The Cloudflare CI token cannot access the Cloudflare account Samebase.");
  });
});
