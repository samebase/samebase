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
import { insertTestOrganizationBillingAccount, makeConvexTest } from "./test.setup";

const cloudflareAccountId = "a".repeat(32);

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The reads that stand for the permission groups of the Cloudflare CI token, by path. */
const probePaths = {
  accountSettings: `/client/v4/accounts/${cloudflareAccountId}`,
  workersScripts: `/client/v4/accounts/${cloudflareAccountId}/workers/scripts`,
  secretsStore: `/client/v4/accounts/${cloudflareAccountId}/secrets_store/stores`,
  workersBuilds: `/client/v4/accounts/${cloudflareAccountId}/builds/tokens`,
};

/**
Cloudflare's API for one user API token with `status`. A path in `denied` answers the way
Cloudflare answers a token without that permission: 403 with code 10000 Authentication error (as
cloudflareResources.test.ts records it), and 12006 Invalid token for Workers Builds.
*/
function stubCloudflareCiToken({
  status = "active",
  denied = [],
}: { status?: string; denied?: string[] } = {}) {
  const fetch = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.pathname === "/client/v4/user/tokens/verify") {
      return Response.json({
        success: true,
        errors: [],
        messages: [],
        result: { id: "c".repeat(32), status },
      });
    }
    if (denied.includes(url.pathname)) {
      const error =
        url.pathname === probePaths.workersBuilds
          ? { code: 12006, message: "Invalid token" }
          : { code: 10000, message: "Authentication error" };
      return Response.json(
        { success: false, errors: [error], messages: [], result: null },
        { status: 403 },
      );
    }
    return Response.json({ success: true, errors: [], messages: [], result: [] });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
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
    const fetch = stubCloudflareCiToken();

    await viewer.action(api.users.setCloudflareCiToken, {
      organizationId,
      token: "  cloudflare-ci-test-token  ",
    });

    const readPaths = fetch.mock.calls.map(
      ([input]) => new URL(input instanceof Request ? input.url : input.toString()).pathname,
    );
    expect(readPaths.sort()).toEqual(
      ["/client/v4/user/tokens/verify", ...Object.values(probePaths)].sort(),
    );
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

  /*
  State axes of the save: the token active or not; each of the four permission probes answered or
  denied. A token for another account is denied every probe.
  */
  it("names the permission group of each probe that Cloudflare denies, and saves nothing", async () => {
    const { organizationId, t, viewer } = await createOrganization();
    const save = () =>
      viewer.action(api.users.setCloudflareCiToken, {
        organizationId,
        token: "cloudflare-ci-test-token",
      });
    const refusal = (permissions: string) =>
      `Cloudflare could not confirm that the Cloudflare CI token has ${permissions} in the Cloudflare account Samebase. Save a new token from the Cloudflare API tokens link under CI credentials on the Providers page, which preselects every permission that the setup stack needs, or try again.`;

    stubCloudflareCiToken({ denied: [probePaths.secretsStore] });
    await expect(save()).rejects.toMatchObject({ data: refusal("Secrets Store Edit") });

    stubCloudflareCiToken({ denied: [probePaths.workersBuilds] });
    await expect(save()).rejects.toMatchObject({
      data: refusal("Workers Builds Configuration Edit"),
    });

    stubCloudflareCiToken({ denied: Object.values(probePaths) });
    await expect(save()).rejects.toMatchObject({
      data: refusal(
        "Account Settings Read, Workers Scripts Edit, Secrets Store Edit, Workers Builds Configuration Edit",
      ),
    });
    await expect(
      t.run(async (ctx) => await ctx.db.query("organizationCiCredentials").unique()),
    ).resolves.toBeNull();
  });

  it("rejects a Cloudflare CI token that is not active", async () => {
    const { organizationId, t, viewer } = await createOrganization();
    const fetch = stubCloudflareCiToken({ status: "disabled" });

    await expect(
      viewer.action(api.users.setCloudflareCiToken, {
        organizationId,
        token: "cloudflare-ci-test-token",
      }),
    ).rejects.toMatchObject({
      data: "Cloudflare could not verify the Cloudflare CI token as an active API token. Save a new token from the Cloudflare API tokens link under CI credentials on the Providers page, or try again.",
    });
    expect(fetch).toHaveBeenCalledOnce();
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
});
