import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { api } from "../_generated/api";
import { isRecord } from "../jsonUtils";
import { insertTestOrganizationBillingAccount, makeConvexTest } from "../test.setup";
import {
  observedAlchemyStackReply,
  observedBaseAlchemyProductionDeployment,
} from "./fixtures/observedAlchemyState";

const storeProject = {
  createTime: 1710000000000,
  id: 3300001,
  name: "alchemy-state",
  slug: "alchemy-state",
  teamId: 38516,
  teamSlug: "nicu",
};
const appProject = {
  createTime: 1710000000000,
  id: 3245938,
  name: "base-alchemy",
  slug: "base-alchemy",
  teamId: 38516,
  teamSlug: "nicu",
};
const [pr24, pr25, prod] = observedAlchemyStackReply.value.stages;

type RecordedRequest = {
  authorization: string | null;
  body: unknown;
  url: string;
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** The captured reply with the stage `prod` changed by `change`. */
function withProdStage(change: (stage: typeof prod) => void): typeof observedAlchemyStackReply {
  const reply = structuredClone(observedAlchemyStackReply);
  const stage = reply.value.stages.find((candidate) => candidate.stage === "prod");
  if (!stage) {
    throw new Error("Expected the captured prod stage.");
  }
  change(stage);
  return reply;
}

async function seedAlchemyRepository(t: ReturnType<typeof makeConvexTest>) {
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      state: "active",
      name: "Ada",
      email: "nicu@samebase.com",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubInstallationId: "alchemy-installation",
      githubOwnerId: "alchemy-owner",
      githubOwnerLogin: "samebase",
      githubOwnerLoginNormalized: "samebase",
      githubOwnerType: "organization",
      convexTeam: { teamId: "38516", teamSlug: "nicu" },
      cloudflareAccount: {
        accountId: "cloudflare-account",
        accountName: "Cloudflare account",
      },
    });
    await insertTestOrganizationBillingAccount(ctx.db, organizationId);
    await ctx.db.insert("organizationMemberships", { organizationId, userId, role: "owner" });
    await ctx.db.insert("organizationProviderCredentials", {
      organizationId,
      convex: {
        connectedByUserId: userId,
        auth: { method: "api_key", credential: "convex-api-key" },
        updatedAt: 2,
      },
    });
    const repositoryId = await ctx.db.insert("repositories", {
      organizationId,
      convexTeamId: "38516",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
      createdAt: 1,
      state: "not_connected",
    });
    const runId = await ctx.db.insert("workflow_repositoryProvisioning_runs", {
      organizationId,
      userId,
      repositoryId,
      githubRepositoryFullName: "samebase/base-alchemy",
      trigger: "connect_existing_repository",
      state: "succeeded",
      currentStep: "finish",
      createdAt: 10,
      updatedAt: 20,
      completedAt: 20,
    });
    await ctx.db.replace(repositoryId, {
      organizationId,
      convexTeamId: "38516",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
      createdAt: 1,
      state: "connected",
      githubMode: "connect_existing_repository",
      runId,
      githubRepositoryDatabaseId: "123",
      githubRepositoryName: "base-alchemy",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 20,
    });
    await ctx.db.insert("repositoryConvexProjects", {
      repositoryId,
      organizationId,
      teamId: "38516",
      projectId: "3245938",
      convexConfigPath: "convex.json",
      origin: "selected_existing",
    });

    return { repositoryId, userId };
  });

  return {
    ids,
    user: t.withIdentity({
      subject: ids.userId,
      tokenIdentifier: `test:${ids.userId}`,
    }),
  };
}

