import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { api } from "../_generated/api";
import { isRecord } from "../jsonUtils";
import { insertTestOrganizationBillingAccount, makeConvexTest } from "../test.setup";
import {
  observedAlchemyStackReply,
  observedBaseAlchemyProductionDeployment,
  observedBaseAlchemyProject,
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
const [, , prod] = observedAlchemyStackReply.value.stages;

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
Answers the Convex Management API and `POST /api/function` of the store. `state:stacks` answers the
names of `stackReplies`, and `state:readStack` answers the reply of the stack. By default the store
holds `samebase/base-alchemy`, the stack of the repository, with `storeReply`, and the stack of
another repository, `samebase/samebase`.
*/
function installAlchemyStateFetchStub(args: {
  requests: RecordedRequest[];
  storeReply: unknown;
  stackReplies?: Record<string, unknown>;
  teamProjects: unknown[];
  authorizationReply?: unknown;
}) {
  const stackReplies = args.stackReplies ?? {
    "samebase/base-alchemy": args.storeReply,
    "samebase/samebase": { status: "success", value: { stages: [] } },
  };
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
      if (url.endsWith("/projects/3245938")) {
        return jsonResponse(observedBaseAlchemyProject);
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
      // A read of a stack that the store does not list answers nothing, which fails the read.
      if (url === "https://brave-heron-201.convex.cloud/api/function" && isRecord(body)) {
        if (body["path"] === "reader:authorize") {
          return jsonResponse(
            args.authorizationReply ?? { status: "success", value: { token: "reader-token" } },
          );
        }
        const functionArgs = body["args"];
        return jsonResponse(
          body["path"] === "state:stacks"
            ? { status: "success", value: Object.keys(stackReplies).sort() }
            : stackReplies[isRecord(functionArgs) ? String(functionArgs["stack"]) : ""],
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
  it("returns only the repository reader token and revokes the server deploy key", async () => {
    const t = makeConvexTest();
    const { ids, user } = await seedAlchemyRepository(t);
    const requests: RecordedRequest[] = [];
    installAlchemyStateFetchStub({
      requests,
      storeReply: observedAlchemyStackReply,
      teamProjects: [storeProject],
    });

    await expect(
      user.action(api.repository.alchemyState.connect, { repositoryId: ids.repositoryId }),
    ).resolves.toEqual({
      store: "live",
      deploymentUrl: "https://brave-heron-201.convex.cloud",
      token: "reader-token",
    });
    expect(
      requests.find((request) => request.url.endsWith("/create_deploy_key"))?.body,
    ).toMatchObject({
      allowedActions: [
        "deployment:functions:runInternalQueries",
        "deployment:functions:runInternalMutations",
      ],
    });
    expect(
      requests
        .filter((request) => request.url.endsWith("/api/function"))
        .map((request) => request.body),
    ).toEqual([
      {
        path: "reader:authorize",
        args: {
          repository: "samebase/base-alchemy",
          subject: expect.stringContaining(`:${ids.userId}`),
        },
        format: "json",
      },
    ]);
    expect(requests.at(-1)?.url).toContain("/delete_deploy_key");

    await t.run(async (ctx) => {
      const membership = await ctx.db.query("organizationMemberships").first();
      if (!membership) throw new Error("Expected the seeded membership.");
      await ctx.db.delete(membership._id);
    });
    requests.length = 0;
    await expect(
      user.action(api.repository.alchemyState.connect, { repositoryId: ids.repositoryId }),
    ).rejects.toThrow("Repository not found");
    expect(requests).toEqual([]);
  });

  it("fails on a reader authorization error and still revokes the deploy key", async () => {
    const t = makeConvexTest();
    const { ids, user } = await seedAlchemyRepository(t);
    const requests: RecordedRequest[] = [];
    installAlchemyStateFetchStub({
      requests,
      storeReply: observedAlchemyStackReply,
      teamProjects: [storeProject],
      authorizationReply: { status: "error", errorMessage: "Reader authorization failed" },
    });
    await expect(
      user.action(api.repository.alchemyState.connect, { repositoryId: ids.repositoryId }),
    ).rejects.toThrow("Alchemy state is temporarily unavailable.");
    expect(
      requests.some(
        (request) => isRecord(request.body) && request.body["path"] === "state:readStack",
      ),
    ).toBe(false);
    expect(requests.at(-1)?.url).toContain("/delete_deploy_key");
  });

  it("reads deployment metadata for a first deploy before the stage has an output", async () => {
    const t = makeConvexTest();
    const { ids, user } = await seedAlchemyRepository(t);
    const output: unknown = JSON.parse(prod.output);
    if (!isRecord(output)) throw new Error("Expected the captured stage output.");
    const current = withProdStage((stage) => {
      stage.resources[0].value = stage.resources[0].value.replace(
        '"type":"prod"',
        '"type":"prod","rootDir":"."',
      );
    }).value.stages[2];
    installAlchemyStateFetchStub({
      requests: [],
      storeReply: {
        status: "success",
        value: { stages: [{ ...current, output: null, record: output["samebase.run"] }] },
      },
      teamProjects: [storeProject],
    });
    await expect(
      user.action(api.repository.alchemyState.readDeploymentMetadata, {
        repositoryId: ids.repositoryId,
      }),
    ).resolves.toEqual([
      {
        deploymentName: "ideal-dolphin-15",
        dashboardUrl: "https://dashboard.convex.dev/t/nicu/base-alchemy/ideal-dolphin-15",
        region: "aws-us-east-1",
      },
    ]);
  });

  it("lists the stacks and reads only the stack of the repository with a revoked inspection key", async () => {
    const t = makeConvexTest();
    const { ids, user } = await seedAlchemyRepository(t);
    vi.spyOn(Date, "now").mockReturnValue(1_710_000_000_000);
    const requests: RecordedRequest[] = [];
    // The captured stack with the `rootDir` "." on the `prod` Deployment row that
    // @samebase/alchemy-convex 0.8.0 writes for a stack file at the repository root.
    const storeReply = withProdStage((stage) => {
      stage.resources[0].value = stage.resources[0].value.replace(
        '"type":"prod"',
        '"type":"prod","rootDir":"."',
      );
    });
    installAlchemyStateFetchStub({
      requests,
      storeReply,
      teamProjects: [appProject, storeProject],
    });

    const observation = await user.action(api.repository.alchemyState.observe, {
      repositoryId: ids.repositoryId,
    });

    // pr-24 and pr-25 have no run record, so they are not stages of the repository.
    expect(observation).toEqual({
      store: "found",
      liveDeployments: [
        {
          deploymentName: "ideal-dolphin-15",
          dashboardUrl: "https://dashboard.convex.dev/t/nicu/base-alchemy/ideal-dolphin-15",
          region: "aws-us-east-1",
        },
      ],
      stacks: [
        {
          name: "samebase/base-alchemy",
          stages: [
            {
              name: "prod",
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
              deployedHeadCommit: "a4d98f2ad150dee07e19fa9c348e70240aca1dac",
              resources: storeReply.value.stages[2]?.resources,
              output: '{"url":"https://ideal-dolphin-15.convex.site"}',
            },
          ],
        },
      ],
    });

    // The stack of another repository is listed but not read.
    const storeRequests = requests.filter((request) => request.url.endsWith("/api/function"));
    expect(storeRequests).toEqual([
      {
        url: "https://brave-heron-201.convex.cloud/api/function",
        authorization: "Convex prod:brave-heron-201|alchemy-state-secret",
        body: { path: "state:stacks", args: {}, format: "json" },
      },
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

  it("reports no stacks when the store does not hold the repository", async () => {
    const t = makeConvexTest();
    const { ids, user } = await seedAlchemyRepository(t);
    const requests: RecordedRequest[] = [];
    installAlchemyStateFetchStub({
      requests,
      storeReply: observedAlchemyStackReply,
      stackReplies: { "samebase/samebase": observedAlchemyStackReply },
      teamProjects: [storeProject],
    });

    await expect(
      user.action(api.repository.alchemyState.observe, { repositoryId: ids.repositoryId }),
    ).resolves.toEqual({ store: "found", liveDeployments: [], stacks: [] });
    expect(
      requests.filter(
        (request) => isRecord(request.body) && request.body["path"] === "state:readStack",
      ),
    ).toEqual([]);
  });

  it("reads the stacks in folders of the repository and keeps the stages that its records name", async () => {
    const t = makeConvexTest();
    const { ids, user } = await seedAlchemyRepository(t);
    // Mutations of the captured stack: the same stages in a stack of the folder apps/web, whose
    // `prod` was deployed from that folder, and in a stack whose `prod` names another repository.
    const folderReply = withProdStage((stage) => {
      stage.output = stage.output.replace(
        '"stackFile":"alchemy.run.ts"',
        '"stackFile":"apps/web/alchemy.run.ts"',
      );
    });
    const otherRepositoryReply = withProdStage((stage) => {
      stage.output = stage.output.replace(
        '"repository":"samebase/base-alchemy"',
        '"repository":"samebase/other"',
      );
    });
    const requests: RecordedRequest[] = [];
    installAlchemyStateFetchStub({
      requests,
      storeReply: observedAlchemyStackReply,
      stackReplies: {
        "samebase/base-alchemy/apps/web": folderReply,
        "samebase/base-alchemy/apps/other": otherRepositoryReply,
        "samebase/base-alchemy-two": observedAlchemyStackReply,
      },
      teamProjects: [storeProject],
    });

    const observation = await user.action(api.repository.alchemyState.observe, {
      repositoryId: ids.repositoryId,
    });

    // A stage counts only with a run record of the repository, and a stack whose name only starts
    // with the repository name is another repository.
    if (observation.store !== "found") {
      throw new Error("Expected the team store.");
    }
    expect(
      observation.stacks.map((stack) => ({
        name: stack.name,
        stages: stack.stages.map((stage) => stage.name),
      })),
    ).toEqual([{ name: "samebase/base-alchemy/apps/web", stages: ["prod"] }]);
    expect(
      requests.flatMap((request) =>
        isRecord(request.body) && request.body["path"] === "state:readStack"
          ? [request.body["args"]]
          : [],
      ),
    ).toEqual([
      { stack: "samebase/base-alchemy/apps/other" },
      { stack: "samebase/base-alchemy/apps/web" },
    ]);
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
    const stage = observation.stacks[0]?.stages.find((candidate) => candidate.name === "prod");
    expect(JSON.parse(stage?.resources[0]?.value ?? "")).toMatchObject({
      attr: { deployKey: { __redacted__: null } },
    });
    expect(stage?.output).toBe(
      '{"url":"https://ideal-dolphin-15.convex.site","deployKey":{"__redacted__":null}}',
    );
  });

  it("leaves out a stage whose run record has an unknown version without failing the read", async () => {
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

    // prod was the only stage with a run record, so the repository has no stack left.
    await expect(
      user.action(api.repository.alchemyState.observe, { repositoryId: ids.repositoryId }),
    ).resolves.toEqual({ store: "found", liveDeployments: [], stacks: [] });
  });
});
