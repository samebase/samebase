import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { parseAsync } from "valibot";
import {
  createConvexManagementClient,
  createConvexTeamAccessToken,
  deleteConvexTeamAccessToken,
  ConvexManagementApiResponseError,
  listConvexManagementDefaultProductionDeployments,
  listConvexManagementProjects,
} from "./client";
import { ConvexManagementApiError } from "./errors";
import { ConvexManagement } from "./generated/sdk.gen";
import type {
  CustomRoleResponse,
  GetTeamsByTeamIdProjectsData,
  PlatformDeploymentResponse,
  PlatformPaginatedProjectsResponse,
  PlatformTokenDetailsResponse,
  ProjectResponse,
} from "./generated/types.gen";
import {
  vCustomRoleResponse,
  vListAuditLogEventsResponse,
  vPaginatedPersonalAccessTokensResponse,
  vPlatformDeploymentResponse,
  vPlatformListTeamMembersResponse,
} from "./generated/valibot.gen";

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
  // @ts-expect-error The client requires a token.
  createConvexManagementClient({});
  const client = createConvexManagementClient({ token: "team-token" });
  const path: GetTeamsByTeamIdProjectsData["path"] = { team_id: LARGE_CONVEX_ID };
  expectType<{ team_id: string }>()(path, true);
  expectType<Promise<PlatformPaginatedProjectsResponse>>()(
    ConvexManagement.GET["/teams/{team_id}/projects"]({ client, path }),
    true,
  );
  expectType<Promise<ProjectResponse[]>>()(
    listConvexManagementProjects({ token: "team-token", teamId: LARGE_CONVEX_ID }),
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
    ConvexManagement.GET["/projects/{project_id}/list_deployments"]({
      client,
      path: { project_id: LARGE_CONVEX_ID },
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
  // @ts-expect-error The list projects endpoint only allows GET.
  void ConvexManagement.POST["/teams/{team_id}/projects"];
  // @ts-expect-error The endpoint requires an explicit configured client.
  void ConvexManagement.GET["/token_details"]({});
  // @ts-expect-error The team_id path parameter is required.
  void ConvexManagement.GET["/teams/{team_id}/projects"]({ client });
  void ConvexManagement.GET["/teams/{team_id}/projects"]({
    client,
    // @ts-expect-error OpenAPI path IDs must stay decimal strings.
    path: { team_id: 123 },
  });
}
void assertConvexManagementRequestTypes;

describe("Convex Management API request helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns and logs a non-JSON response without its contents", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("private malformed provider response", { status: 200 })),
    );

    const failure: unknown = await ConvexManagement.GET["/teams/{team_id}/projects"]({
      client: createConvexManagementClient({ token: "team-token" }),
      path: { team_id: LARGE_CONVEX_PARENT_ID },
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConvexManagementApiResponseError);
    if (!(failure instanceof ConvexManagementApiResponseError)) {
      throw new Error("Expected Convex response parsing to fail.");
    }
    expect(failure.failure).toBe("invalid_json");
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

    const failure: unknown = await ConvexManagement.GET["/teams/{team_id}/projects"]({
      client: createConvexManagementClient({ token: "team-token" }),
      path: { team_id: LARGE_CONVEX_PARENT_ID },
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConvexManagementApiResponseError);
    if (!(failure instanceof ConvexManagementApiResponseError)) {
      throw new Error("Expected Convex response validation to fail.");
    }
    const issues = failure.failure;
    if (!Array.isArray(issues)) {
      throw new Error("Expected Valibot validation issues.");
    }
    expect(issues.length).toBeGreaterThan(1);
    expect(JSON.stringify(issues)).toContain("not-a-decimal-id");
    expect(JSON.stringify(failure)).not.toContain("not-a-decimal-id");
    expect(String(failure)).not.toContain("private-provider-value");
    const log = String(error.mock.calls[0]?.[0]);
    expect(log).toContain("provider_response_validation_failed");
    expect(log).toContain('"provider":"convex"');
    expect(log).toContain('"type":"number"');
    expect(log).not.toContain("not-a-decimal-id");
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

    await ConvexManagement.GET["/teams/{team_id}/projects"]({
      client: createConvexManagementClient({ token: "team-token" }),
      path: { team_id: LARGE_CONVEX_ID },
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
      ConvexManagement.GET["/teams/{team_id}/projects"]({
        client: createConvexManagementClient({ token: "team-token" }),
        path: { team_id: LARGE_CONVEX_PARENT_ID },
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
      ConvexManagement.GET["/projects/{project_id}/list_deployments"]({
        client: createConvexManagementClient({ token: "team-token" }),
        path: { project_id: LARGE_CONVEX_PARENT_ID },
      }),
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
      createConvexManagementClient({ token: "team-token" }).post({
        url: "/teams/{team_id}/create_custom_role",
        path: { team_id: LARGE_CONVEX_PARENT_ID },
        body: {
          name: "operator",
          statements: [],
        },
        responseValidator: (data) => parseAsync(vCustomRoleResponse, data),
      }),
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
      ConvexManagement.GET["/token_details"]({
        client: createConvexManagementClient({ token: "oauth-team-token" }),
      }),
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
      createConvexManagementClient({ token: "team-token" }).get({
        url: "/teams/{team_id}/list_audit_log_events",
        path: { team_id: LARGE_CONVEX_PARENT_ID },
        query: { from: 1710000000000, to: 1710003600000 },
        responseValidator: (data) => parseAsync(vListAuditLogEventsResponse, data),
      }),
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
      createConvexManagementClient({ token: "team-token" }).get({
        url: "/teams/{team_id}/list_members",
        path: { team_id: LARGE_CONVEX_PARENT_ID },
        responseValidator: (data) => parseAsync(vPlatformListTeamMembersResponse, data),
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
      createConvexManagementClient({ token: "team-token" }).get({
        url: "/list_personal_access_tokens",
        responseValidator: (data) => parseAsync(vPaginatedPersonalAccessTokensResponse, data),
      }),
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

  it.each([
    {
      name: "unsafe integer",
      value: LARGE_CONVEX_ID,
      message:
        "Convex response field /items/*/createTime is outside JavaScript's safe numeric range.",
    },
    {
      name: "numeric string",
      value: '"1710000000000"',
      message: "Convex Management API returned an invalid response",
    },
  ])("rejects a non-ID $name from responses", async ({ value, message }) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          `{
            "items": [
              {
                "createTime": ${value},
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
      ConvexManagement.GET["/teams/{team_id}/projects"]({
        client: createConvexManagementClient({ token: "team-token" }),
        path: { team_id: LARGE_CONVEX_PARENT_ID },
      }),
    ).rejects.toThrow(message);
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

    await ConvexManagement.POST["/projects/{project_id}/delete"]({
      client: createConvexManagementClient({ token: "team-token" }),
      path: { project_id: "123" },
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

    await createConvexManagementClient({ token: "team-token" }).get({
      url: "/deployments/{deployment_name}",
      path: { deployment_name: " team-project " },
      responseValidator: (data) => parseAsync(vPlatformDeploymentResponse, data),
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

    await ConvexManagement.GET["/teams/{team_id}/projects"]({
      client: createConvexManagementClient({ token: "team-token" }),
      path: { team_id: ` ${LARGE_CONVEX_ID} ` },
    });

    expect(warn).toHaveBeenCalledWith("convex:api:trimmed_path_parameter", {
      label: "Convex path parameter team_id",
      originalLength: LARGE_CONVEX_ID.length + 2,
      normalizedLength: LARGE_CONVEX_ID.length,
    });
  });

  it("keeps response ID metadata separate for concurrent requests on one client", async () => {
    const client = createConvexManagementClient({ token: "team-token" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (request: Request) => {
        if (request.url.endsWith("/token_details")) {
          await new Promise((resolve) => setTimeout(resolve, 1));
          return new Response(
            `{"createTime":1710000000000,"id":${LARGE_CONVEX_ID},"name":"Samebase OAuth","teamId":${LARGE_CONVEX_PARENT_ID},"type":"teamToken"}`,
          );
        }
        return new Response(
          `{"items":[{"createTime":1710000000000,"id":${LARGE_CONVEX_PARENT_ID},"name":"Samebase","slug":"samebase","teamId":${LARGE_CONVEX_ID},"teamSlug":"samebase-team"}],"pagination":{"hasMore":false}}`,
        );
      }),
    );

    const [token, projects] = await Promise.all([
      ConvexManagement.GET["/token_details"]({ client }),
      ConvexManagement.GET["/teams/{team_id}/projects"]({
        client,
        path: { team_id: LARGE_CONVEX_ID },
      }),
    ]);
    expect(token).toMatchObject({
      id: LARGE_CONVEX_ID,
      teamId: LARGE_CONVEX_PARENT_ID,
      createTime: 1710000000000,
    });
    expect(projects.items).toMatchObject([
      { id: LARGE_CONVEX_PARENT_ID, teamId: LARGE_CONVEX_ID, createTime: 1710000000000 },
    ]);
  });

  it.each([200, 204])(
    "rejects an empty HTTP %s response when the endpoint requires JSON",
    async (status) => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(null, { status })),
      );
      const failure: unknown = await ConvexManagement.GET["/teams/{team_id}/projects"]({
        client: createConvexManagementClient({ token: "team-token" }),
        path: { team_id: LARGE_CONVEX_ID },
      }).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(ConvexManagementApiResponseError);
      if (!(failure instanceof ConvexManagementApiResponseError))
        throw new Error("Expected a response validation failure.");
      expect(failure.failure).toBe("invalid_json");
      expect(error).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    { body: null, status: 204 },
    { body: "not JSON", status: 200 },
  ])(
    "accepts the undocumented delete response body with HTTP $status",
    async ({ body, status }) => {
      const fetch = vi.fn(async () => new Response(body, { status }));
      vi.stubGlobal("fetch", fetch);
      await ConvexManagement.POST["/projects/{project_id}/delete"]({
        client: createConvexManagementClient({ token: "team-token" }),
        path: { project_id: LARGE_CONVEX_ID },
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it.each([404, 503])("preserves the HTTP %s error and does not retry a write", async (status) => {
    const fetch = vi.fn(async () => new Response("provider error details", { status }));
    vi.stubGlobal("fetch", fetch);
    const failure: unknown = await ConvexManagement.POST["/projects/{project_id}/delete"]({
      client: createConvexManagementClient({ token: "team-token" }),
      path: { project_id: LARGE_CONVEX_ID },
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConvexManagementApiError);
    expect(failure).toMatchObject({
      status,
      path: `/projects/${LARGE_CONVEX_ID}/delete`,
      responseBodySummary: "provider error details",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["headers", "body"])("times out while waiting for response %s", async (stage) => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: Request, init?: RequestInit) => {
        if (!init?.signal) throw new Error("Expected an abort signal.");
        const signal = init.signal;
        if (stage === "headers") {
          return await new Promise<Response>((_resolve, reject) => {
            signal.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          });
        }
        const body = new ReadableStream({
          start(controller) {
            signal.addEventListener(
              "abort",
              () => controller.error(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          },
        });
        return new Response(body, { status: 200 });
      }),
    );
    const assertion = expect(
      ConvexManagement.GET["/token_details"]({
        client: createConvexManagementClient({ token: "team-token" }),
      }),
    ).rejects.toThrow("Convex Management API request timed out.");

    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
  });

  it("records the API call before fetch and prevents the write if recording fails", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    const recordApiCall = vi.fn(async () => {
      expect(fetch).not.toHaveBeenCalled();
      throw new Error("audit storage unavailable");
    });
    await expect(
      ConvexManagement.POST["/projects/{project_id}/delete"]({
        client: createConvexManagementClient({ token: "private-token", recordApiCall }),
        path: { project_id: LARGE_CONVEX_ID },
      }),
    ).rejects.toThrow("audit storage unavailable");
    expect(fetch).not.toHaveBeenCalled();
    expect(recordApiCall).toHaveBeenCalledWith({
      provider: "Convex",
      method: "POST",
      endpoint: "/projects/{project_id}/delete",
      values: { params: { path: { project_id: LARGE_CONVEX_ID }, query: undefined } },
    });
    expect(JSON.stringify(recordApiCall.mock.calls)).not.toContain("private-token");
  });

  it("rejects a missing required request body field before recording or fetch", async () => {
    const fetch = vi.fn();
    const recordApiCall = vi.fn(async () => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", fetch);
    await expect(
      ConvexManagement.POST["/teams/{team_id}/create_project"]({
        client: createConvexManagementClient({ token: "private-token", recordApiCall }),
        path: { team_id: LARGE_CONVEX_ID },
        // @ts-expect-error Deliberately omit the required projectName at the runtime boundary.
        body: {},
      }),
    ).rejects.toThrow("Convex Management API request is invalid");
    expect(fetch).not.toHaveBeenCalled();
    expect(recordApiCall).not.toHaveBeenCalled();
    const log = String(error.mock.calls[0]?.[0]);
    expect(log).toContain("provider_request_validation_failed");
    expect(log).toContain("projectName");
    expect(log).not.toContain("private-token");
    expect(log).not.toContain(LARGE_CONVEX_ID);
  });

  it("rejects non-string path parameters at the request boundary", async () => {
    const fetch = vi.fn();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", fetch);

    const request = ConvexManagement.GET["/teams/{team_id}/projects"]({
      client: createConvexManagementClient({ token: "private-token" }),
      // @ts-expect-error Runtime callers can still pass non-string path params.
      path: { team_id: 123 },
    });

    await expect(request).rejects.toThrow("Convex Management API request is invalid");

    expect(fetch).not.toHaveBeenCalled();
    const log = String(error.mock.calls[0]?.[0]);
    expect(log).toContain("provider_request_validation_failed");
    expect(log).not.toContain("private-token");
    expect(log).not.toContain("123");
  });
});

describe("Convex team access tokens", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("mints a named token without expiry and returns its value", async () => {
    const requests: Request[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (request: Request) => {
        requests.push(request.clone());
        return Response.json(
          { accessToken: "convex-minted-test-token", tokenType: "TeamToken" },
          { status: 201 },
        );
      }),
    );

    await expect(
      createConvexTeamAccessToken({
        token: "convex-oauth-test-token",
        teamId: "41",
        name: "samebase/samebase/actions-app",
      }),
    ).resolves.toBe("convex-minted-test-token");

    expect(requests.map(readRequest)).toEqual([
      {
        authorization: "Bearer convex-oauth-test-token",
        contentType: "application/json",
        method: "POST",
        url: "https://api.convex.dev/v1/teams/41/create_access_token",
      },
    ]);
    await expect(requests[0]?.json()).resolves.toEqual({ name: "samebase/samebase/actions-app" });
  });

  it("names the endpoint when the connection cannot mint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Forbidden", { status: 403 })),
    );

    await expect(
      createConvexTeamAccessToken({
        token: "convex-oauth-test-token",
        teamId: "41",
        name: "samebase/samebase/actions-app",
      }),
    ).rejects.toThrow(
      "Convex answered 403 to POST /teams/{team_id}/create_access_token, so the Convex connection cannot mint the repository's access token. Reconnect Convex with OAuth on the Providers page, then retry.",
    );
  });

  it("deletes a token by name and counts a missing token as deleted", async () => {
    const requests: Request[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (request: Request) => {
        requests.push(request.clone());
        return new Response("Not Found", { status: 404 });
      }),
    );

    await expect(
      deleteConvexTeamAccessToken({
        token: "convex-oauth-test-token",
        teamId: "41",
        name: "samebase/samebase/actions-app",
      }),
    ).resolves.toBeUndefined();

    expect(requests.map(readRequest)).toMatchObject([
      { method: "POST", url: "https://api.convex.dev/v1/teams/41/delete_access_token" },
    ]);
    await expect(requests[0]?.json()).resolves.toEqual({ id: "samebase/samebase/actions-app" });
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
