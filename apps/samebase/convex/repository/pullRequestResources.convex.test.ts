import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const githubMocks = vi.hoisted(() => ({
  graphql: vi.fn(),
}));

vi.mock("../githubAppAccess", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../githubAppAccess")>();
  return {
    ...actual,
    resolveGitHubAppAccess: async () => ({ octokit: { graphql: githubMocks.graphql } }),
  };
});

import { api } from "../_generated/api";
import { isRecord } from "../jsonUtils";
import { insertTestOrganizationBillingAccount, makeConvexTest } from "../test.setup";
import { observedAlchemyStackReply } from "./fixtures/observedAlchemyState";

const storeProject = {
  createTime: 1710000000000,
  id: 3259168,
  name: "alchemy-state",
  slug: "alchemy-state",
  teamId: 38516,
  teamSlug: "nicu",
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/**
samebase/base-alchemy as the preview deployment of Samebase holds it: a connected repository of an
organization with a Convex connection, and no attachment row.
*/
async function seedBaseAlchemy(t: ReturnType<typeof makeConvexTest>) {
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
      deletion: { state: "not_deleting" },
      createdAt: 1,
      state: "connected",
      githubMode: "connect_existing_repository",
      runId,
      githubRepositoryDatabaseId: "123",
      githubRepositoryName: "base-alchemy",
      visibility: "public",
      defaultBranch: "main",
      connectedAt: 20,
    });

    return { organizationId, repositoryId, userId };
  });

  return {
    ids,
    user: t.withIdentity({ subject: ids.userId, tokenIdentifier: `test:${ids.userId}` }),
  };
}

/** The head of samebase/base-alchemy#24 as the GitHub GraphQL heads query answers it. */
const pullRequest24 = {
  __typename: "PullRequest",
  id: "PR_24",
  state: "OPEN",
  repository: { databaseId: 123 },
  number: 24,
  isCrossRepository: false,
  baseRefOid: "a4d98f2ad150dee07e19fa9c348e70240aca1dac",
  headRefOid: "078b296b3d5a3e191223ef3af18ad87c9ed8cb8d",
  headRepository: { id: "R_base_alchemy" },
  headRefName: "renovate/js-yaml-5.x",
  comments: {
    totalCount: 0,
    pageInfo: { hasNextPage: false, endCursor: null },
    nodes: [],
  },
  commits: {
    totalCount: 1,
    pageInfo: { hasPreviousPage: false, startCursor: null },
    nodes: [{ commit: { id: "C_24", oid: "078b296b3d5a3e191223ef3af18ad87c9ed8cb8d" } }],
  },
};

/** A pull request of samebase/base-alchemy whose number has no stage in the captured stack. */
const pullRequest26 = {
  ...pullRequest24,
  id: "PR_26",
  number: 26,
  headRefOid: "5d0c3a1f6b7e8d9c0a1b2c3d4e5f60718293a4b5",
  headRefName: "attached-preview",
  commits: {
    totalCount: 1,
    pageInfo: { hasPreviousPage: false, startCursor: null },
    nodes: [{ commit: { id: "C_26", oid: "5d0c3a1f6b7e8d9c0a1b2c3d4e5f60718293a4b5" } }],
  },
};

/** A Convex preview deployment of the attached project 3245938 for the branch `previewIdentifier`. */
function attachedPreviewDeployment(args: { id: number; name: string; previewIdentifier: string }) {
  const { id, name, previewIdentifier } = args;
  return {
    class: "s16",
    createTime: 1710000000000,
    deploymentType: "preview",
    deploymentUrl: `https://${name}.convex.cloud`,
    id,
    isDefault: false,
    kind: "cloud",
    name,
    previewIdentifier,
    projectId: 3245938,
    reference: `preview/${previewIdentifier}`,
    region: "aws-us-east-1",
  };
}

