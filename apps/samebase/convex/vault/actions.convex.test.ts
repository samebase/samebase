import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { api } from "../_generated/api";
import { makeConvexTest } from "../test.setup";

async function createGitHubConnectedUser() {
  const t = makeConvexTest();
  const userId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Ada",
      email: "ada@example.com",
      isApproved: true,
    });
    await ctx.db.insert("providerConnections", {
      kind: "github",
      userId,
      githubAccountId: 100,
      auth: {
        method: "api_key",
        credential: "github-api-key",
      },
      username: "Ada",
      createdAt: 1,
      updatedAt: 2,
    });
    return userId;
  });

  return {
    t,
    userId,
    asUser: t.withIdentity({
      subject: `${userId}|test-session`,
      tokenIdentifier: `test:${userId}`,
    }),
  };
}

describe("existing repository connection preflight", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("writes no vault or run when the repository is unreadable", async () => {
    const { asUser, t } = await createGitHubConnectedUser();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Not Found", { status: 404 })),
    );

    await expect(
      asUser.action(api.vault.actions.connectRepository, {
        repositoryFullName: "unknown/missing",
      }),
    ).rejects.toThrow("Repository is not readable with the connected GitHub account.");

    await expect(
      t.run(async (ctx) => ({
        vaults: await ctx.db.query("vaults").collect(),
        runs: await ctx.db.query("appProvisioningRuns").collect(),
        events: await ctx.db.query("appProvisioningEvents").collect(),
        resourceLinks: await ctx.db.query("vaultResourceLinksState").collect(),
      })),
    ).resolves.toEqual({
      vaults: [],
      runs: [],
      events: [],
      resourceLinks: [],
    });
  });

  it("writes no vault or run when the repository has no default branch", async () => {
    const { asUser, t } = await createGitHubConnectedUser();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              id: 1021726325,
              name: "Empty",
              owner: { login: "Samebase" },
              default_branch: null,
            }),
            { headers: { "content-type": "application/json" } },
          ),
      ),
    );

    await expect(
      asUser.action(api.vault.actions.connectRepository, {
        repositoryFullName: "samebase/empty",
      }),
    ).rejects.toThrow("Repository is not readable with the connected GitHub account.");
    await expect(
      t.run(async (ctx) => ({
        vaults: await ctx.db.query("vaults").collect(),
        runs: await ctx.db.query("appProvisioningRuns").collect(),
      })),
    ).resolves.toEqual({ vaults: [], runs: [] });
  });

  it("accepts a readable public repository and persists GitHub's canonical coordinates", async () => {
    const { asUser, t } = await createGitHubConnectedUser();
    const requests: Request[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        requests.push(request);
        return new Response(
          JSON.stringify({
            id: 1021726325,
            node_id: "R_kgDOPMcpNQ",
            name: "Samebase",
            full_name: "Samebase/Samebase",
            private: false,
            owner: { login: "Samebase" },
            default_branch: "main",
          }),
          {
            headers: { "content-type": "application/json" },
          },
        );
      }),
    );

    const result = await asUser.action(api.vault.actions.connectRepository, {
      repositoryFullName: "samebase/samebase",
    });
    const stored = await t.run(async (ctx) => ({
      vault: await ctx.db.get(result.vaultId),
      run: await ctx.db.get(result.runId),
    }));

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.github.com/repos/samebase/samebase");
    expect(requests[0].headers.get("authorization")).toBe("token github-api-key");
    expect(result.repositoryFullName).toBe("Samebase/Samebase");
    expect(stored.vault).toMatchObject({
      state: "provisioning",
      githubMode: "connect_existing_repository",
      ghRepoId: "1021726325",
      owner: "Samebase",
      name: "Samebase",
    });
    expect(stored.run).toMatchObject({
      repositoryFullName: "Samebase/Samebase",
      trigger: "connect_existing_repository",
    });
  });
});
