import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { Client, ClientPathsWithMethod } from "openapi-fetch";

import {
  listConvexManagementDefaultProductionDeployments,
  listConvexManagementDeploymentRegions,
  listConvexManagementProjects,
  requestConvexManagementApi,
  requestConvexManagementApiOrThrow,
  requireAvailableConvexDeploymentRegion,
} from "./client";
import type {
  CustomRoleResponse,
  DeploymentRegionMetadata,
  operations,
  paths,
  PlatformDeploymentResponse,
  PlatformPaginatedProjectsResponse,
  PlatformTokenDetailsResponse,
  ProjectResponse,
} from "./types.generated";

const LARGE_CONVEX_ID = "9223372036854775807";
const LARGE_CONVEX_PARENT_ID = "9223372036854775806";

const expectType =
  <Expected>() =>
  <Actual>(
    value: Actual,
    input: Expected extends Actual ? (Actual extends Expected ? true : never) : never,
  ) => {
    void value;
    void input;
  };

function assertConvexManagementRequestTypes(): void {
  type ConvexManagementGetPath = ClientPathsWithMethod<Client<paths>, "get">;
  type ConvexManagementPostPath = ClientPathsWithMethod<Client<paths>, "post">;
  type ListProjectsPathParams = operations["list projects"]["parameters"]["path"];

  const listProjectsGetPath: ConvexManagementGetPath = "/teams/{team_id}/projects";
  const listProjectsPathParams: ListProjectsPathParams = {
    team_id: LARGE_CONVEX_ID,
  };

  expectType<{ team_id: string }>()(listProjectsPathParams, true);
  expectType<Promise<PlatformPaginatedProjectsResponse>>()(
    requestConvexManagementApiOrThrow("team-token", "GET", "/teams/{team_id}/projects", {
      params: { path: { team_id: LARGE_CONVEX_ID } },
    }),
    true,
  );
  expectType<Promise<ProjectResponse[]>>()(
    listConvexManagementProjects({ token: "team-token", teamId: LARGE_CONVEX_ID }),
    true,
  );
  expectType<Promise<DeploymentRegionMetadata[]>>()(
    listConvexManagementDeploymentRegions({
      token: "team-token",
      teamId: LARGE_CONVEX_ID,
    }),
    true,
  );
  expectType<Promise<PlatformDeploymentResponse[]>>()(
    listConvexManagementDefaultProductionDeployments({
      token: "team-token",
      teamId: LARGE_CONVEX_ID,
    }),
    true,
  );
  expectType<Promise<PlatformDeploymentResponse[]>>()(
    requestConvexManagementApiOrThrow(
      "team-token",
      "GET",
      "/projects/{project_id}/list_deployments",
      {
        params: { path: { project_id: LARGE_CONVEX_ID } },
      },
    ),
    true,
  );
  expectType<Promise<void>>()(
    requestConvexManagementApiOrThrow("team-token", "POST", "/projects/{project_id}/delete", {
      params: { path: { project_id: LARGE_CONVEX_ID } },
    }),
    true,
  );
  expectType<Promise<CustomRoleResponse>>()(
    requestConvexManagementApiOrThrow("team-token", "POST", "/teams/{team_id}/create_custom_role", {
      params: { path: { team_id: LARGE_CONVEX_PARENT_ID } },
      body: {
        name: "operator",
        statements: [],
      },
    }),
    true,
  );

  const customRoleResponse: CustomRoleResponse = {
    createTime: 1710000000000,
    id: LARGE_CONVEX_ID,
    name: "operator",
    statements: [],
    teamId: LARGE_CONVEX_PARENT_ID,
  };
  expectType<string>()(customRoleResponse.id, true);

  const tokenDetailsResponse: PlatformTokenDetailsResponse = {
    createTime: 1710000000000,
    id: LARGE_CONVEX_ID,
    name: "Samebase OAuth",
    teamId: LARGE_CONVEX_PARENT_ID,
    type: "teamToken",
  };
  expectType<string>()(tokenDetailsResponse.id, true);

  void listProjectsGetPath;

  // @ts-expect-error The list projects endpoint only allows GET.
  const listProjectsPostPath: ConvexManagementPostPath = "/teams/{team_id}/projects";
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
  void requestConvexManagementApiOrThrow("team-token", "GET", "/teams/{team_id}/projects");
}
void assertConvexManagementRequestTypes;

