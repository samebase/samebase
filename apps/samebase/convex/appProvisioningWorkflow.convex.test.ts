import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { internal } from "./_generated/api";
import { runComposedInfrastructure } from "./appProvisioningWorkflow";
import { isRecord } from "./jsonUtils";
import { makeConvexTest } from "./test.setup";

function cloudflareResponse(result: unknown): Response {
  return Response.json({ success: true, errors: [], messages: [], result });
}

function recordedCloudflareEnvironment(body: unknown) {
  if (!isRecord(body)) {
    return {};
  }

  const environment: Record<
    string,
    { created_on: string; is_secret: boolean; value: string | null }
  > = {};
  for (const [key, value] of Object.entries(body)) {
    if (!isRecord(value)) {
      continue;
    }
    const isSecret = value.is_secret === true;
    environment[key] = {
      created_on: "2026-07-16T00:00:00Z",
      is_secret: isSecret,
      value: isSecret ? null : typeof value.value === "string" ? value.value : null,
    };
  }
  return environment;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("app provisioning workflow composition", () => {
  it("reads the target app and explicit provider dependency state", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const runId = await ctx.db.insert("appProvisioningRuns", {
        userId,
        vaultId,
        repositoryFullName: "ada/composed-app",
        trigger: "create",
        state: "running",
        currentStep: "sync_tree",
        createdAt: 10,
        updatedAt: 20,
      });
      await ctx.db.replace(vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "create_repository",
        runId,
        ghRepoId: "123",
        ghRepoNodeId: "R_123",
        githubOwner: "ada",
        githubName: "composed-app",
        routeRepositoryKey: "ada/composed-app",
        routeOwner: "ada",
        routeName: "composed-app",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 12,
      });
      const appId = await ctx.db.insert("vaultApps", {
        vaultId,
        userId,
        rootDirectory: "/",
        createdAt: 25,
      });
      await ctx.db.insert("vaultInfrastructureTargets", {
        vaultId,
        appId,
        convex: {
          projectName: "composed-app",
        },
        cloudflare: {
          accountId: "cloudflare-account",
          workerName: "composed-app",
        },
        createdAt: 30,
      });
      return { appId, userId, vaultId };
    });

    await expect(
      t.query(internal.appProvisioningWorkflow.readComposedInfrastructureState, {
        userId: ids.userId,
        vaultId: ids.vaultId,
      }),
    ).resolves.toEqual({
      appId: ids.appId,
      convex: {
        state: "not_attached",
        projectName: "composed-app",
      },
      cloudflare: {
        state: "not_attached",
        accountId: "cloudflare-account",
        workerName: "composed-app",
      },
    });

    const providerIds = await t.run(async (ctx) => {
      const convexDeploymentId = await ctx.db.insert("vaultConvexDeployments", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appId: ids.appId,
        projectId: "convex-project",
        teamSlug: "ada-team",
        projectSlug: "composed-app",
        deploymentName: "composed-app-prod",
        deploymentType: "prod",
        cloudUrl: "https://composed-app-prod.convex.cloud",
        siteUrl: "https://composed-app-prod.convex.site",
        previewDeployment: {
          state: "ready",
          deploymentName: "composed-app-dev",
          cloudUrl: "https://composed-app-dev.convex.cloud",
        },
        origin: "provisioned",
        connectedAt: 40,
        lastObservedAt: 40,
      });
      const workerId = await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appId: ids.appId,
        accountId: "cloudflare-account",
        workerName: "composed-app",
        workerTag: "composed-worker-tag",
        workersDevUrl: "https://composed-app.ada.workers.dev",
        origin: "provisioned",
        builds: {
          state: "connected",
          buildCommand: "pnpm run build",
          deployCommand: "pnpm run deploy",
          previewDeployCommand: "pnpm run deploy:preview",
          pathIncludes: ["*"],
          pathExcludes: [],
          production: {
            triggerUuid: "production-trigger",
            buildTokenUuid: "build-token",
          },
          preview: {
            triggerUuid: "preview-trigger",
            buildTokenUuid: "build-token",
          },
        },
        connectedAt: 50,
        lastObservedAt: 50,
      });
      await ctx.db.insert("vaultWorkerDeploymentDependencies", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        workerId,
        convexDeploymentId,
        wiring: {
          state: "wired",
          deployKeys: {
            production: {
              state: "created",
              name: "prod-key",
              deploymentName: "convex-prod",
            },
            preview: {
              state: "created",
              name: "preview-key",
              projectId: "convex-project-id",
            },
          },
        },
        createdAt: 50,
        updatedAt: 50,
      });
      return { convexDeploymentId, workerId };
    });

    await expect(
      t.query(internal.appProvisioningWorkflow.readComposedInfrastructureState, {
        userId: ids.userId,
        vaultId: ids.vaultId,
      }),
    ).resolves.toEqual({
      appId: ids.appId,
      convex: {
        state: "attached",
        projectName: "composed-app",
        deploymentId: providerIds.convexDeploymentId,
      },
      cloudflare: {
        state: "attached",
        accountId: "cloudflare-account",
        workerName: "composed-app",
        workerId: providerIds.workerId,
        convexBuildAccessWired: true,
        workersDevUrl: "https://composed-app.ada.workers.dev",
      },
    });

    await t.run(async (ctx) => {
      const convexDeployment = await ctx.db.get(providerIds.convexDeploymentId);
      if (!convexDeployment) {
        throw new Error("Expected Convex deployment.");
      }
      await ctx.db.patch(convexDeployment._id, {
        upstream: { state: "missing_upstream" },
      });
    });

    await expect(
      t.query(internal.appProvisioningWorkflow.readComposedInfrastructureState, {
        userId: ids.userId,
        vaultId: ids.vaultId,
      }),
    ).resolves.toEqual({
      appId: ids.appId,
      convex: {
        state: "not_attached",
        projectName: "composed-app",
      },
      cloudflare: {
        state: "attached",
        accountId: "cloudflare-account",
        workerName: "composed-app",
        workerId: providerIds.workerId,
        convexBuildAccessWired: false,
        workersDevUrl: "https://composed-app.ada.workers.dev",
      },
    });

    await t.run(async (ctx) => {
      const worker = await ctx.db.get(providerIds.workerId);
      if (!worker) {
        throw new Error("Expected Cloudflare Worker.");
      }
      await ctx.db.patch(worker._id, {
        upstream: { state: "missing_upstream" },
      });
    });

    await expect(
      t.query(internal.appProvisioningWorkflow.readComposedInfrastructureState, {
        userId: ids.userId,
        vaultId: ids.vaultId,
      }),
    ).resolves.toEqual({
      appId: ids.appId,
      convex: {
        state: "not_attached",
        projectName: "composed-app",
      },
      cloudflare: {
        state: "not_attached",
        accountId: "cloudflare-account",
        workerName: "composed-app",
      },
    });
  });

  it("wires the explicit Convex dependency before publishing Worker Builds as connected", async () => {
    vi.useFakeTimers({ now: 1_800_000_000_000 });
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      await ctx.db.insert("providerConnections", {
        kind: "github",
        userId,
        githubAccountId: 101,
        auth: { method: "api_key", credential: "github-token" },
        username: "ada",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("providerConnections", {
        kind: "convex",
        userId,
        auth: { method: "api_key", credential: "convex-token" },
        teamId: "1000",
        teamSlug: "ada-team",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("providerConnections", {
        kind: "cloudflare",
        userId,
        auth: {
          method: "oauth",
          credential: "cloudflare-token",
          refreshCredential: "cloudflare-refresh-token",
          credentialExpiresAt: 4_102_444_800_000,
        },
        defaultAccount: {
          state: "selected",
          accountId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          accountName: "Ada Cloud",
        },
        createdAt: 1,
        updatedAt: 1,
      });
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const sourceRunId = await ctx.db.insert("appProvisioningRuns", {
        userId,
        vaultId,
        repositoryFullName: "ada/composed-app",
        trigger: "create",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 10,
        updatedAt: 20,
        completedAt: 20,
      });
      await ctx.db.replace(vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "create_repository",
        runId: sourceRunId,
        ghRepoId: "123",
        ghRepoNodeId: "R_123",
        githubOwner: "ada",
        githubName: "composed-app",
        routeRepositoryKey: "ada/composed-app",
        routeOwner: "ada",
        routeName: "composed-app",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 20,
      });
      const appId = await ctx.db.insert("vaultApps", {
        vaultId,
        userId,
        rootDirectory: "apps/web",
        createdAt: 25,
      });
      await ctx.db.insert("vaultInfrastructureTargets", {
        vaultId,
        appId,
        convex: { projectName: "composed-app" },
        cloudflare: {
          accountId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          workerName: "composed-app",
        },
        createdAt: 30,
      });
      const convexDeploymentId = await ctx.db.insert("vaultConvexDeployments", {
        vaultId,
        userId,
        appId,
        projectId: "1001",
        teamSlug: "ada-team",
        projectSlug: "composed-app",
        deploymentName: "composed-app-prod",
        deploymentType: "prod",
        cloudUrl: "https://composed-app-prod.convex.cloud",
        siteUrl: "https://composed-app-prod.convex.site",
        previewDeployment: { state: "not_ensured" },
        origin: "provisioned",
        upstream: { state: "present" },
        connectedAt: 35,
        lastObservedAt: 35,
      });
      const workerId = await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId,
        userId,
        appId,
        accountId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        workerName: "composed-app",
        workerTag: "worker-tag",
        workersDevUrl: "https://composed-app.ada.workers.dev",
        origin: "provisioned",
        upstream: { state: "present" },
        builds: { state: "not_connected" },
        connectedAt: 40,
        lastObservedAt: 40,
      });
      const runId = await ctx.db.insert("appProvisioningRuns", {
        userId,
        vaultId,
        repositoryFullName: "ada/composed-app",
        trigger: "retry",
        state: "queued",
        currentStep: "claim_infra",
        createdAt: 45,
        updatedAt: 45,
      });

      return { convexDeploymentId, runId, userId, vaultId, workerId };
    });

    const expectedPathIncludes = [
      "apps/web/*",
      ".node-version",
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
    ];
    const providerSequence: string[] = [];
    const triggerBodies: unknown[] = [];
    const environmentByTrigger = new Map<
      string,
      ReturnType<typeof recordedCloudflareEnvironment>
    >();
    let triggerReadCount = 0;
    let triggerCreateCount = 0;
    let stateAtInitialBuild: unknown = null;

    const createdTriggers = () => [
      {
        trigger_uuid: "created-trigger-1",
        build_token_uuid: "reusable-build-token",
        trigger_name: "Production Deploy",
        branch_includes: ["main"],
        branch_excludes: [],
        build_command: "pnpm run build",
        deploy_command: "pnpm run deploy",
        root_directory: "apps/web",
        path_includes: expectedPathIncludes,
        path_excludes: [],
        repo_connection: {
          repo_connection_uuid: "repo-connection",
          repo_id: "123",
          repo_name: "ada/composed-app",
        },
      },
      {
        trigger_uuid: "created-trigger-2",
        build_token_uuid: "reusable-build-token",
        trigger_name: "Preview Deploy",
        branch_includes: ["*"],
        branch_excludes: ["main"],
        build_command: "pnpm run build",
        deploy_command: "pnpm run deploy:preview",
        root_directory: "apps/web",
        path_includes: expectedPathIncludes,
        path_excludes: [],
        repo_connection: {
          repo_connection_uuid: "repo-connection",
          repo_id: "123",
          repo_name: "ada/composed-app",
        },
      },
    ];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init);
        const url = new URL(request.url);
        const bodyText = await request.clone().text();
        const body: unknown = bodyText ? JSON.parse(bodyText) : null;

        if (url.hostname === "api.github.com" && url.pathname === "/graphql") {
          return Response.json({
            data: {
              repository: {
                __typename: "Repository",
                id: "R_123",
                databaseId: 123,
                name: "composed-app",
                nameWithOwner: "ada/composed-app",
                owner: { login: "ada", databaseId: 456 },
              },
              rateLimit: {
                cost: 1,
                limit: 5_000,
                remaining: 4_999,
                resetAt: "2027-01-15T09:00:00Z",
              },
            },
          });
        }

        if (url.hostname === "api.convex.dev") {
          switch (url.pathname) {
            case "/v1/projects/1001":
              return Response.json({
                createTime: 1_710_000_000_000,
                id: 1001,
                name: "Composed App",
                slug: "composed-app",
                teamId: 1000,
                teamSlug: "ada-team",
              });
            case "/v1/projects/1001/deployment":
              return Response.json({
                class: "s16",
                createTime: 1_710_000_000_000,
                deploymentType: "dev",
                deploymentUrl: "https://composed-app-dev.convex.cloud",
                id: 2001,
                isDefault: true,
                kind: "cloud",
                name: "composed-app-dev",
                projectId: 1001,
                reference: "dev",
                region: "aws-us-east-1",
              });
            case "/v1/deployments/composed-app-prod/create_deploy_key":
              providerSequence.push("convex-production-key");
              return Response.json({ deployKey: "prod:composed-app-prod|production-secret" });
            case "/v1/projects/1001/create_preview_deploy_key":
              providerSequence.push("convex-preview-key");
              return Response.json({ previewDeployKey: "preview:1001|preview-secret" });
          }
        }

        if (url.hostname === "api.cloudflare.com") {
          if (request.method === "GET" && url.pathname === "/client/v4/accounts") {
            return cloudflareResponse([
              {
                id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                name: "Ada Cloud",
                type: "standard",
              },
            ]);
          }
          if (
            request.method === "PUT" &&
            url.pathname ===
              "/client/v4/accounts/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/builds/repos/connections"
          ) {
            return cloudflareResponse({ repo_connection_uuid: "repo-connection" });
          }
          if (
            request.method === "GET" &&
            url.pathname ===
              "/client/v4/accounts/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/builds/workers/worker-tag/triggers"
          ) {
            const result = triggerReadCount === 0 ? [] : createdTriggers();
            triggerReadCount += 1;
            return cloudflareResponse(result);
          }
          if (
            request.method === "GET" &&
            url.pathname === "/client/v4/accounts/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/builds/tokens"
          ) {
            return cloudflareResponse([
              {
                build_token_uuid: "reusable-build-token",
                build_token_name: "samebase build token",
                cloudflare_token_id: "opaque-oauth-token-id",
              },
            ]);
          }
          if (
            request.method === "POST" &&
            url.pathname === "/client/v4/accounts/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/builds/triggers"
          ) {
            triggerCreateCount += 1;
            triggerBodies.push(body);
            providerSequence.push(`cloudflare-trigger-${triggerCreateCount}`);
            return cloudflareResponse({ trigger_uuid: `created-trigger-${triggerCreateCount}` });
          }

          const environmentMatch = url.pathname.match(
            /^\/client\/v4\/accounts\/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\/builds\/triggers\/([^/]+)\/environment_variables$/,
          );
          if (environmentMatch) {
            const triggerUuid = environmentMatch[1];
            if (request.method === "PATCH") {
              environmentByTrigger.set(triggerUuid, recordedCloudflareEnvironment(body));
              providerSequence.push(`cloudflare-environment-write-${triggerUuid}`);
              return cloudflareResponse(environmentByTrigger.get(triggerUuid));
            }
            if (request.method === "GET") {
              providerSequence.push(`cloudflare-environment-read-${triggerUuid}`);
              return cloudflareResponse(environmentByTrigger.get(triggerUuid) ?? {});
            }
          }

          if (
            request.method === "POST" &&
            url.pathname ===
              "/client/v4/accounts/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/builds/triggers/created-trigger-1/builds"
          ) {
            providerSequence.push("cloudflare-initial-build");
            stateAtInitialBuild = await t.run(async (ctx) => {
              const dependency = await ctx.db
                .query("vaultWorkerDeploymentDependencies")
                .withIndex("by_worker", (q) => q.eq("workerId", ids.workerId))
                .unique();
              return {
                dependencyWiring: dependency?.wiring,
                run: await ctx.db.get(ids.runId),
                worker: await ctx.db.get(ids.workerId),
              };
            });
            return cloudflareResponse({});
          }
        }

        throw new Error(`Unexpected provider request: ${request.method} ${request.url}`);
      }),
    );

    const convexTestWorkflowStep = {
      workflowId: "test-composed-workflow",
      runAction: t.action,
      runMutation: t.mutation,
      runQuery: t.query,
    };
    await runComposedInfrastructure(
      // @ts-expect-error convex-test exposes the three runners used here without Workflow options.
      convexTestWorkflowStep,
      {
        defaultBranch: "main",
        parentRunId: ids.runId,
        userId: ids.userId,
        vaultId: ids.vaultId,
      },
    );

    expect(triggerBodies).toHaveLength(2);
    expect(triggerBodies).toEqual([
      expect.objectContaining({
        trigger_name: "Production Deploy",
        root_directory: "apps/web",
        path_includes: expectedPathIncludes,
      }),
      expect.objectContaining({
        trigger_name: "Preview Deploy",
        root_directory: "apps/web",
        path_includes: expectedPathIncludes,
      }),
    ]);
    expect(providerSequence).toEqual([
      "cloudflare-trigger-1",
      "cloudflare-trigger-2",
      "convex-production-key",
      "convex-preview-key",
      "cloudflare-environment-write-created-trigger-1",
      "cloudflare-environment-write-created-trigger-2",
      "cloudflare-environment-read-created-trigger-1",
      "cloudflare-environment-read-created-trigger-2",
      "cloudflare-initial-build",
    ]);
    expect(stateAtInitialBuild).toMatchObject({
      dependencyWiring: {
        state: "not_wired",
        deployKeys: {
          production: { state: "created" },
          preview: { state: "created" },
        },
      },
      run: { state: "running" },
      worker: { builds: { state: "not_connected" } },
    });

    const persisted = await t.run(async (ctx) => {
      const dependency = await ctx.db
        .query("vaultWorkerDeploymentDependencies")
        .withIndex("by_worker", (q) => q.eq("workerId", ids.workerId))
        .unique();
      const ownership = await ctx.db
        .query("vaultInfrastructureOwnership")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .unique();
      return {
        convexDeployment: await ctx.db.get(ids.convexDeploymentId),
        dependency,
        ownership,
        run: await ctx.db.get(ids.runId),
        worker: await ctx.db.get(ids.workerId),
      };
    });
    expect(persisted).toMatchObject({
      convexDeployment: {
        previewDeployment: {
          state: "ready",
          deploymentName: "composed-app-dev",
        },
      },
      dependency: {
        wiring: {
          state: "wired",
          deployKeys: {
            production: { state: "created" },
            preview: { state: "created" },
          },
        },
      },
      ownership: { state: "succeeded", runId: ids.runId },
      run: { state: "succeeded", currentStep: "finish" },
      worker: {
        builds: {
          state: "connected",
          pathIncludes: expectedPathIncludes,
          production: { triggerUuid: "created-trigger-1" },
          preview: { triggerUuid: "created-trigger-2" },
        },
      },
    });
  });
});