/**
Answers the Convex Management API and `POST /api/function` of the store. `state:readStack` answers
`storeReply` for the stack `samebase/base-alchemy`, the key of the repository stack in the store, and
no stages for any other stack.
*/
function installAlchemyStateFetchStub(args: {
  requests: RecordedRequest[];
  storeReply: unknown;
  teamProjects: unknown[];
}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      const body: unknown =
        typeof init?.body === "string"
          ? JSON.parse(init.body)
          : input instanceof Request && input.method !== "GET"
            ? await input.json()
            : undefined;
      args.requests.push({
        url,
        authorization: new Headers(init?.headers).get("Authorization"),
        body,
      });

      if (url === "https://api.convex.dev/v1/teams/38516/projects?limit=100") {
        return jsonResponse({ items: args.teamProjects, pagination: { hasMore: false } });
      }
      if (url.endsWith("/projects/3300001/deployment?defaultProd=true")) {
        return jsonResponse({
          class: "s16",
          createTime: 1710000000000,
          deploymentType: "prod",
          deploymentUrl: "https://brave-heron-201.convex.cloud",
          id: 2001,
          isDefault: true,
          kind: "cloud",
          name: "brave-heron-201",
          projectId: "3300001",
          reference: "production",
          region: "aws-us-east-1",
        });
      }
      if (url.endsWith("/projects/3245938/deployment?defaultProd=true")) {
        return jsonResponse(observedBaseAlchemyProductionDeployment);
      }
      if (url.endsWith("/create_deploy_key")) {
        return jsonResponse({ deployKey: "prod:brave-heron-201|alchemy-state-secret" });
      }
      if (url.endsWith("/delete_deploy_key")) {
        return new Response(null, { status: 200 });
      }
      if (
        url === "https://brave-heron-201.convex.cloud/api/function" &&
        isRecord(body) &&
        body["path"] === "state:readStack" &&
        isRecord(body["args"])
      ) {
        return jsonResponse(
          body["args"]["stack"] === "samebase/base-alchemy"
            ? args.storeReply
            : { status: "success", value: { stages: [] } },
        );
      }

      throw new Error(`Unexpected Convex request: ${url}`);
    }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("repository Alchemy state", () => {
  it("reads the stack of the repository in one call with a revoked inspection key", async () => {
    const t = makeConvexTest();
    const { ids, user } = await seedAlchemyRepository(t);
    vi.spyOn(Date, "now").mockReturnValue(1_710_000_000_000);
    const requests: RecordedRequest[] = [];
    installAlchemyStateFetchStub({
      requests,
      storeReply: observedAlchemyStackReply,
      teamProjects: [appProject, storeProject],
    });

    const observation = await user.action(api.repository.alchemyState.observe, {
      repositoryId: ids.repositoryId,
    });

    expect(observation).toEqual({
      store: "found",
      stack: "samebase/base-alchemy",
      convexTeam: { teamId: "38516", teamSlug: "nicu" },
      regions: [{ deploymentName: "ideal-dolphin-15", region: "aws-us-east-1" }],
      stages: [
        {
          name: "pr-24",
          run: { state: "none" },
          resources: pr24.resources,
          output: '{"url":"https://nautical-eagle-647.convex.site"}',
        },
        {
          name: "pr-25",
          run: { state: "none" },
          resources: pr25.resources,
          output: '{"url":"https://fastidious-squid-196.convex.site"}',
        },
        {
          name: "prod",
          run: {
            state: "recorded",
            record: {
              version: 1,
              repository: "samebase/base-alchemy",
              stackFile: "alchemy.run.ts",
              branch: "main",
              pullRequest: null,
              headCommit: "a4d98f2ad150dee07e19fa9c348e70240aca1dac",
              runUrl:
                "https://github.com/samebase/base-alchemy/actions/runs/39666079880/attempts/1",
              source: "github-actions",
              recordedAt: "2026-10-21T19:58:06.882Z",
            },
          },
          resources: prod.resources,
          output: '{"url":"https://ideal-dolphin-15.convex.site"}',
        },
      ],
    });

    const storeRequests = requests.filter((request) => request.url.endsWith("/api/function"));
    expect(storeRequests).toEqual([
      {
        url: "https://brave-heron-201.convex.cloud/api/function",
        authorization: "Convex prod:brave-heron-201|alchemy-state-secret",
        body: {
          path: "state:readStack",
          args: { stack: "samebase/base-alchemy" },
          format: "json",
        },
      },
    ]);
    expect(requests.find((request) => request.url.endsWith("/create_deploy_key"))?.body).toEqual({
      allowedActions: ["deployment:functions:runInternalQueries"],
      expiresAt: 1_710_000_000_000 + 31 * 60 * 1000,
      name: "samebase-alchemyState-brave-heron-201-ltk9ukg0",
    });
    expect(requests.find((request) => request.url.endsWith("/delete_deploy_key"))?.body).toEqual({
      id: "samebase-alchemyState-brave-heron-201-ltk9ukg0",
    });
  });

  it("reports a missing store when the team has no alchemy-state project", async () => {
    const t = makeConvexTest();
    const { ids, user } = await seedAlchemyRepository(t);
    const requests: RecordedRequest[] = [];
    installAlchemyStateFetchStub({
      requests,
      storeReply: observedAlchemyStackReply,
      teamProjects: [appProject],
    });

    await expect(
      user.action(api.repository.alchemyState.observe, { repositoryId: ids.repositoryId }),
    ).resolves.toEqual({ store: "missing" });
    expect(requests.some((request) => request.url.endsWith("/create_deploy_key"))).toBe(false);
  });

  it("reports a stack without stages when the store does not hold the repository", async () => {
    const t = makeConvexTest();
    const { ids, user } = await seedAlchemyRepository(t);
    installAlchemyStateFetchStub({
      requests: [],
      storeReply: { status: "success", value: { stages: [] } },
      teamProjects: [storeProject],
    });

    await expect(
      user.action(api.repository.alchemyState.observe, { repositoryId: ids.repositoryId }),
    ).resolves.toEqual({
      store: "found",
      stack: "samebase/base-alchemy",
      convexTeam: { teamId: "38516", teamSlug: "nicu" },
      regions: [],
      stages: [],
    });
  });

  it("keeps the key of a secret and never returns its value", async () => {
    const t = makeConvexTest();
    const { ids, user } = await seedAlchemyRepository(t);
    // The captured state holds no secret, so this adds the envelope that `encodeState` writes for a
    // `Redacted` attribute and output value.
    installAlchemyStateFetchStub({
      requests: [],
      storeReply: withProdStage((stage) => {
        const deployment: unknown = JSON.parse(stage.resources[0].value);
        const output: unknown = JSON.parse(stage.output);
        if (!isRecord(deployment) || !isRecord(deployment["attr"]) || !isRecord(output)) {
          throw new Error("Expected the captured Deployment attributes and output.");
        }
        deployment["attr"]["deployKey"] = {
          __redacted__: "prod:ideal-dolphin-15|state-secret-value",
        };
        output["deployKey"] = { __redacted__: "prod:ideal-dolphin-15|output-secret-value" };
        stage.resources[0].value = JSON.stringify(deployment);
        stage.output = JSON.stringify(output);
      }),
      teamProjects: [storeProject],
    });

    const observation = await user.action(api.repository.alchemyState.observe, {
      repositoryId: ids.repositoryId,
    });

    expect(JSON.stringify(observation)).not.toContain("secret-value");
    if (observation.store !== "found") {
      throw new Error("Expected the team store.");
    }
    const stage = observation.stages.find((candidate) => candidate.name === "prod");
    expect(JSON.parse(stage?.resources[0]?.value ?? "")).toMatchObject({
      attr: { deployKey: { __redacted__: null } },
    });
    expect(stage?.output).toBe(
      '{"url":"https://ideal-dolphin-15.convex.site","deployKey":{"__redacted__":null}}',
    );
  });

  it("reports a run record of an unknown version without failing the read", async () => {
    const t = makeConvexTest();
    const { ids, user } = await seedAlchemyRepository(t);
    installAlchemyStateFetchStub({
      requests: [],
      storeReply: withProdStage((stage) => {
        const output: unknown = JSON.parse(stage.output);
        if (!isRecord(output) || !isRecord(output["samebase.run"])) {
          throw new Error("Expected the captured run record.");
        }
        output["samebase.run"]["version"] = 2;
        stage.output = JSON.stringify(output);
      }),
      teamProjects: [storeProject],
    });

    const observation = await user.action(api.repository.alchemyState.observe, {
      repositoryId: ids.repositoryId,
    });

    if (observation.store !== "found") {
      throw new Error("Expected the team store.");
    }
    expect(observation.stages.find((stage) => stage.name === "prod")).toMatchObject({
      run: { state: "unknown" },
      output: '{"url":"https://ideal-dolphin-15.convex.site"}',
    });
  });
});
