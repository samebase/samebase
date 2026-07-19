import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { Id } from "./_generated/dataModel";
import {
  buildConvexBuildAccessDeployKeyNames,
  createConvexDeployKey,
  deleteConvexDeployKey,
  deleteConvexDeployKeysByName,
  deleteConvexPreviewDeployKeysByName,
} from "./infraProvisioning";

const allowedActions = [
  "deployment:deploy",
  "deployment:env:view",
  "deployment:env:write",
  "deployment:data:view",
] as const;

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function deployKey(args: { id: number; name: string; creationTime: number }) {
  return {
    id: args.id,
    name: args.name,
    creationTime: args.creationTime,
    allowedActions,
  };
}

async function readRequestBody(request: Request): Promise<unknown> {
  return JSON.parse(await request.text());
}

function fakeVaultId(): Id<"vaults"> {
  // @ts-expect-error Convex ids are strings at runtime; this unit test only needs a stable id.
  return "jt7f8f6d9v7x5w4m3n2p1q0r1s7c9b8a";
}

describe("Convex build access deploy keys", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses exact vault-owned names containing the complete vault id", () => {
    const vaultId = fakeVaultId();

    expect(buildConvexBuildAccessDeployKeyNames(vaultId)).toEqual({
      production: `samebase-cloudflare-production-v1-${vaultId}`,
      preview: `samebase-cloudflare-preview-v1-${vaultId}`,
    });
  });

  it("deletes only exact production-name matches in deterministic provider order", async () => {
    const deletedIds: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (request: Request) => {
        if (request.method === "GET" && request.url.endsWith("/list_deploy_keys")) {
          return jsonResponse([
            deployKey({ id: 103, name: "samebase-target-copy", creationTime: 1 }),
            deployKey({ id: 102, name: "samebase-target", creationTime: 2 }),
            deployKey({ id: 101, name: "samebase-target", creationTime: 1 }),
          ]);
        }
        if (request.method === "POST" && request.url.endsWith("/delete_deploy_key")) {
          const body = await readRequestBody(request);
          deletedIds.push(body);
          return new Response(null, { status: 200 });
        }
        throw new Error(`Unexpected Convex request: ${request.method} ${request.url}`);
      }),
    );

    await deleteConvexDeployKeysByName({
      convexToken: "convex-token",
      deploymentName: "demo-production",
      name: "samebase-target",
    });

    expect(deletedIds).toEqual([{ id: "101" }, { id: "102" }]);
  });

  it("includes managed preview keys while preserving unrelated provider keys", async () => {
    const requestUrls: string[] = [];
    const deletedIds: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (request: Request) => {
        requestUrls.push(request.url);
        if (request.method === "GET" && request.url.includes("/list_preview_deploy_keys")) {
          return jsonResponse({
            items: [
              deployKey({ id: 201, name: "samebase-preview-target", creationTime: 1 }),
              deployKey({ id: 202, name: "integration-owned", creationTime: 2 }),
            ],
          });
        }
        if (request.method === "POST" && request.url.endsWith("/delete_preview_deploy_key")) {
          deletedIds.push(await readRequestBody(request));
          return new Response(null, { status: 200 });
        }
        throw new Error(`Unexpected Convex request: ${request.method} ${request.url}`);
      }),
    );

    await deleteConvexPreviewDeployKeysByName({
      convexToken: "convex-token",
      projectId: "1001",
      name: "samebase-preview-target",
    });

    expect(requestUrls[0]).toContain("includeManaged=true");
    expect(deletedIds).toEqual([{ id: "201" }]);
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
      deployKeyIdentifier: created.deployKey,
    });

    expect(created).toEqual({ deployKey: fullDeployKey });
    expect(deleteBodies).toEqual([{ id: fullDeployKey }]);
  });
});
