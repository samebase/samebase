import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  createConvexManagementApi,
  type CreateDeployKeyResponse,
  type ListDeploymentsResponse,
  type ListProjectsResponse,
  type PlatformDeploymentResponse,
} from "./client";
import { ConvexManagementApiError } from "./errors";

const LARGE_CONVEX_ID = "9223372036854775807";
const LARGE_CONVEX_PARENT_ID = "9223372036854775806";

const expectType =
  <Expected>() =>
  <Actual>(
    value: Actual,
    input: Expected extends Actual
      ? Actual extends Expected
        ? true
        : never
      : never,
  ) => {
    void value;
    void input;
  };

function assertConvexManagementTypes(): void {
  const convex = createConvexManagementApi("team-token");

  expectType<Promise<ListProjectsResponse>>()(
    convex.listProjects({ teamId: LARGE_CONVEX_ID }),
    true,
  );
  expectType<Promise<ListDeploymentsResponse>>()(
    convex.listDeployments({ projectId: LARGE_CONVEX_ID }),
    true,
  );
  expectType<Promise<PlatformDeploymentResponse>>()(
    convex.createDeployment({
      deploymentType: "prod",
      projectId: LARGE_CONVEX_ID,
    }),
    true,
  );
  expectType<Promise<CreateDeployKeyResponse>>()(
    convex.createDeployKey({
      deploymentName: "happy-animal-123",
      name: "deploy key",
    }),
    true,
  );
  expectType<Promise<void>>()(
    convex.deleteProject({ projectId: LARGE_CONVEX_ID }),
    true,
  );

  // @ts-expect-error The team ID is required.
  void convex.listProjects({});

  void convex.createDeployment({
    // @ts-expect-error Deployment creation only supports prod and dev here.
    deploymentType: "preview",
    projectId: LARGE_CONVEX_ID,
  });
}
void assertConvexManagementTypes;

describe("Convex Management API client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("sends named generated SDK requests with auth headers", async () => {
    const requests: Request[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Request) => {
        requests.push(input);
        return new Response(
          JSON.stringify([
            {
              createTime: 1710000000000,
              id: LARGE_CONVEX_ID,
              name: "Noter",
              slug: "noter",
              teamId: LARGE_CONVEX_PARENT_ID,
              teamSlug: "noter-team",
            },
          ]),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }),
    );

    const convex = createConvexManagementApi("team-token");

    await expect(
      convex.listProjects({ teamId: LARGE_CONVEX_PARENT_ID }),
    ).resolves.toEqual([
      {
        createTime: 1710000000000,
        id: LARGE_CONVEX_ID,
        name: "Noter",
        slug: "noter",
        teamId: LARGE_CONVEX_PARENT_ID,
        teamSlug: "noter-team",
      },
    ]);

    expect(requests.map(readRequest)).toEqual([
      {
        authorization: "Bearer team-token",
        contentType: null,
        method: "GET",
        url: `https://api.convex.dev/v1/teams/${LARGE_CONVEX_PARENT_ID}/list_projects`,
      },
    ]);
  });

  it("builds operator endpoints through the generated client", () => {
    const convex = createConvexManagementApi("team-token");

    expect(
      convex.endpoints.deploymentInProject({
        projectId: LARGE_CONVEX_ID,
        defaultProd: true,
      }),
    ).toBe(`/projects/${LARGE_CONVEX_ID}/deployment?defaultProd=true`);
  });

  it("sends JSON bodies for generated POST requests", async () => {
    const requests: Request[] = [];
    const bodies: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Request) => {
        requests.push(input);
        bodies.push(await input.text());
        return new Response(
          JSON.stringify({
            class: "s16",
            createTime: 1710000000000,
            deploymentType: "prod",
            deploymentUrl: "https://noter.convex.cloud",
            id: LARGE_CONVEX_ID,
            isDefault: true,
            kind: "cloud",
            name: "noter-prod",
            projectId: LARGE_CONVEX_PARENT_ID,
            reference: "prod",
            region: "aws-us-east-1",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }),
    );

    const convex = createConvexManagementApi("team-token");

    await expect(
      convex.createDeployment({
        deploymentType: "prod",
        projectId: LARGE_CONVEX_PARENT_ID,
      }),
    ).resolves.toMatchObject({
      id: LARGE_CONVEX_ID,
      kind: "cloud",
      projectId: LARGE_CONVEX_PARENT_ID,
    });

    expect(requests.map(readRequest)).toEqual([
      {
        authorization: "Bearer team-token",
        contentType: "application/json",
        method: "POST",
        url: `https://api.convex.dev/v1/projects/${LARGE_CONVEX_PARENT_ID}/create_deployment`,
      },
    ]);
    expect(bodies).toEqual([JSON.stringify({ type: "prod" })]);
  });

  it("fails closed when a provider ID arrives as a JSON number", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          `[
            {
              "createTime": 1710000000000,
              "id": ${LARGE_CONVEX_ID},
              "name": "Noter",
              "slug": "noter",
              "teamId": "${LARGE_CONVEX_PARENT_ID}",
              "teamSlug": "noter-team"
            }
          ]`,
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }),
    );

    const convex = createConvexManagementApi("team-token");

    await expect(
      convex.listProjects({ teamId: LARGE_CONVEX_PARENT_ID }),
    ).rejects.toThrow(
      `Convex API response for /teams/${LARGE_CONVEX_PARENT_ID}/list_projects did not match list projects response: /0/id`,
    );
  });

  it("keeps provider error responses status-addressable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(JSON.stringify({ message: "deployment missing" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    const convex = createConvexManagementApi("team-token");

    await expect(
      convex.getDeployment({ deploymentName: "missing-deployment" }),
    ).rejects.toMatchObject({
      message:
        "Convex API request failed (404) for /deployments/missing-deployment: deployment missing",
      path: "/deployments/missing-deployment",
      responseBodySummary: "deployment missing",
      status: 404,
    } satisfies Partial<ConvexManagementApiError>);
  });

  it("sends empty destructive POST requests without JSON content headers", async () => {
    const requests: Request[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Request) => {
        requests.push(input);
        return new Response("", { status: 200 });
      }),
    );

    const convex = createConvexManagementApi("team-token");

    await expect(
      convex.deleteProject({ projectId: "123" }),
    ).resolves.toBeUndefined();

    expect(requests.map(readRequest)).toEqual([
      {
        authorization: "Bearer team-token",
        contentType: null,
        method: "POST",
        url: "https://api.convex.dev/v1/projects/123/delete",
      },
    ]);
  });
});

function readRequest(request: Request): {
  authorization: string | null;
  contentType: string | null;
  method: string;
  url: string;
} {
  return {
    authorization: request.headers.get("Authorization"),
    contentType: request.headers.get("Content-Type"),
    method: request.method,
    url: request.url,
  };
}
