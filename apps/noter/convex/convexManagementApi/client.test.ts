import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { Client, ClientPathsWithMethod } from "openapi-fetch";

import { formatConvexManagementApiEndpoint, requestConvexManagementApi } from "./client";
import type {
  CustomRoleResponse,
  operations,
  paths,
  PlatformDeploymentResponse,
  PlatformProjectDetails,
  PlatformTokenDetailsResponse,
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

  const listProjectsGetPath: ConvexManagementGetPath = "/teams/{team_id}/list_projects";
  const listProjectsPathParams: ListProjectsPathParams = {
    team_id: LARGE_CONVEX_ID,
  };

  expectType<{ team_id: string }>()(listProjectsPathParams, true);
  expectType<Promise<PlatformProjectDetails[]>>()(
    requestConvexManagementApi("team-token", "GET", "/teams/{team_id}/list_projects", {
      params: { path: { team_id: LARGE_CONVEX_ID } },
    }),
    true,
  );
  expectType<Promise<PlatformDeploymentResponse[]>>()(
    requestConvexManagementApi("team-token", "GET", "/projects/{project_id}/list_deployments", {
      params: { path: { project_id: LARGE_CONVEX_ID } },
    }),
    true,
  );
  expectType<Promise<void>>()(
    requestConvexManagementApi("team-token", "POST", "/projects/{project_id}/delete", {
      params: { path: { project_id: LARGE_CONVEX_ID } },
    }),
    true,
  );
  expectType<Promise<CustomRoleResponse>>()(
    requestConvexManagementApi("team-token", "POST", "/teams/{team_id}/create_custom_role", {
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
    name: "Noter OAuth",
    teamId: LARGE_CONVEX_PARENT_ID,
    type: "teamToken",
  };
  expectType<string>()(tokenDetailsResponse.id, true);

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
  const listProjectsPostPath: ConvexManagementPostPath = "/teams/{team_id}/list_projects";
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
  void requestConvexManagementApi("team-token", "GET", "/teams/{team_id}/list_projects");
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

    await requestConvexManagementApi("team-token", "GET", "/teams/{team_id}/list_projects", {
      params: { path: { team_id: LARGE_CONVEX_ID } },
    });

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
      requestConvexManagementApi("team-token", "GET", "/teams/{team_id}/list_projects", {
        params: { path: { team_id: LARGE_CONVEX_PARENT_ID } },
      }),
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
      requestConvexManagementApi("team-token", "GET", "/projects/{project_id}/list_deployments", {
        params: { path: { project_id: LARGE_CONVEX_PARENT_ID } },
      }),
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
      requestConvexManagementApi("team-token", "POST", "/teams/{team_id}/create_custom_role", {
        params: { path: { team_id: LARGE_CONVEX_PARENT_ID } },
        body: {
          name: "operator",
          statements: [],
        },
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
            "name": "Noter OAuth",
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
      requestConvexManagementApi("oauth-team-token", "GET", "/token_details"),
    ).resolves.toEqual({
      createTime: 1710000000000,
      id: LARGE_CONVEX_ID,
      name: "Noter OAuth",
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
      requestConvexManagementApi("team-token", "GET", "/teams/{team_id}/list_audit_log_events", {
        params: {
          path: { team_id: LARGE_CONVEX_PARENT_ID },
          query: { from: 1710000000000, to: 1710003600000 },
        },
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
      requestConvexManagementApi("team-token", "GET", "/teams/{team_id}/list_members", {
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
      requestConvexManagementApi("team-token", "GET", "/list_personal_access_tokens"),
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
          `[
            {
              "createTime": ${LARGE_CONVEX_ID},
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
      requestConvexManagementApi("team-token", "GET", "/teams/{team_id}/list_projects", {
        params: { path: { team_id: LARGE_CONVEX_PARENT_ID } },
      }),
    ).rejects.toThrow(
      "Convex response field /*/createTime is outside JavaScript's safe numeric range.",
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

    await requestConvexManagementApi("team-token", "POST", "/projects/{project_id}/delete", {
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

    await requestConvexManagementApi("team-token", "GET", "/deployments/{deployment_name}", {
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
        return new Response("[]", {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    await requestConvexManagementApi("team-token", "GET", "/teams/{team_id}/list_projects", {
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
    const route = "/teams/{team_id}/list_projects";
    const verb = "GET";
    vi.stubGlobal("fetch", fetch);

    // @ts-expect-error Runtime callers can still pass non-string path params.
    const request = requestConvexManagementApi(key, verb, route, params);

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