describe("Convex Management API request helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns and logs a non-JSON response without its contents", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("private malformed provider response", { status: 200 })),
    );

    const [valid, failure] = await requestConvexManagementApi(
      "team-token",
      "GET",
      "/teams/{team_id}/projects",
      {
        params: { path: { team_id: LARGE_CONVEX_PARENT_ID } },
      },
    );

    expect(valid).toBe(false);
    if (valid) {
      throw new Error("Expected Convex response parsing to fail.");
    }
    expect(failure).toBe("invalid_json");
    const log = String(error.mock.calls[0]?.[0]);
    expect(log).toContain("provider_response_parse_failed");
    expect(log).toContain('"reason":"invalid_json"');
    expect(log).not.toContain("private malformed provider response");
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("returns every validation issue and logs only schema details", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return Response.json({
          items: [
            {
              createTime: "not-a-number",
              id: "not-a-decimal-id",
              name: "private-provider-value",
              slug: 42,
              teamId: "not-a-team-id",
              teamSlug: 42,
            },
          ],
          pagination: { hasMore: "not-a-boolean" },
        });
      }),
    );

    const [valid, issues] = await requestConvexManagementApi(
      "team-token",
      "GET",
      "/teams/{team_id}/projects",
      {
        params: { path: { team_id: LARGE_CONVEX_PARENT_ID } },
      },
    );

    expect(valid).toBe(false);
    if (valid) {
      throw new Error("Expected Convex response validation to fail.");
    }
    if (!Array.isArray(issues)) {
      throw new Error("Expected AJV validation issues.");
    }
    expect(issues.length).toBeGreaterThan(1);
    const log = String(error.mock.calls[0]?.[0]);
    expect(log).toContain("provider_response_validation_failed");
    expect(log).toContain('"provider":"convex"');
    expect(log).toContain('"schema_path"');
    expect(log).not.toContain("private-provider-value");
    expect(log).not.toContain(LARGE_CONVEX_PARENT_ID);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("materializes typed OpenAPI path parameters for GET requests", async () => {
    const requests: Request[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Request) => {
        requests.push(input);
        return new Response('{"items":[],"pagination":{"hasMore":false}}', {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    await requestConvexManagementApiOrThrow("team-token", "GET", "/teams/{team_id}/projects", {
      params: { path: { team_id: LARGE_CONVEX_ID } },
    });

    expect(requests.map(readRequest)).toEqual([
      {
        authorization: "Bearer team-token",
        contentType: null,
        method: "GET",
        url: `https://api.convex.dev/v1/teams/${LARGE_CONVEX_ID}/projects`,
      },
    ]);
  });

  it("preserves Convex project IDs from responses as decimal strings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          `{
            "items": [
              {
                "createTime": 1710000000000,
                "id": ${LARGE_CONVEX_ID},
                "name": "Samebase",
                "slug": "samebase",
                "teamId": ${LARGE_CONVEX_PARENT_ID},
                "teamSlug": "samebase-team"
              }
            ],
            "pagination": { "hasMore": false }
          }`,
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }),
    );

    await expect(
      requestConvexManagementApiOrThrow("team-token", "GET", "/teams/{team_id}/projects", {
        params: { path: { team_id: LARGE_CONVEX_PARENT_ID } },
      }),
    ).resolves.toEqual({
      items: [
        {
          createTime: 1710000000000,
          id: LARGE_CONVEX_ID,
          name: "Samebase",
          slug: "samebase",
          teamId: LARGE_CONVEX_PARENT_ID,
          teamSlug: "samebase-team",
        },
      ],
      pagination: { hasMore: false },
    });
  });

  it("follows every Convex project page", async () => {
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Request) => {
        requests.push(input.url);
        if (input.url.includes("cursor=second-page")) {
          return Response.json({
            items: [
              {
                createTime: 1710000000001,
                id: 2,
                name: "Beta",
                slug: "beta",
                teamId: 10,
                teamSlug: "samebase-team",
              },
            ],
            pagination: { hasMore: false },
          });
        }
        return Response.json({
          items: [
            {
              createTime: 1710000000000,
              id: 1,
              name: "Alpha",
              slug: "alpha",
              teamId: 10,
              teamSlug: "samebase-team",
            },
          ],
          pagination: { hasMore: true, nextCursor: "second-page" },
        });
      }),
    );

    await expect(
      listConvexManagementProjects({ token: "team-token", teamId: "10" }),
    ).resolves.toMatchObject([{ id: "1" }, { id: "2" }]);
    expect(requests).toEqual([
      "https://api.convex.dev/v1/teams/10/projects?limit=100",
      "https://api.convex.dev/v1/teams/10/projects?cursor=second-page&limit=100",
    ]);
  });

  it("rejects incomplete Convex project pagination metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ items: [], pagination: { hasMore: true } })),
    );

    await expect(
      listConvexManagementProjects({ token: "team-token", teamId: "10" }),
    ).rejects.toThrow("Convex project pagination indicated more results without a cursor.");
  });

  it("lists Convex deployment regions in the product order", async () => {
    const requests: Request[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Request) => {
        requests.push(input);
        return Response.json({
          items: [
            { name: "aws-eu-west-1", displayName: "EU West (Ireland)", available: true },
            { name: "aws-us-east-1", displayName: "US East (N. Virginia)", available: false },
          ],
        });
      }),
    );

    await expect(
      listConvexManagementDeploymentRegions({ token: "team-token", teamId: "10" }),
    ).resolves.toEqual([
      { name: "aws-us-east-1", displayName: "US East (N. Virginia)", available: false },
      { name: "aws-eu-west-1", displayName: "EU West (Ireland)", available: true },
    ]);
    expect(requests.map(readRequest)).toEqual([
      {
        authorization: "Bearer team-token",
        contentType: null,
        method: "GET",
        url: "https://api.convex.dev/v1/teams/10/list_deployment_regions",
      },
    ]);
  });

  it("rejects a production region that the team cannot use", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          items: [
            { name: "aws-us-east-1", displayName: "US East (N. Virginia)", available: false },
            { name: "aws-eu-west-1", displayName: "EU West (Ireland)", available: true },
          ],
        }),
      ),
    );

    await expect(
      requireAvailableConvexDeploymentRegion({
        token: "team-token",
        teamId: "10",
        region: "aws-us-east-1",
      }),
    ).rejects.toThrow(
      "Convex production region US East (N. Virginia) is not available for this team. Choose another region.",
    );
  });

  it("follows every default production deployment page with provider filters", async () => {
    const requests: Request[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Request) => {
        requests.push(input);
        const cursor = new URL(input.url).searchParams.get("cursor");
        return Response.json({
          items: [
            {
              class: "s16",
              createTime: cursor ? 2 : 1,
              creator: "20",
              deploymentType: "prod",
              deploymentUrl: `https://${cursor ? "beta" : "alpha"}.convex.cloud`,
              id: cursor ? "2" : "1",
              isDefault: true,
              kind: "cloud",
              name: cursor ? "beta-prod" : "alpha-prod",
              projectId: cursor ? "200" : "100",
              reference: "prod",
              region: cursor ? "aws-eu-west-1" : "aws-us-east-1",
            },
          ],
          pagination: cursor ? { hasMore: false } : { hasMore: true, nextCursor: "second-page" },
        });
      }),
    );

    await expect(
      listConvexManagementDefaultProductionDeployments({ token: "team-token", teamId: "10" }),
    ).resolves.toMatchObject([
      { id: "1", projectId: "100", region: "aws-us-east-1" },
      { id: "2", projectId: "200", region: "aws-eu-west-1" },
    ]);
    expect(
      requests.map((request) => {
        const url = new URL(request.url);
        return {
          path: url.pathname,
          cursor: url.searchParams.get("cursor"),
          limit: url.searchParams.get("limit"),
          deploymentType: url.searchParams.get("deploymentType"),
          isDefault: url.searchParams.get("isDefault"),
        };
      }),
    ).toEqual([
      {
        path: "/v1/teams/10/list_deployments",
        cursor: null,
        limit: "100",
        deploymentType: "prod",
        isDefault: "true",
      },
      {
        path: "/v1/teams/10/list_deployments",
        cursor: "second-page",
        limit: "100",
        deploymentType: "prod",
        isDefault: "true",
      },
    ]);
  });

  it("rejects incomplete default production deployment pagination metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ items: [], pagination: { hasMore: true } })),
    );

    await expect(
      listConvexManagementDefaultProductionDeployments({ token: "team-token", teamId: "10" }),
    ).rejects.toThrow("Convex deployment pagination indicated more results without a cursor.");
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
              "deploymentUrl": "https://samebase.convex.cloud",
              "id": ${LARGE_CONVEX_ID},
              "isDefault": true,
              "kind": "cloud",
              "name": "samebase-prod",
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
      requestConvexManagementApiOrThrow(
        "team-token",
        "GET",
        "/projects/{project_id}/list_deployments",
        {
          params: { path: { project_id: LARGE_CONVEX_PARENT_ID } },
        },
      ),
    ).resolves.toEqual([
      {
        class: "s16",
        createTime: 1710000000000,
        creator: LARGE_CONVEX_PARENT_ID,
        deploymentType: "prod",
        deploymentUrl: "https://samebase.convex.cloud",
        id: LARGE_CONVEX_ID,
        isDefault: true,
        kind: "cloud",
        name: "samebase-prod",
        projectId: LARGE_CONVEX_PARENT_ID,
        reference: "prod",
        region: "aws-us-east-1",
      },
    ]);
  });

  it("preserves Convex custom role IDs from responses as decimal strings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          `{
            "createTime": 1710000000000,
            "id": ${LARGE_CONVEX_ID},
            "name": "operator",
            "statements": [],
            "teamId": ${LARGE_CONVEX_PARENT_ID}
          }`,
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }),
    );

    await expect(
      requestConvexManagementApiOrThrow(
        "team-token",
        "POST",
        "/teams/{team_id}/create_custom_role",
        {
          params: { path: { team_id: LARGE_CONVEX_PARENT_ID } },
          body: {
            name: "operator",
            statements: [],
          },
        },
      ),
    ).resolves.toEqual({
      createTime: 1710000000000,
      id: LARGE_CONVEX_ID,
      name: "operator",
      statements: [],
      teamId: LARGE_CONVEX_PARENT_ID,
    });
  });

  it("preserves Convex access token IDs from token details as decimal strings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          `{
            "createTime": 1710000000000,
            "id": ${LARGE_CONVEX_ID},
            "name": "Samebase OAuth",
            "teamId": ${LARGE_CONVEX_PARENT_ID},
            "type": "teamToken"
          }`,
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }),
    );

    await expect(
      requestConvexManagementApiOrThrow("oauth-team-token", "GET", "/token_details"),
    ).resolves.toEqual({
      createTime: 1710000000000,
      id: LARGE_CONVEX_ID,
      name: "Samebase OAuth",
      teamId: LARGE_CONVEX_PARENT_ID,
      type: "teamToken",
    });
  });

  it("uses response schemas instead of global field names when normalizing numbers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          `{
            "items": [
              {
                "action": "team:token:view",
                "actor": {
                  "kind": "token",
                  "member_id": ${LARGE_CONVEX_PARENT_ID},
                  "token_id": ${LARGE_CONVEX_ID}
                },
                "createTime": 1710000000000,
                "metadata": {
                  "id": 7,
                  "projectId": 8,
                  "nested": [
                    {
                      "teamId": 9
                    }
                  ]
                },
                "teamId": ${LARGE_CONVEX_PARENT_ID}
              }
            ],
            "pagination": {
              "hasMore": false
            }
          }`,
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }),
    );

    await expect(
      requestConvexManagementApiOrThrow(
        "team-token",
        "GET",
        "/teams/{team_id}/list_audit_log_events",
        {
          params: {
            path: { team_id: LARGE_CONVEX_PARENT_ID },
            query: { from: 1710000000000, to: 1710003600000 },
          },
        },
      ),
    ).resolves.toEqual({
      items: [
        {
          action: "team:token:view",
          actor: {
            kind: "token",
            member_id: LARGE_CONVEX_PARENT_ID,
            token_id: LARGE_CONVEX_ID,
          },
          createTime: 1710000000000,
          metadata: {
            id: 7,
            projectId: 8,
            nested: [
              {
                teamId: 9,
              },
            ],
          },
          teamId: LARGE_CONVEX_PARENT_ID,
        },
      ],
      pagination: {
        hasMore: false,
      },
    });
  });

  it("preserves nested Convex custom role IDs from team member responses as decimal strings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          `{
            "items": [
              {
                "customRoles": [
                  {
                    "id": ${LARGE_CONVEX_ID},
                    "name": "operator"
                  }
                ],
                "email": "nicu.dev@gmail.com",
                "id": ${LARGE_CONVEX_PARENT_ID},
                "name": "Nicu",
                "role": "custom"
              }
            ]
          }`,
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }),
    );

    await expect(
      requestConvexManagementApiOrThrow("team-token", "GET", "/teams/{team_id}/list_members", {
        params: { path: { team_id: LARGE_CONVEX_PARENT_ID } },
      }),
    ).resolves.toEqual({
      items: [
        {
          customRoles: [
            {
              id: LARGE_CONVEX_ID,
              name: "operator",
            },
          ],
          email: "nicu.dev@gmail.com",
          id: LARGE_CONVEX_PARENT_ID,
          name: "Nicu",
          role: "custom",
        },
      ],
    });
  });

  it("preserves nullable Convex SSO team IDs from personal access tokens", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          `{
            "items": [
              {
                "creationTime": 1710000000000,
                "expiresAt": 1710003600000,
                "id": ${LARGE_CONVEX_ID},
                "lastUsedTime": null,
                "name": "connected device",
                "ssoTeamId": ${LARGE_CONVEX_PARENT_ID}
              },
              {
                "creationTime": 1710000000001,
                "id": ${LARGE_CONVEX_PARENT_ID},
                "name": "manual token",
                "ssoTeamId": null
              }
            ],
            "pagination": {
              "hasMore": false,
              "nextCursor": null
            }
          }`,
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }),
    );

    await expect(
      requestConvexManagementApiOrThrow("team-token", "GET", "/list_personal_access_tokens"),
    ).resolves.toEqual({
      items: [
        {
          creationTime: 1710000000000,
          expiresAt: 1710003600000,
          id: LARGE_CONVEX_ID,
          lastUsedTime: null,
          name: "connected device",
          ssoTeamId: LARGE_CONVEX_PARENT_ID,
        },
        {
          creationTime: 1710000000001,
          id: LARGE_CONVEX_PARENT_ID,
          name: "manual token",
          ssoTeamId: null,
        },
      ],
      pagination: {
        hasMore: false,
        nextCursor: null,
      },
    });
  });

  it("rejects unsafe non-ID numbers from responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          `{
            "items": [
              {
                "createTime": ${LARGE_CONVEX_ID},
                "id": ${LARGE_CONVEX_ID},
                "name": "Samebase",
                "slug": "samebase",
                "teamId": ${LARGE_CONVEX_PARENT_ID},
                "teamSlug": "samebase-team"
              }
            ],
            "pagination": { "hasMore": false }
          }`,
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }),
    );

    await expect(
      requestConvexManagementApiOrThrow("team-token", "GET", "/teams/{team_id}/projects", {
        params: { path: { team_id: LARGE_CONVEX_PARENT_ID } },
      }),
    ).rejects.toThrow(
      "Convex response field /items/*/createTime is outside JavaScript's safe numeric range.",
    );
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

    await requestConvexManagementApiOrThrow("team-token", "POST", "/projects/{project_id}/delete", {
      params: { path: { project_id: "123" } },
    });

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
            "deploymentUrl": "https://samebase.convex.cloud",
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

    await requestConvexManagementApiOrThrow("team-token", "GET", "/deployments/{deployment_name}", {
      params: { path: { deployment_name: " team-project " } },
    });

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
        return new Response('{"items":[],"pagination":{"hasMore":false}}', {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    await requestConvexManagementApiOrThrow("team-token", "GET", "/teams/{team_id}/projects", {
      params: { path: { team_id: ` ${LARGE_CONVEX_ID} ` } },
    });

    expect(warn).toHaveBeenCalledWith("convex:api:trimmed_path_parameter", {
      label: "Convex path parameter team_id",
      originalLength: LARGE_CONVEX_ID.length + 2,
      normalizedLength: LARGE_CONVEX_ID.length,
    });
  });

  it("rejects non-string path parameters at the request boundary", async () => {
    const fetch = vi.fn();
    const key = "team-token";
    const params = { params: { path: { team_id: 123 } } };
    const route = "/teams/{team_id}/projects";
    const verb = "GET";
    vi.stubGlobal("fetch", fetch);

    // @ts-expect-error Runtime callers can still pass non-string path params.
    const request = requestConvexManagementApiOrThrow(key, verb, route, params);

    await expect(request).rejects.toThrow("Convex path parameter team_id must be a string.");

    expect(fetch).not.toHaveBeenCalled();
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
