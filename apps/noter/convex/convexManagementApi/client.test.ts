import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createConvexManagementClient } from "./client";

describe("createConvexManagementClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("materializes typed OpenAPI path parameters for GET requests", async () => {
    const requests: { input: RequestInfo | URL; init?: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({ input, init });
        return new Response("[]", {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    await createConvexManagementClient({ token: "team-token" }).listProjects({
      teamId: "38516",
    });

    expect(requests).toEqual([
      {
        input: "https://api.convex.dev/v1/teams/38516/list_projects",
        init: {
          method: "GET",
          headers: {
            Authorization: "Bearer team-token",
          },
          body: undefined,
        },
      },
    ]);
  });

  it("materializes typed OpenAPI path parameters for empty POST requests", async () => {
    const requests: { input: RequestInfo | URL; init?: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({ input, init });
        return new Response("", { status: 200 });
      }),
    );

    await createConvexManagementClient({ token: "team-token" }).deleteProject({
      projectId: "123",
    });

    expect(requests).toEqual([
      {
        input: "https://api.convex.dev/v1/projects/123/delete",
        init: {
          method: "POST",
          headers: {
            Authorization: "Bearer team-token",
          },
          body: undefined,
        },
      },
    ]);
  });
});
