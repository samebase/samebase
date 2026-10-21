import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { api } from "../_generated/api";
import { isRecord } from "../jsonUtils";
import { insertTestOrganizationBillingAccount, makeConvexTest } from "../test.setup";
import {
  observedAlchemyOutputs,
  observedAlchemyResourceFqns,
  observedAlchemyResourceValues,
  observedAlchemyStacks,
  observedAlchemyStages,
} from "./fixtures/observedAlchemyState";

type RecordedRequest = {
  authorization: string | null;
  body: unknown;
  url: string;
};

function answerStateFunction(
  path: unknown,
  args: Record<string, unknown>,
  resourceValues: Record<string, Record<string, unknown>>,
): unknown {
  const stage = String(args["stage"]);
  switch (path) {
    case "state:stacks":
      return observedAlchemyStacks;
    case "state:stages":
      return args["stack"] === "BaseAlchemy" ? observedAlchemyStages : [];
    case "state:list":
      return observedAlchemyResourceFqns[stage];
    case "state:get":
      return resourceValues[stage]?.[String(args["fqn"])] ?? null;
    case "state:getOutput":
      return observedAlchemyOutputs[stage] ?? null;
  }
  throw new Error(`Unexpected state function: ${String(path)}`);
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
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

function installAlchemyStateFetchStub(
  requests: RecordedRequest[],
  resourceValues: Record<string, Record<string, unknown>>,
) {
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
      requests.push({ url, authorization: new Headers(init?.headers).get("Authorization"), body });

      if (url.endsWith("/projects/3245938/deployment?defaultProd=true")) {
        return jsonResponse({
          class: "s16",
          createTime: 1710000000000,
          deploymentType: "prod",
          deploymentUrl: "https://ideal-dolphin-15.convex.cloud",
          id: 2001,
          isDefault: true,
          kind: "cloud",
          name: "ideal-dolphin-15",
          projectId: "3245938",
          reference: "production",
          region: "aws-us-east-1",
        });
      }
      if (url.endsWith("/create_deploy_key")) {
        return jsonResponse({ deployKey: "prod:ideal-dolphin-15|alchemy-state-secret" });
      }
      if (url.endsWith("/delete_deploy_key")) {
        return new Response(null, { status: 200 });
      }
      if (
        url === "https://ideal-dolphin-15.convex.cloud/api/function" &&
        isRecord(body) &&
        isRecord(body["args"])
      ) {
        return jsonResponse({
          status: "success",
          value: answerStateFunction(body["path"], body["args"], resourceValues),
          logLines: [],
        });
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
  it("reads every stack, stage, resource, and output with a revoked inspection key", async () => {
    const t = makeConvexTest();
    const { ids, user } = await seedAlchemyRepository(t);
    vi.spyOn(Date, "now").mockReturnValue(1_710_000_000_000);
    const requests: RecordedRequest[] = [];
    installAlchemyStateFetchStub(requests, observedAlchemyResourceValues);

    const observation = await user.action(api.repository.alchemyState.observe, {
      repositoryId: ids.repositoryId,
      deploymentName: "ideal-dolphin-15",
    });

    expect(observation).toEqual({
      deploymentName: "ideal-dolphin-15",
      stacks: [
        {
          name: "BaseAlchemy",
          stages: [
            {
              name: "main",
              resources: [
                { fqn: "Deployment", value: observedAlchemyResourceValues["main"]?.["Deployment"] },
              ],
              output: observedAlchemyOutputs["main"],
            },
            {
              name: "renovate-hono-4-x-73ca1d1d",
              resources: [
                {
                  fqn: "Deployment",
                  value:
                    observedAlchemyResourceValues["renovate-hono-4-x-73ca1d1d"]?.["Deployment"],
                },
                {
                  fqn: "PreviewComment",
                  value:
                    observedAlchemyResourceValues["renovate-hono-4-x-73ca1d1d"]?.["PreviewComment"],
                },
              ],
              output: observedAlchemyOutputs["renovate-hono-4-x-73ca1d1d"],
            },
          ],
        },
      ],
    });

    const functionRequests = requests.filter((request) => request.url.endsWith("/api/function"));
    expect(functionRequests).toHaveLength(9);
    expect(
      new Set(
        functionRequests.map((request) =>
          isRecord(request.body) ? request.body["componentPath"] : null,
        ),
      ),
    ).toEqual(new Set(["alchemyState"]));
    expect(new Set(functionRequests.map((request) => request.authorization))).toEqual(
      new Set(["Convex prod:ideal-dolphin-15|alchemy-state-secret"]),
    );
    expect(requests.find((request) => request.url.endsWith("/delete_deploy_key"))?.body).toEqual({
      id: "samebase-alchemyState-ideal-dolphin-15-ltk9ukg0",
    });
  });

  it("keeps the key of a secret and never returns its value", async () => {
    const t = makeConvexTest();
    const { ids, user } = await seedAlchemyRepository(t);
    const capturedDeployment = observedAlchemyResourceValues["main"]?.["Deployment"];
    if (typeof capturedDeployment !== "string") {
      throw new Error("Expected the captured main Deployment state.");
    }
    // The captured state holds no secret, so this adds the envelope that `encodeState` writes for a
    // `Redacted` attribute.
    const deploymentWithSecret: unknown = JSON.parse(capturedDeployment);
    if (!isRecord(deploymentWithSecret) || !isRecord(deploymentWithSecret["attr"])) {
      throw new Error("Expected the captured Deployment attributes.");
    }
    deploymentWithSecret["attr"]["deployKey"] = {
      __redacted__: "prod:ideal-dolphin-15|state-secret-value",
    };
    installAlchemyStateFetchStub([], {
      ...observedAlchemyResourceValues,
      main: { Deployment: JSON.stringify(deploymentWithSecret) },
    });

    const observation = await user.action(api.repository.alchemyState.observe, {
      repositoryId: ids.repositoryId,
      deploymentName: "ideal-dolphin-15",
    });

    const value = observation.stacks[0]?.stages[0]?.resources[0]?.value ?? "";
    expect(value).not.toContain("state-secret-value");
    expect(JSON.parse(value)).toMatchObject({ attr: { deployKey: { __redacted__: null } } });
  });
});
