import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  createInfraProviders,
  formatConvexManagementIntegerId,
  readConvexTeamTokenDetails,
} from "./infraProviders";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Convex management provider", () => {
  it("uses the OpenAPI path and bearer token for project lists", async () => {
    let capturedRequest:
      | {
          url: string;
          method: string;
          authorization: string | null;
        }
      | undefined;
    const fetchImpl: typeof fetch = async (input) => {
      const request = input instanceof Request ? input : new Request(input);
      capturedRequest = {
        url: request.url,
        method: request.method,
        authorization: request.headers.get("Authorization"),
      };
      return Response.json([
        {
          id: 123,
          name: "Example",
          slug: "example",
          teamId: 42,
          teamSlug: "noter",
          createTime: 1_714_000_000_000,
        },
      ]);
    };
    vi.stubGlobal("fetch", fetchImpl);

    const projects = await createInfraProviders({
      convexToken: "convex-token",
    }).convex.listProjects({ teamId: "42" });

    expect(capturedRequest).toEqual({
      url: "https://api.convex.dev/v1/teams/42/list_projects",
      method: "GET",
      authorization: "Bearer convex-token",
    });
    expect(projects).toEqual([
      {
        id: 123,
        name: "Example",
        slug: "example",
        teamId: 42,
        teamSlug: "noter",
        createTime: 1_714_000_000_000,
      },
    ]);
  });

  it("serializes typed request bodies through openapi-fetch", async () => {
    let body: unknown;
    const fetchImpl: typeof fetch = async (input) => {
      const request = input instanceof Request ? input : new Request(input);
      body = await request.json();
      return Response.json({
        id: 123,
        projectId: 123,
        slug: "example",
        deploymentName: "playful-otter-123",
        deploymentUrl: "https://playful-otter-123.convex.cloud",
      });
    };
    vi.stubGlobal("fetch", fetchImpl);

    const response = await createInfraProviders({
      convexToken: "convex-token",
    }).convex.createProject({
      teamId: "42",
      projectName: "Example",
      deploymentType: "prod",
    });

    expect(body).toEqual({
      projectName: "Example",
      deploymentType: "prod",
    });
    expect(response.slug).toBe("example");
  });

  it("fails before fetch when stored Convex IDs are not numeric", async () => {
    let called = false;
    const fetchImpl: typeof fetch = async () => {
      called = true;
      return Response.json([]);
    };
    vi.stubGlobal("fetch", fetchImpl);

    await expect(
      createInfraProviders({ convexToken: "convex-token" }).convex.listProjects(
        {
          teamId: "not-a-number",
        },
      ),
    ).rejects.toThrow("Convex team ID must be a numeric ID.");
    expect(called).toBe(false);
  });
});

describe("Convex management ID helpers", () => {
  it("formats safe OpenAPI integer IDs for app storage", () => {
    expect(formatConvexManagementIntegerId(123, "project ID")).toBe("123");
  });

  it("extracts team IDs from typed token details", () => {
    expect(
      readConvexTeamTokenDetails({
        type: "teamToken",
        teamId: 42,
        name: "noter",
        createTime: 1_714_000_000_000,
      }),
    ).toEqual({ teamId: "42" });

    expect(
      readConvexTeamTokenDetails({
        type: "projectToken",
        projectId: 123,
        name: "noter",
        createTime: 1_714_000_000_000,
      }),
    ).toBe(null);
  });
});
