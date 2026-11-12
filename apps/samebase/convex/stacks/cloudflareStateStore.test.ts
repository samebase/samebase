import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { readCloudflareStateStore } from "./cloudflareStateStore";

const accountId = "a".repeat(32);
const api = `https://api.cloudflare.com/client/v4/accounts/${accountId}`;
const store = "https://alchemy-state-store.example.workers.dev";
const storeToken = "store-bearer-token";

/**
The replies have the shapes that Cloudflare and a version 7 store gave on 2026-11-12 (keys only were
recorded). Resource rows have the fields of Alchemy's `ResourceState`.
*/
function cloudflare(result: unknown) {
  return Response.json({ result, success: true, errors: [], messages: [] });
}

const run = {
  version: 1,
  repository: "acme/shop",
  stackFile: "alchemy.run.ts",
  branch: "main",
  pullRequest: null,
  headCommit: "0123456789abcdef0123456789abcdef01234567",
  runUrl: "https://github.com/acme/shop/actions/runs/1",
  source: "github-actions",
  recordedAt: "2026-11-12T10:00:00.000Z",
};

/** The store of one account: `shop` deploys with a run record, `broken` fails to list its stages. */
const storeReplies: Record<string, unknown> = {
  "/state/stacks": ["shop", "CloudflareStateStore", "broken", "empty"],
  "/state/stacks/shop/stages": ["prod"],
  "/state/stacks/empty/stages": [],
  "/state/stacks/shop/stages/prod/resources": ["shop/Worker", "shop/Gone", "shop/Unreadable"],
  "/state/stacks/shop/stages/prod/output": { url: "https://shop.example.com", "samebase.run": run },
  "/state/stacks/shop/stages/prod/resources/shop%2FWorker": {
    status: "created",
    fqn: "shop/Worker",
    logicalId: "Worker",
    resourceType: "Cloudflare.Worker",
    props: { name: "shop", note: "unmarked-secret" },
    attr: { token: { __redacted__: "marked-secret" } },
  },
};

/** The reader passes each URL as a string. */
function fakeFetch(overrides: Partial<Record<string, () => Response>> = {}) {
  const requests: string[] = [];
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    requests.push(`${method} ${url}`);
    const override = overrides[`${method} ${url}`];
    if (override) {
      return override();
    }
    switch (`${method} ${url}`) {
      case `GET ${api}/workers/subdomain`:
        return cloudflare({ subdomain: "example" });
      case `GET ${store}/version`:
        return Response.json({ version: 7 });
      case `GET ${api}/secrets_store/stores`:
        return cloudflare([{ id: "secrets-store", account_id: accountId, name: "default" }]);
      case `GET ${api}/workers/subdomain/edge-preview`:
        return cloudflare({ token: "session-token", exchange_url: "https://exchange.example/x" });
      case "GET https://exchange.example/x":
        return Response.json({ token: "upload-token" });
      case `POST ${api}/workers/scripts/alchemy-state-store/edge-preview`:
        // Cloudflare runs the part as a module only with this type; else it answers 400 with 10021.
        return new Headers(init?.headers).get("cf-preview-upload-config-token") ===
          "upload-token" &&
          typeof init?.body === "string" &&
          init.body.includes('filename="probe.js"\r\nContent-Type: application/javascript+module')
          ? cloudflare({ preview_token: "preview-token" })
          : new Response(null, { status: 400 });
      case `GET ${store}`:
        return new Headers(init?.headers).get("cf-workers-preview-token") === "preview-token"
          ? new Response(`${storeToken}\n`)
          : new Response("<html>", { status: 400 });
    }
    if (url.startsWith(store)) {
      if (new Headers(init?.headers).get("Authorization") !== `Bearer ${storeToken}`) {
        return new Response(null, { status: 401 });
      }
      const path = url.slice(store.length);
      if (path === "/state/stacks/shop/stages/prod/resources/shop%2FGone") {
        return new Response("");
      }
      return path in storeReplies
        ? Response.json(storeReplies[path])
        : new Response(null, { status: 500 });
    }
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetch);
  return requests;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readCloudflareStateStore", () => {
  it("lists every stack with each resource's fqn, type, and status only", async () => {
    fakeFetch();
    const read = await readCloudflareStateStore({ token: "oauth-token", accountId });

    expect(read).toEqual({
      state: "found",
      stacks: [
        { name: "broken", read: "failed" },
        { name: "empty", read: "ok", stages: [] },
        {
          name: "shop",
          read: "ok",
          stages: [
            {
              name: "prod",
              run,
              resources: [
                { fqn: "shop/Unreadable", resourceType: null, status: null },
                { fqn: "shop/Worker", resourceType: "Cloudflare.Worker", status: "created" },
              ],
            },
          ],
        },
      ],
    });
    expect(JSON.stringify(read)).not.toMatch(/secret|store-bearer-token/);
  });

  it("asks for a reconnect when Cloudflare refuses the Secrets Store, before any preview", async () => {
    const requests = fakeFetch({
      [`GET ${api}/secrets_store/stores`]: () =>
        Response.json(
          { success: false, errors: [{ code: 10000, message: "Authentication error" }] },
          { status: 403 },
        ),
    });

    expect(await readCloudflareStateStore({ token: "oauth-token", accountId })).toEqual({
      state: "reconnect",
    });
    expect(requests.some((request) => request.includes("edge-preview"))).toBe(false);
  });

  it("finds no store when the store Worker is not on workers.dev", async () => {
    const requests = fakeFetch({
      [`GET ${store}/version`]: () => new Response("<!DOCTYPE html>", { status: 404 }),
    });

    expect(await readCloudflareStateStore({ token: "oauth-token", accountId })).toEqual({
      state: "no_store",
    });
    expect(requests).toHaveLength(2);
  });

  it("names a store version it does not read", async () => {
    fakeFetch({ [`GET ${store}/version`]: () => Response.json({ version: 9 }) });

    expect(await readCloudflareStateStore({ token: "oauth-token", accountId })).toEqual({
      state: "unsupported_version",
      version: 9,
    });
  });
});
