import { describe, expect, it } from "vite-plus/test";
import { stageWorkerBindings } from "./stageWorkerBindings";

function resource(
  fqn: string,
  resourceType: string,
  attr: Record<string, string>,
  bindings: unknown[] = [],
) {
  return { fqn, value: JSON.stringify({ resourceType, attr, bindings }) };
}

/**
 * A projection of two deployed Worker rows from Alchemy beta.85, with provider identifiers
 * replaced. The same binding name on different Workers can point to different resource types.
 */
const reader = resource("Reader", "Cloudflare.Worker", { workerName: "reader-prod" }, [
  {
    sid: "PAGES",
    data: {
      bindings: [
        {
          type: "durable_object_namespace",
          name: "PAGES",
          className: "PageStore",
          storage: "sqlite",
        },
      ],
    },
  },
  { sid: "SEARCH", data: { bindings: [{ type: "d1", name: "SEARCH", databaseId: "search-id" }] } },
  {
    sid: "SITE",
    data: { bindings: [{ type: "r2_bucket", name: "SITE", bucketName: "site-files" }] },
  },
]);
const ingest = resource("Ingest", "Cloudflare.Worker", { workerName: "ingest-prod" }, [
  { sid: "BROWSER", data: { bindings: [{ type: "browser", name: "BROWSER" }] } },
  {
    sid: "SITE",
    data: {
      bindings: [{ type: "service", name: "SITE", service: "reader-prod", entrypoint: "NewPages" }],
    },
  },
]);
const search = resource("Search", "Cloudflare.D1Database", { databaseId: "search-id" });
const bucket = resource("SitePages", "Cloudflare.R2.Bucket", {
  bucketName: "site-files",
  jurisdiction: "default",
});

describe("stageWorkerBindings", () => {
  it("resolves targets in the selected stage and keeps the scope of each binding name", () => {
    expect(stageWorkerBindings([ingest, reader, search, bucket])).toEqual([
      {
        fqn: "Ingest",
        bindings: [
          { name: "BROWSER", label: "Browser Rendering" },
          { name: "SITE", label: "Worker service", target: "Reader.NewPages" },
        ],
      },
      {
        fqn: "Reader",
        bindings: [
          { name: "PAGES", label: "Durable Object · SQLite", target: "PageStore" },
          { name: "SEARCH", label: "D1 database", target: "Search" },
          { name: "SITE", label: "R2 bucket", target: "SitePages" },
        ],
      },
    ]);
  });

  it("shows the provider identifier for targets outside this stage", () => {
    const [worker] = stageWorkerBindings([ingest]);
    expect(worker.bindings[1].target).toBe("reader-prod.NewPages");
  });

  it("keeps values and malformed binding payloads out of the presentation", () => {
    const bindings = [
      null,
      { data: {} },
      {
        data: {
          bindings: [
            null,
            {},
            { type: "plain_text", name: "ORIGIN", text: "never-display" },
            { type: "secret_text", name: "API_KEY", text: { __redacted__: "never-display" } },
            { type: "json", name: "CONFIG", json: { value: "never-display" } },
            { type: "next_provider_type", name: "NEW", value: "never-display" },
          ],
        },
      },
    ];
    expect(stageWorkerBindings([resource("Site", "Cloudflare.Worker", {}, bindings)])).toEqual([
      {
        fqn: "Site",
        bindings: [
          { name: "ORIGIN", label: "Text" },
          { name: "API_KEY", label: "Secret" },
          { name: "CONFIG", label: "JSON" },
          { name: "NEW", label: "next_provider_type" },
        ],
      },
    ]);
  });
});
