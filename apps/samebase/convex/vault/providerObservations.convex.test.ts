import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const cloudflareMocks = vi.hoisted(() => ({
  requestCloudflareApiOrThrow: vi.fn(),
}));

vi.mock("../cloudflareApi/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../cloudflareApi/client")>();
  return {
    ...actual,
    requestCloudflareApiOrThrow: cloudflareMocks.requestCloudflareApiOrThrow,
  };
});

import { api } from "../_generated/api";
import { insertTestOrganizationBillingAccount, makeConvexTest } from "../test.setup";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  cloudflareMocks.requestCloudflareApiOrThrow.mockReset();
});

describe("vault provider observations", () => {
  it("shares one expired Cloudflare credential refresh across all attached Workers", async () => {
    vi.stubEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_ID", "cloudflare-client");
    vi.stubEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_SECRET", "cloudflare-secret");

    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        state: "active",
        email: "provider-observations@example.test",
        isApproved: true,
      });
      const organizationId = await ctx.db.insert("organizations", {
        githubOwnerId: "provider-observations-owner",
        githubOwnerType: "organization",
        githubOwnerLogin: "samebase",
        githubOwnerLoginNormalized: "samebase",
        githubInstallationId: "provider-observations-installation",
        convexTeam: { teamId: "convex-team" },
        cloudflareAccount: {
          accountId: "cloudflare-account",
          accountName: "Cloudflare account",
        },
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId,
        role: "owner",
      });
      await insertTestOrganizationBillingAccount(ctx.db, organizationId);
      await ctx.db.insert("organizationProviderCredentials", {
        organizationId,
        cloudflare: {
          auth: {
            method: "oauth",
            credential: "expired-access-token",
            refreshCredential: "refresh-token",
            credentialExpiresAt: 0,
          },
          connectedByUserId: userId,
          updatedAt: 1,
        },
      });
      const vaultId = await ctx.db.insert("vaults", {
        state: "not_connected",
        organizationId,
        convexTeamId: "convex-team",
        cloudflareAccountId: "cloudflare-account",
        deletion: { state: "not_deleting" },
      });
      const now = Date.now();
      const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
        organizationId,
        userId,
        vaultId,
        repositoryFullName: "samebase/samebase",
        trigger: "connect_existing_repository",
        state: "succeeded",
        currentStep: "finish",
        createdAt: now,
        updatedAt: now,
        completedAt: now,
      });
      await ctx.db.replace(vaultId, {
        state: "connected",
        githubMode: "connect_existing_repository",
        organizationId,
        convexTeamId: "convex-team",
        cloudflareAccountId: "cloudflare-account",
        deletion: { state: "not_deleting" },
        runId,
        ghRepoId: "github-repository",
        defaultBranch: "main",
        connectedAt: now,
        name: "samebase",
        visibility: "private",
      });
      const firstWorkerId = await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId,
        organizationId,
        accountId: "cloudflare-account",
        workerName: "domain-router",
        workerTag: "domain-router-tag",
        origin: "selected_existing",
      });
      const secondWorkerId = await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId,
        organizationId,
        accountId: "cloudflare-account",
        workerName: "samebase-worker",
        workerTag: "samebase-worker-tag",
        origin: "selected_existing",
      });
      return { firstWorkerId, secondWorkerId, userId, vaultId };
    });
    const refresh = vi.fn(async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : String(input);
      expect(url).toBe("https://dash.cloudflare.com/oauth2/token");
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
      return Response.json({
        access_token: "refreshed-access-token",
        refresh_token: "refreshed-refresh-token",
        expires_in: 3_600,
      });
    });
    vi.stubGlobal("fetch", refresh);
    cloudflareMocks.requestCloudflareApiOrThrow.mockImplementation(
      async (request: { path: string; params?: { path?: Record<string, string> } }) => {
        if (request.path === "/accounts/{account_id}/workers/subdomain") {
          return { subdomain: "samebase" };
        }
        if (request.path === "/accounts/{account_id}/workers/workers/{worker_id}") {
          const workerName = request.params?.path?.["worker_id"];
          if (!workerName) {
            throw new Error("Worker request is missing its name.");
          }
          return {
            id: `${workerName}-tag`,
            name: workerName,
            references: { domains: [] },
            subdomain: {
              enabled: true,
              previews_enabled: true,
              url: `https://${workerName}.samebase.workers.dev`,
            },
          };
        }
        throw new Error(`Unexpected Cloudflare request: ${request.path}`);
      },
    );
    const viewer = t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    });

    await expect(
      viewer.action(api.vault.providerObservations.observeCloudflareWorkers, {
        vaultId: ids.vaultId,
      }),
    ).resolves.toEqual([
      {
        state: "available",
        workerId: ids.firstWorkerId,
        customDomains: [],
        workersDev: {
          state: "enabled",
          url: "https://domain-router.samebase.workers.dev",
        },
      },
      {
        state: "available",
        workerId: ids.secondWorkerId,
        customDomains: [],
        workersDev: {
          state: "enabled",
          url: "https://samebase-worker.samebase.workers.dev",
        },
      },
    ]);
    expect(refresh).toHaveBeenCalledOnce();
  });
});
