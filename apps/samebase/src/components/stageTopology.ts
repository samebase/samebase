import { asRecord, readString } from "../../convex/jsonUtils";
import type { AlchemyStage } from "../../shared/alchemyStateModel";
import { readStageResources, topologyId, workerBindingGroups } from "./stageWorkerBindings";

export type TopologyNode = {
  id: string;
  name: string;
  kind:
    | "worker"
    | "database"
    | "bucket"
    | "durable-object"
    | "browser"
    | "project"
    | "deployment"
    | "identity"
    | "credential"
    | "resource";
  type: string;
  detail?: string;
  status?: string;
};
export type TopologyEdge = { id: string; source: string; target: string; label: string };

function resourceNode(resource: ReturnType<typeof readStageResources>[number]): TopologyNode {
  const { attr, type, fqn, state } = resource;
  const node = { id: topologyId("resource", fqn), name: fqn, status: readString(state, "status") };
  switch (type) {
    case "Cloudflare.Worker": {
      const firstRoute = Array.isArray(attr["routes"]) ? asRecord(attr["routes"][0]) : {};
      const url = readString(attr, "url");
      return {
        ...node,
        kind: "worker",
        type: "Worker",
        detail:
          readString(asRecord(attr["domain"]), "name") ??
          readString(firstRoute, "pattern") ??
          (url && URL.canParse(url) ? new URL(url).hostname : undefined) ??
          readString(attr, "workerName"),
      };
    }
    case "Cloudflare.D1Database":
      return {
        ...node,
        kind: "database",
        type: "D1 database",
        detail: readString(attr, "databaseName"),
      };
    case "Cloudflare.R2.Bucket":
      return { ...node, kind: "bucket", type: "R2 bucket", detail: readString(attr, "bucketName") };
    case "Convex.Project":
      return { ...node, kind: "project", type: "Convex project", detail: readString(attr, "slug") };
    case "Convex.Deployment":
    case "Convex.LocalDeployment":
      return {
        ...node,
        kind: "deployment",
        type: type === "Convex.Deployment" ? "Convex deployment" : "Local deployment",
        detail: readString(attr, "name"),
      };
    case "IdentityHub.Client":
    case "IdentityHub.SharedClient": {
      const connectors: unknown[] = Array.isArray(attr["connectors"]) ? attr["connectors"] : [];
      return {
        ...node,
        kind: "identity",
        type: "Identity hub client",
        detail: connectors.filter((name) => typeof name === "string").join(" · ") || undefined,
      };
    }
    case "Cloudflare.ApiToken.AccountApiToken":
      return { ...node, kind: "credential", type: "Account API token" };
    case "Alchemy.Random":
      return { ...node, kind: "resource", type: "Random value" };
    case "GitHub.Comment":
      return { ...node, kind: "resource", type: "GitHub comment" };
    default:
      return { ...node, kind: "resource", type };
  }
}

function graphFromResources(resources: TopologyNode[]) {
  const nodes = new Map(resources.map((node) => [node.id, node]));
  const edges = new Map<string, TopologyEdge>();
  return {
    connect(source: string, target: TopologyNode, label: string) {
      if (!nodes.has(target.id)) nodes.set(target.id, target);
      const id = topologyId("edge", source, target.id, label);
      edges.set(id, { id, source, target: target.id, label });
    },
    snapshot: () => ({ nodes: [...nodes.values()], edges: [...edges.values()] }),
  };
}

export function stageTopology(stage: Pick<AlchemyStage, "resources">) {
  const resources = readStageResources(stage.resources);
  const nodes = resources.map(resourceNode);
  const bindings = graphFromResources(nodes);
  const dependencies = graphFromResources(nodes);
  const workerBindings = new Map(
    workerBindingGroups(resources).map((worker) => [
      topologyId("resource", worker.fqn),
      worker.bindings,
    ]),
  );
  for (const [source, entries] of workerBindings) {
    for (const binding of entries) {
      if (binding.endpoint)
        bindings.connect(
          source,
          binding.endpoint,
          binding.entrypoint ? binding.name + " · " + binding.entrypoint : binding.name,
        );
    }
  }
  for (const resource of resources) {
    const consumers: unknown = resource.state["downstream"];
    if (!Array.isArray(consumers)) continue;
    for (const consumer of consumers) {
      if (typeof consumer === "string")
        dependencies.connect(
          topologyId("resource", resource.fqn),
          {
            id: topologyId("resource", consumer),
            name: consumer,
            kind: "resource",
            type: "Referenced resource",
          },
          "",
        );
    }
  }
  return { bindings: bindings.snapshot(), dependencies: dependencies.snapshot(), workerBindings };
}
