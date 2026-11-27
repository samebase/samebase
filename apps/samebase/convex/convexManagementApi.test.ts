import * as management from "@distilled.cloud/convex/management";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { readConvexProductionDeployment } from "./repository/convexProjectResources";
import {
  fetchConvexTeamTokenDetails,
  isConvexManagementNotFoundError,
  listConvexManagementProjects,
  runConvexManagement,
  toConvexId,
} from "./convexManagementApi";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function project(id: number) {
  return {
    id,
    name: `Project ${id}`,
    slug: `project-${id}`,
    teamId: 41,
    teamSlug: "acme",
    createTime: 1_710_000_000_000,
  };
}

const cloudDeployment = {
  kind: "cloud",
  id: 5,
  name: "happy-otter-123",
  createTime: 1,
  deploymentType: "prod",
  projectId: 1,
  region: "aws-us-east-1",
  isDefault: true,
  reference: "production",
  deploymentUrl: "https://happy-otter-123.convex.cloud",
  class: "s16",
};

function answer(...responses: Response[]) {
  const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    const response = responses.shift();
    if (!response) throw new Error("Unexpected request.");
    return response;
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function requestOf(fetch: ReturnType<typeof answer>, index: number): Request {
  const [input, init] = fetch.mock.calls[index] ?? ["missing request"];
  return new Request(input, init);
}

describe("Convex Management API", () => {
  it("lists every page of a team's projects with its decimal team ID", async () => {
    const fetch = answer(
      Response.json({ items: [project(1)], pagination: { hasMore: true, nextCursor: "next" } }),
      Response.json({ items: [project(2)], pagination: { hasMore: false } }),
    );

    const projects = await listConvexManagementProjects({ token: "token", teamId: "41" });

    expect(projects.map(({ id }) => id)).toEqual([1, 2]);
    expect(requestOf(fetch, 0).url).toBe("https://api.convex.dev/v1/teams/41/projects?limit=100");
    expect(requestOf(fetch, 1).url).toBe(
      "https://api.convex.dev/v1/teams/41/projects?cursor=next&limit=100",
    );
    expect(requestOf(fetch, 0).headers.get("authorization")).toBe("Bearer token");
  });

  it("returns the team ID of a team token as a string", async () => {
    answer(Response.json({ id: 7, teamId: 41, name: "CI", createTime: 1, type: "teamToken" }));

    await expect(fetchConvexTeamTokenDetails("token")).resolves.toEqual({ teamId: "41" });
  });

  it("rejects a response that does not match the operation's schema", async () => {
    const { slug: _slug, ...withoutSlug } = project(1);
    answer(Response.json(withoutSlug));

    await expect(
      runConvexManagement("token", management.getProject, { projectId: 1 }),
    ).rejects.toThrow("Convex Management API GET /projects/{project_id} failed (200)");
  });

  it.each([
    {
      name: "team token details without a team ID",
      body: { id: 7, name: "CI", createTime: 1, type: "teamToken" },
      run: () => fetchConvexTeamTokenDetails("token"),
    },
    {
      name: "a production deployment with a numeric URL",
      body: { ...cloudDeployment, deploymentUrl: 123 },
      run: () => readConvexProductionDeployment({ token: "token", projectId: "1" }),
    },
  ])("rejects $name", async ({ body, run }) => {
    answer(Response.json(body));

    await expect(run()).rejects.toThrow("ResponseSchemaMismatch");
  });

  it("rejects an ID that JavaScript cannot hold exactly", async () => {
    answer(
      new Response(
        '{"items":[{"id":9007199254740993,"name":"P","slug":"p","teamId":41,"teamSlug":"acme","createTime":1}],"pagination":{"hasMore":false}}',
      ),
    );

    await expect(listConvexManagementProjects({ token: "token", teamId: " 41 " })).rejects.toThrow(
      "Convex Management API GET /teams/{team_id}/projects failed (200)",
    );
  });

  it("accepts a text body for a call without a result and rejects a redirect", async () => {
    answer(new Response("OK"), new Response(null, { status: 304 }));
    const deleteKey = () =>
      runConvexManagement("token", management.deleteDeployKey, {
        deploymentName: "happy-otter-123",
        id: "key",
      });

    await expect(deleteKey()).resolves.toBeDefined();
    await expect(deleteKey()).rejects.toThrow("failed (304)");
  });

  it("reports a stalled error body as a timeout without its status", async () => {
    vi.useFakeTimers();
    answer(new Response(new ReadableStream({ start: () => undefined }), { status: 403 }));

    const result = runConvexManagement("token", management.getTokenDetails, {}).catch(
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(result).resolves.toMatchObject({ status: null });
  });

  it("rejects a provider error with its status and without the response body", async () => {
    answer(new Response("private provider detail", { status: 404 }));

    const error = await runConvexManagement("token", management.getProject, {
      projectId: 123,
    }).catch((rejection: unknown) => rejection);

    expect(isConvexManagementNotFoundError(error)).toBe(true);
    const message = error instanceof Error ? error.message : "";
    expect(message).toContain("GET /projects/{project_id}");
    expect(message).not.toContain("private provider detail");
  });

  it("gives up on a response body that stalls after 10 seconds", async () => {
    vi.useFakeTimers();
    answer(new Response(new ReadableStream({ start: () => undefined })));

    const result = runConvexManagement("token", management.getTokenDetails, {}).then(
      () => "resolved",
      () => "rejected",
    );
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(result).resolves.toBe("rejected");
  });

  it("refuses an ID that is not a decimal number", () => {
    expect(() => toConvexId("41a", "Convex team ID")).toThrow(
      "Convex team ID must be a decimal identifier.",
    );
  });
});
