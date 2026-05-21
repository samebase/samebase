import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { Client, ClientPathsWithMethod } from "openapi-fetch";

import {
  formatConvexManagementApiEndpoint,
  requestConvexManagementApi,
} from "./client";
import type {
  operations,
  paths,
  PlatformDeploymentResponse,
  PlatformProjectDetails,
} from "./types.generated";

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

function assertConvexManagementRequestTypes(): void {
  type ConvexManagementGetPath = ClientPathsWithMethod<Client<paths>, "get">;
  type ConvexManagementPostPath = ClientPathsWithMethod<Client<paths>, "post">;
  type ListProjectsPathParams =
    operations["list projects"]["parameters"]["path"];

  const listProjectsGetPath: ConvexManagementGetPath =
    "/teams/{team_id}/list_projects";
  const listProjectsPathParams: ListProjectsPathParams = {
    team_id: LARGE_CONVEX_ID,
  };

  expectType<{ team_id: string }>()(listProjectsPathParams, true);
  expectType<Promise<PlatformProjectDetails[]>>()(
    requestConvexManagementApi(
      "team-token",
      "GET",
      "/teams/{team_id}/list_projects",
      {
        params: { path: { team_id: LARGE_CONVEX_ID } },
      },
    ),
    true,
  );
  expectType<Promise<PlatformDeploymentResponse[]>>()(
    requestConvexManagementApi(
      "team-token",
      "GET",
      "/projects/{project_id}/list_deployments",
      { params: { path: { project_id: LARGE_CONVEX_ID } } },
    ),
    true,
  );
  expectType<Promise<void>>()(
    requestConvexManagementApi(
      "team-token",
      "POST",
      "/projects/{project_id}/delete",
      {
        params: { path: { project_id: LARGE_CONVEX_ID } },
      },
    ),
    true,
  );

  expectType<string>()(
    formatConvexManagementApiEndpoint({
      method: "GET",
      path: "/teams/{team_id}/list_projects",
      params: {
        path: {
          team_id: LARGE_CONVEX_ID,
        },
      },
    }),
    true,
  );

  void listProjectsGetPath;

  // @ts-expect-error The list projects endpoint only allows GET.
  const listProjectsPostPath: ConvexManagementPostPath =
    "/teams/{team_id}/list_projects";
  void listProjectsPostPath;

  const numericListProjectsPathParams: ListProjectsPathParams = {
    // @ts-expect-error OpenAPI path IDs must stay decimal strings.
    team_id: 123,
  };
  void numericListProjectsPathParams;

  // @ts-expect-error The team_id path parameter is required.
  const missingListProjectsPathParams: ListProjectsPathParams = {};
  void missingListProjectsPathParams;

  // @ts-expect-error The list projects endpoint requires path parameters.
  void requestConvexManagementApi(
    "team-token",
    "GET",
    "/teams/{team_id}/list_projects",
  );
}
void assertConvexManagementRequestTypes;

describe("Convex Management API request helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("materializes typed OpenAPI path parameters for GET requests", async () => {
    const requests: Request[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Request) => {
        requests.push(input);
        return new Response("[]", {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    await requestConvexManagementApi(
      "team-token",
      "GET",
      "/teams/{team_id}/list_projects",
      { params: { path: { team_id: LARGE_CONVEX_ID } } },
    );

    expect(requests.map(readRequest)).toEqual([
      {
        authorization: "Bearer team-token",
        contentType: null,
        method: "GET",
        url: `https://api.convex.dev/v1/teams/${LARGE_CONVEX_ID}/list_projects`,
      },
    ]);
  });

  it("preserves Convex project IDs from responses as decimal strings", async () => {
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
              "teamId": ${LARGE_CONVEX_PARENT_ID},
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

    await expect(
      requestConvexManagementApi(
        "team-token",
        "GET",
        "/teams/{team_id}/list_projects",
        {
          params: { path: { team_id: LARGE_CONVEX_PARENT_ID } },
        },
      ),
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
  });

  it("preserves Convex deployment and member IDs from responses as decimal strings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          `[
            {
              "class": "s16",
              "createTime": 1710000000000,
              "creator": ${LARGE_CONVEX_PARENT_ID},
              "deploymentType": "prod",
              "deploymentUrl": "https://noter.convex.cloud",
              "id": ${LARGE_CONVEX_ID},
              "isDefault": true,
              "kind": "cloud",
              "name": "noter-prod",
              "projectId": ${LARGE_CONVEX_PARENT_ID},
              "reference": "prod",
              "region": "aws-us-east-1"
            }
          ]`,
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }),
    );

    await expect(
      requestConvexManagementApi(
        "team-token",
        "GET",
        "/projects/{project_id}/list_deployments",
        { params: { path: { project_id: LARGE_CONVEX_PARENT_ID } } },
      ),
    ).resolves.toEqual([
      {
        class: "s16",
        createTime: 1710000000000,
        creator: LARGE_CONVEX_PARENT_ID,
        deploymentType: "prod",
        deploymentUrl: "https://noter.convex.cloud",
        id: LARGE_CONVEX_ID,
        isDefault: true,
        kind: "cloud",
        name: "noter-prod",
        projectId: LARGE_CONVEX_PARENT_ID,
        reference: "prod",
        region: "aws-us-east-1",
      },
    ]);
  });

  it("materializes typed OpenAPI path parameters for empty POST requests", async () => {
    const requests: Request[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Request) => {
        requests.push(input);
        return new Response("", { status: 200 });
      }),
    );

    await requestConvexManagementApi(
      "team-token",
      "POST",
      "/projects/{project_id}/delete",
      { params: { path: { project_id: "123" } } },
    );

    expect(requests.map(readRequest)).toEqual([
      {
        authorization: "Bearer team-token",
        contentType: null,
        method: "POST",
        url: "https://api.convex.dev/v1/projects/123/delete",
      },
    ]);
  });

  it("warns when path segment values need trimming", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          `{
            "class": "s16",
            "createTime": 1710000000000,
            "creator": ${LARGE_CONVEX_PARENT_ID},
            "deploymentType": "prod",
            "deploymentUrl": "https://noter.convex.cloud",
            "id": ${LARGE_CONVEX_ID},
            "isDefault": true,
            "kind": "cloud",
            "name": "team-project",
            "projectId": ${LARGE_CONVEX_PARENT_ID},
            "reference": "prod",
            "region": "aws-us-east-1"
          }`,
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }),
    );

    await requestConvexManagementApi(
      "team-token",
      "GET",
      "/deployments/{deployment_name}",
      { params: { path: { deployment_name: " team-project " } } },
    );

    expect(warn).toHaveBeenCalledWith("convex:api:trimmed_path_parameter", {
      label: "Convex path parameter deployment_name",
      originalLength: 14,
      normalizedLength: 12,
    });
  });

  it("warns when decimal path IDs need trimming", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response("[]", {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    await requestConvexManagementApi(
      "team-token",
      "GET",
      "/teams/{team_id}/list_projects",
      { params: { path: { team_id: ` ${LARGE_CONVEX_ID} ` } } },
    );

    expect(warn).toHaveBeenCalledWith("convex:api:trimmed_path_parameter", {
      label: "Convex path parameter team_id",
      originalLength: LARGE_CONVEX_ID.length + 2,
      normalizedLength: LARGE_CONVEX_ID.length,
    });
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
