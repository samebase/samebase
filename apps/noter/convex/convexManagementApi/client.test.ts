import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  createConvexManagementClient,
  readConvexManagementPathSegment,
} from "./client";

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
      teamId: "38516",
    });

    expect(requests.map(readRequest)).toEqual([
      {
        authorization: "Bearer team-token",
        contentType: null,
        method: "GET",
        url: "https://api.convex.dev/v1/teams/38516/list_projects",
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
