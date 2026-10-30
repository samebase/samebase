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
import {
  insertTestOrganizationBillingAccount,
  makeConvexTest,
  sealTestCredentials,
  testCredential,
} from "../test.setup";
import {
  observedAlchemyStackReply,
  observedBaseAlchemyProject,
} from "./fixtures/observedAlchemyState";
import { observedSamebaseStacksReply } from "./fixtures/observedSamebaseAlchemyState";

const storeProject = {
  createTime: 1710000000000,
  id: 3259168,
  name: "samebase",
  slug: "samebase",
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
        auth: { method: "api_key", credential: testCredential("convex-api-key") },
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
  await sealTestCredentials(t);

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

/** Answers the store read and the preview read of the attached base-alchemy project. */
function installConvexFetchStub(storeReply: unknown) {
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
        body["path"] === "state:stacks"
      ) {
        return jsonResponse(observedSamebaseStacksReply);
      }
      if (
        url === "https://artful-alligator-66.convex.cloud/api/function" &&
        isRecord(body) &&
        body["path"] === "state:readStack"
      ) {
        return jsonResponse(storeReply);
      }
      if (url === "https://api.convex.dev/v1/projects/3245938") {
        return jsonResponse(observedBaseAlchemyProject);
      }
      if (url.startsWith("https://api.convex.dev/v1/projects/3245938/list_deployments?")) {
        return jsonResponse([]);
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
  it("keeps GitHub enrichment without rereading the store or attachments for a live source", async () => {
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
      if (query.includes("query PullRequestResourceHeads")) return { nodes: [pullRequest24] };
      throw new Error("Only the heads query is answered in this test.");
    });
    installConvexFetchStub(observedAlchemyStackReply);

    const [resources] = await user.action(
      api.repository.pullRequestResources.getPullRequestResources,
      { repositoryId: ids.repositoryId, pullRequestIds: ["PR_24"], source: "alchemy" },
    );

    expect(fetch).not.toHaveBeenCalled();
    expect(githubMocks.graphql).toHaveBeenCalled();
    expect(resources).toMatchObject({
      state: "available",
      workers: [],
      convexProjects: [],
      hostingPreviews: {
        cloudflare: { state: "available" },
        netlify: { state: "available" },
      },
    });
  });

  it("reads the attachment row and not the store for source attachments", async () => {
    const t = makeConvexTest();
    const { ids, user } = await seedBaseAlchemy(t);
    // Like samebase/samebase: the stack and an attachment row of the project it deploys.
    const convexProjectId = await t.run(
      async (ctx) =>
        await ctx.db.insert("repositoryConvexProjects", {
          repositoryId: ids.repositoryId,
          organizationId: ids.organizationId,
          teamId: "38516",
          projectId: "3245938",
          convexConfigPath: "convex.json",
          origin: "selected_existing",
        }),
    );
    githubMocks.graphql.mockImplementation(async (query: string) => {
      if (query.includes("query PullRequestResourceHeads")) {
        return { nodes: [pullRequest24] };
      }
      throw new Error("Only the heads query is answered in this test.");
    });
    installConvexFetchStub(observedAlchemyStackReply);

    const [resources] = await user.action(
      api.repository.pullRequestResources.getPullRequestResources,
      { repositoryId: ids.repositoryId, pullRequestIds: ["PR_24"], source: "attachments" },
    );

    expect(
      vi
        .mocked(fetch)
        .mock.calls.map(([input]) => (input instanceof Request ? input.url : String(input))),
    ).not.toContain("https://api.convex.dev/v1/teams/38516/projects?limit=100");
    // The attached project gives the branch-name match, and the stage pr-24 of the store is not read.
    expect(resources).toMatchObject({
      state: "available",
      pullRequestId: "PR_24",
      convexProjects: [{ state: "absent", convexProjectId, rootDirectory: "/" }],
    });
  });
});
