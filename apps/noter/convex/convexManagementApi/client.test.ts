import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  createConvexManagementClient,
  readConvexManagementDecimalPathId,
  readConvexManagementPathSegment,
} from "./client";

const LARGE_CONVEX_ID = "9223372036854775807";
const LARGE_CONVEX_PARENT_ID = "9223372036854775806";

describe("createConvexManagementClient", () => {
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

    await createConvexManagementClient({ token: "team-token" }).listProjects({
      teamId: LARGE_CONVEX_ID,
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
      createConvexManagementClient({ token: "team-token" }).listProjects({
        teamId: LARGE_CONVEX_PARENT_ID,
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
      createConvexManagementClient({ token: "team-token" }).listDeployments({
        projectId: LARGE_CONVEX_PARENT_ID,
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

  it("materializes typed OpenAPI path parameters for empty POST requests", async () => {
    const requests: Request[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Request) => {
        requests.push(input);
        return new Response("", { status: 200 });
      }),
    );

    await createConvexManagementClient({ token: "team-token" }).deleteProject({
      projectId: "123",
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

    expect(
      readConvexManagementPathSegment(
        " team-project ",
        "Convex deployment name",
      ),
    ).toBe("team-project");

    expect(warn).toHaveBeenCalledWith("convex:api:trimmed_path_parameter", {
      label: "Convex deployment name",
      originalLength: 14,
      normalizedLength: 12,
    });
  });

  it("warns when decimal path IDs need trimming", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(
      readConvexManagementDecimalPathId(
        ` ${LARGE_CONVEX_ID} `,
        "Convex project ID",
      ),
    ).toBe(LARGE_CONVEX_ID);

    expect(warn).toHaveBeenCalledWith("convex:api:trimmed_path_parameter", {
      label: "Convex project ID",
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