/**
Answers the reads of the team store with `storeReply`, and the reads of the attached Convex project
3245938 with `attachedPreviewDeployments` as its preview deployments.
*/
function installStoreFetchStub(
  storeReply: unknown,
  attachedPreviewDeployments: readonly unknown[],
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

      if (url === "https://api.convex.dev/v1/teams/38516/projects?limit=100") {
        return jsonResponse({ items: [storeProject], pagination: { hasMore: false } });
      }
      if (url.endsWith("/projects/3259168/deployment?defaultProd=true")) {
        return jsonResponse({
          class: "s16",
          createTime: 1710000000000,
          deploymentType: "prod",
          deploymentUrl: "https://artful-alligator-66.convex.cloud",
          id: 2001,
          isDefault: true,
          kind: "cloud",
          name: "artful-alligator-66",
          projectId: "3259168",
          reference: "production",
          region: "aws-us-east-1",
        });
      }
      if (url.endsWith("/create_deploy_key")) {
        return jsonResponse({ deployKey: "prod:artful-alligator-66|alchemy-state-secret" });
      }
      if (url.endsWith("/delete_deploy_key")) {
        return new Response(null, { status: 200 });
      }
      if (
        url === "https://artful-alligator-66.convex.cloud/api/function" &&
        isRecord(body) &&
        body["path"] === "state:readStack"
      ) {
        return jsonResponse(storeReply);
      }
      if (url === "https://api.convex.dev/v1/projects/3245938") {
        return jsonResponse({
          createTime: 1710000000000,
          id: 3245938,
          name: "base-alchemy",
          slug: "base-alchemy",
          teamId: 38516,
          teamSlug: "nicu",
        });
      }
      if (url.startsWith("https://api.convex.dev/v1/projects/3245938/list_deployments?")) {
        return jsonResponse(attachedPreviewDeployments);
      }

      throw new Error(`Unexpected request: ${url}`);
    }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  githubMocks.graphql.mockReset();
});

describe("pull request resources from the Alchemy state of the team", () => {
  it("reads the preview of samebase/base-alchemy#24 from the captured stack", async () => {
    const t = makeConvexTest();
    const { ids, user } = await seedBaseAlchemy(t);
    githubMocks.graphql.mockImplementation(async (query: string) => {
      if (query.includes("query PullRequestResourceHeads")) {
        return { nodes: [pullRequest24] };
      }
      throw new Error("Only the heads query is answered in this test.");
    });
    installStoreFetchStub(observedAlchemyStackReply, []);

    const [resources] = await user.action(
      api.repository.pullRequestResources.getPullRequestResources,
      { repositoryId: ids.repositoryId, pullRequestIds: ["PR_24"] },
    );

    expect(resources).toMatchObject({
      state: "available",
      pullRequestId: "PR_24",
      workers: [],
      convexProjects: [],
      alchemyPreview: {
        state: "available",
        url: "https://nautical-eagle-647.convex.site",
        convexDeployments: [
          { name: "nautical-eagle-647", url: "https://nautical-eagle-647.convex.cloud" },
        ],
        workers: [],
        headCommit: null,
      },
    });
  });

  it("reads the attached Convex project for a pull request without a stage in the stack", async () => {
    const t = makeConvexTest();
    const { ids, user } = await seedBaseAlchemy(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("repositoryConvexProjects", {
        repositoryId: ids.repositoryId,
        organizationId: ids.organizationId,
        teamId: "38516",
        projectId: "3245938",
        convexConfigPath: "convex.json",
        origin: "selected_existing",
      });
    });
    githubMocks.graphql.mockImplementation(async (query: string) => {
      if (query.includes("query PullRequestResourceHeads")) {
        return { nodes: [pullRequest24, pullRequest26] };
      }
      throw new Error("Only the heads query is answered in this test.");
    });
    installStoreFetchStub(observedAlchemyStackReply, [
      attachedPreviewDeployment({
        id: 3001,
        name: "brave-heron-301",
        previewIdentifier: pullRequest24.headRefName,
      }),
      attachedPreviewDeployment({
        id: 3002,
        name: "quiet-falcon-302",
        previewIdentifier: pullRequest26.headRefName,
      }),
    ]);

    const [resources24, resources26] = await user.action(
      api.repository.pullRequestResources.getPullRequestResources,
      { repositoryId: ids.repositoryId, pullRequestIds: ["PR_24", "PR_26"] },
    );

    // The stage pr-24 holds the preview of #24, so its branch-named deployment is not read.
    expect(resources24).toMatchObject({
      state: "available",
      pullRequestId: "PR_24",
      convexProjects: [],
      alchemyPreview: { state: "available" },
    });
    expect(resources26).toMatchObject({
      state: "available",
      pullRequestId: "PR_26",
      convexProjects: [{ state: "branch", deploymentName: "quiet-falcon-302" }],
      alchemyPreview: { state: "absent" },
    });
  });
});
