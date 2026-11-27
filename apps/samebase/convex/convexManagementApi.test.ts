import * as management from "@distilled.cloud/convex/management";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

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

  it("rejects team token details without a team ID", async () => {
    answer(Response.json({ id: 7, name: "CI", createTime: 1, type: "teamToken" }));

    await expect(fetchConvexTeamTokenDetails("token")).rejects.toThrow(
      "Convex token team ID must be a decimal identifier.",
    );
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
