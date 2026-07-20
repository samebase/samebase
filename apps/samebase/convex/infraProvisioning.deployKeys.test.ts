import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  createConvexDeployKey,
  deleteConvexDeployKey,
  deleteConvexDeployKeyByName,
  deleteConvexPreviewDeployKeyByName,
} from "./infraProvisioning";

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function readRequestBody(request: Request): Promise<unknown> {
  return JSON.parse(await request.text());
}

describe("Convex build access deploy keys", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("deletes a production key by its exact provider name", async () => {
    const deleteBodies: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (request: Request) => {
        if (request.method === "POST" && request.url.endsWith("/delete_deploy_key")) {
          deleteBodies.push(await readRequestBody(request));
          return new Response(null, { status: 200 });
        }
        throw new Error(`Unexpected Convex request: ${request.method} ${request.url}`);
      }),
    );

    await deleteConvexDeployKeyByName({
      convexToken: "convex-token",
      deploymentName: "demo-production",
      name: "samebase-target",
    });

    expect(deleteBodies).toEqual([{ id: "samebase-target" }]);
  });

  it("deletes a preview key by its exact provider name", async () => {
    const deleteBodies: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (request: Request) => {
        if (request.method === "POST" && request.url.endsWith("/delete_preview_deploy_key")) {
          deleteBodies.push(await readRequestBody(request));
          return new Response(null, { status: 200 });
        }
        throw new Error(`Unexpected Convex request: ${request.method} ${request.url}`);
      }),
    );

    await deleteConvexPreviewDeployKeyByName({
      convexToken: "convex-token",
      projectId: "1001",
      name: "samebase-preview-target",
    });

    expect(deleteBodies).toEqual([{ id: "samebase-preview-target" }]);
  });

  it("treats an absent exact-name key as already deleted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not found", { status: 404 })),
    );

    await expect(
      deleteConvexDeployKeyByName({
        convexToken: "convex-token",
        deploymentName: "demo-production",
        name: "samebase-target",
      }),
    ).resolves.toBeUndefined();
  });

  it("keeps the full created secret available for rollback deletion", async () => {
    const deleteBodies: unknown[] = [];
    const fullDeployKey = "prod:demo-production|secret-value";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (request: Request) => {
        if (request.url.endsWith("/create_deploy_key")) {
          return jsonResponse({ deployKey: fullDeployKey });
        }
        if (request.url.endsWith("/delete_deploy_key")) {
          deleteBodies.push(await readRequestBody(request));
          return new Response(null, { status: 200 });
        }
        throw new Error(`Unexpected Convex request: ${request.method} ${request.url}`);
      }),
    );

    const created = await createConvexDeployKey({
      convexToken: "convex-token",
      convexAuthMethod: "oauth",
      deploymentName: "demo-production",
      name: "samebase-target",
    });
    await deleteConvexDeployKey({
      convexToken: "convex-token",
      deploymentName: "demo-production",
      deployKeySecretOrName: created.deployKey,
    });

    expect(created).toEqual({ deployKey: fullDeployKey });
    expect(deleteBodies).toEqual([{ id: fullDeployKey }]);
  });
});
