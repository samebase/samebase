import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { readCloudflareStateStore } from "./cloudflareStateStore";
import {
  answerCloudflareRequest,
  cloudflareAccountId as accountId,
  cloudflareApi as api,
  cloudflareStore as store,
} from "./fixtures/cloudflareStateStore";

const run = {
  version: 1,
  repository: "acme/app",
  stackFile: "alchemy.run.ts",
  branch: "main",
  pullRequest: null,
  headCommit: "0123456789abcdef0123456789abcdef01234567",
  runUrl: "https://github.com/acme/app/actions/runs/1",
  source: "github-actions",
  recordedAt: "2026-11-12T10:00:00.000Z",
};

/** A row with the fields of Alchemy's `ResourceState` and one marked secret. */
const workerRow = {
  status: "created",
  fqn: "web/Worker",
  logicalId: "Worker",
  resourceType: "Cloudflare.Worker",
  props: { name: "web" },
  attr: { workerName: "web", token: { __redacted__: "marked-secret" } },
};

/**
The store of one account. The stack `web` holds acme/app under a name that is not `owner/name`: its
stage `prod` has the run record of acme/app, and `dev` has none. `other` belongs to another
repository.
*/
const storeReplies: Record<string, unknown> = {
  "/state/stacks": ["web", "CloudflareStateStore", "other", "empty"],
  "/state/stacks/web/stages": ["prod", "dev"],
  "/state/stacks/other/stages": ["prod"],
  "/state/stacks/empty/stages": [],
  "/state/stacks/web/stages/prod/output": { url: "https://app.example.com", "samebase.run": run },
  "/state/stacks/web/stages/dev/output": { url: "https://dev.example.com" },
  "/state/stacks/other/stages/prod/output": {
    "samebase.run": { ...run, repository: "acme/other" },
  },
  "/state/stacks/web/stages/prod/resources": ["web/Worker", "web/Gone"],
  "/state/stacks/web/stages/prod/resources/web%2FWorker": workerRow,
  // A deploy removed the resource during the read.
  "/state/stacks/web/stages/prod/resources/web%2FGone": "",
};

/**
Stubs `fetch` with the account, `store` replacing replies of the store and `urls` replacing the
answer to whole URLs. The reader passes each URL as a string.
*/
function fakeFetch(
  args: { store?: Record<string, unknown>; urls?: Record<string, () => Response> } = {},
) {
  const requests: string[] = [];
  const replies = { ...storeReplies, ...args.store };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      requests.push(`${init?.method ?? "GET"} ${url}`);
      return (
        args.urls?.[url]?.() ??
        answerCloudflareRequest(replies, url, init) ??
        new Response(null, { status: 404 })
      );
    }),
  );
  return requests;
}

const read = async () =>
  await readCloudflareStateStore({ token: "oauth-token", accountId, repository: "acme/app" });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("readCloudflareStateStore", () => {
  it("gives the stages whose run record names the repository, without secret values", async () => {
    const requests = fakeFetch();
    const found = await read();

    expect(found).toEqual({
      state: "found",
      stacks: [
        {
          name: "web",
          stages: [
            {
              name: "prod",
              run,
              resources: [
                {
                  fqn: "web/Worker",
                  value: JSON.stringify({
                    ...workerRow,
                    attr: { workerName: "web", token: { __redacted__: null } },
                  }),
                },
              ],
              output: '{"url":"https://app.example.com"}',
            },
          ],
        },
      ],
    });
    expect(JSON.stringify(found)).not.toMatch(/marked-secret|store-bearer-token/);
    // Only the stage of the repository has its resources read.
    expect(requests.filter((request) => request.includes("/resources"))).toEqual([
      `GET ${store}/state/stacks/web/stages/prod/resources`,
      `GET ${store}/state/stacks/web/stages/prod/resources/web%2FGone`,
      `GET ${store}/state/stacks/web/stages/prod/resources/web%2FWorker`,
    ]);
  });

  it("fails on a row that is not JSON without logging its text", async () => {
    fakeFetch({
      store: {
        "/state/stacks/web/stages/prod/resources/web%2FWorker": '{"token":"unquoted-secret',
      },
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await read()).toEqual({ state: "failed" });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("unquoted-secret");
  });

  it("asks for a reconnect when Cloudflare refuses the Secrets Store, before any preview", async () => {
    const requests = fakeFetch({
      urls: {
        [`${api}/secrets_store/stores`]: () =>
          Response.json(
            { success: false, errors: [{ code: 10000, message: "Authentication error" }] },
            { status: 403 },
          ),
      },
    });

    expect(await read()).toEqual({ state: "reconnect" });
    expect(requests.some((request) => request.includes("edge-preview"))).toBe(false);
  });

  it("finds no store when the store Worker is not on workers.dev", async () => {
    const requests = fakeFetch({
      urls: { [`${store}/version`]: () => new Response("<!DOCTYPE html>", { status: 404 }) },
    });

    expect(await read()).toEqual({ state: "no_store" });
    expect(requests).toHaveLength(2);
  });

  it("names a store version it does not read", async () => {
    fakeFetch({ urls: { [`${store}/version`]: () => Response.json({ version: 9 }) } });

    expect(await read()).toEqual({ state: "unsupported_version", version: 9 });
  });
});
