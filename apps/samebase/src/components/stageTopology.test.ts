import { expect, it } from "vite-plus/test";
import { observedSamebaseStackReply } from "../../convex/repository/fixtures/observedSamebaseAlchemyState";
import { stageTopology } from "./stageTopology";

it("keeps isolated resources visible and draws the recorded producer-to-consumer link in Samebase production", () => {
  const prod = observedSamebaseStackReply.value.stages.find(({ name }) => name === "prod");
  if (!prod) throw new Error("Missing production stage in observed Samebase fixture");
  const { nodes, edges } = stageTopology(prod).dependencies;
  const byName = new Map(nodes.map((node) => [node.name, node]));
  expect(nodes.map((node) => node.name)).toEqual(prod.resources.map((row) => row.fqn));
  expect(byName.get("PosthogProxy")).toMatchObject({ kind: "worker", detail: "e.samebase.com/*" });
  expect(edges).toMatchObject([
    { source: byName.get("Project")?.id, target: byName.get("Site")?.id },
  ]);
  expect(stageTopology(prod).bindings.edges).toEqual([]);
});

it("keeps external provider targets distinct from same-named stage resources and uses only binding identifiers", () => {
  const resources = [
    {
      fqn: "Reader",
      value: JSON.stringify({
        resourceType: "Cloudflare.Worker",
        attr: { accountId: "other", workerName: "Reader" },
      }),
    },
    {
      fqn: "Ingest",
      value: JSON.stringify({
        resourceType: "Cloudflare.Worker",
        attr: { accountId: "ours" },
        bindings: [
          {
            data: {
              bindings: [
                { type: "service", name: "SITE", service: "Reader", entrypoint: "NewPages" },
                { type: "service", name: "SITE", service: "Reader", entrypoint: "NewPages" },
                { type: "self_service", name: "SELF" },
                { type: "secret_text", name: "PASSWORD", text: "secret-value" },
              ],
            },
          },
        ],
      }),
    },
  ];
  const { nodes, edges } = stageTopology({ resources }).bindings;
  const reader = nodes.find((node) => node.name === "Reader" && node.detail === "Reader");
  const external = nodes.find(
    (node) => node.name === "Reader" && node.detail === "Provider target",
  );
  const ingest = nodes.find((node) => node.name === "Ingest");
  expect(reader?.id).not.toBe(external?.id);
  expect(edges).toMatchObject([
    { source: ingest?.id, target: external?.id, label: "SITE · NewPages" },
    { source: ingest?.id, target: ingest?.id, label: "SELF" },
  ]);
  expect(nodes).toHaveLength(3);
  expect(JSON.stringify({ nodes, edges })).not.toContain("secret-value");
});
