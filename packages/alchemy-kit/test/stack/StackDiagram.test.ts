import { expect, it } from "vite-plus/test";
import { stageDiagram, stageTree, type StageTreeNode } from "../../src/stack/StackDiagram.ts";

const SECRET = "s3cr3t-value-of-the-random";

/**
A stage in the shape of Alchemy beta.87 state: a Convex app, a Worker that binds a bucket, a D1
database and its own Durable Object class and holds a secret, and an `Alchemy.Random` that both use.
*/
const rows = [
  {
    fqn: "Project",
    state: {
      logicalId: "Project",
      resourceType: "Convex.Project",
      status: "created",
      attr: { projectId: 1 },
      downstream: ["Site"],
    },
  },
  {
    fqn: "Site",
    state: {
      logicalId: "Site",
      resourceType: "Convex.Deployment",
      status: "updated",
      props: { env: { SYNC_SECRET: SECRET } },
      attr: {
        name: "tidy-otter-412",
        url: "https://tidy-otter-412.convex.cloud",
        siteUrl: "https://tidy-otter-412.convex.site",
      },
      downstream: [],
    },
  },
  {
    fqn: "SyncSecret",
    state: {
      logicalId: "SyncSecret",
      resourceType: "Alchemy.Random",
      status: "created",
      attr: { text: SECRET },
      downstream: ["Sync", "Site"],
    },
  },
  {
    fqn: "Sync",
    state: {
      logicalId: "Sync",
      resourceType: "Cloudflare.Worker",
      status: "created",
      attr: { workerName: "sync", url: "https://sync.acme.workers.dev", crons: ["0 6 * * *"] },
      bindings: [
        {
          sid: "PRICES",
          data: { bindings: [{ type: "r2_bucket", name: "PRICES", bucketName: "prices" }] },
        },
        {
          sid: "SEARCH",
          data: { bindings: [{ type: "d1", name: "SEARCH", databaseId: "search-id" }] },
        },
        {
          sid: "PAGES",
          data: {
            bindings: [{ type: "durable_object_namespace", name: "PAGES", className: "PageStore" }],
          },
        },
        {
          sid: "SYNC_SECRET",
          data: { bindings: [{ type: "secret_text", name: "SYNC_SECRET", text: SECRET }] },
        },
      ],
      downstream: ["Site"],
    },
  },
  {
    fqn: "Prices",
    state: {
      logicalId: "Prices",
      resourceType: "Cloudflare.R2.Bucket",
      status: "created",
      attr: { bucketName: "prices" },
      downstream: ["Sync"],
    },
  },
  {
    fqn: "Search",
    state: {
      logicalId: "Search",
      resourceType: "Cloudflare.D1Database",
      status: "created",
      attr: { databaseId: "search-id", databaseName: "search" },
      downstream: [],
    },
  },
];

it("gives the boxes and lines of a stage and keeps no secret value", () => {
  const diagram = stageDiagram(rows);

  expect(
    diagram.boxes.map((box) => [
      box.name,
      box.typeName,
      box.link,
      box.folded.map((row) => row.fqn),
    ]),
  ).toEqual([
    ["Site", "Convex Deployment", "https://tidy-otter-412.convex.site", ["Project"]],
    ["Sync", "Worker", "https://sync.acme.workers.dev", []],
    ["Prices", "R2 Bucket", null, []],
    ["Search", "D1 Database", null, []],
  ]);
  const [, sync] = diagram.boxes;
  expect(
    sync?.bindings.map((binding) => [
      binding.kind,
      binding.name,
      binding.target,
      binding.box?.name,
    ]),
  ).toEqual([
    ["D1 database", "SEARCH", null, "Search"],
    ["Durable Object", "PAGES", "PageStore", undefined],
    ["R2 bucket", "PRICES", "prices", "Prices"],
  ]);
  expect(
    diagram.lines.map((line) => [line.a.name, line.b.name, line.from?.name, line.labels]),
  ).toEqual([
    ["Site", "Sync", "Site", ["shared secret"]],
    ["Sync", "Prices", "Sync", ["PRICES"]],
    ["Sync", "Search", "Sync", ["SEARCH"]],
  ]);
  const names = (nodes: StageTreeNode[]): unknown[] =>
    nodes.map((node) => [node.box.name, node.labels, names(node.children)]);
  expect(names(stageTree(diagram))).toEqual([
    [
      "Site",
      [],
      [
        [
          "Sync",
          ["shared secret"],
          [
            ["Prices", ["PRICES"], []],
            ["Search", ["SEARCH"], []],
          ],
        ],
      ],
    ],
  ]);
  expect(JSON.stringify(diagram.boxes)).not.toContain(SECRET);
});
