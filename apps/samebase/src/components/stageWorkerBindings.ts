import { asRecord, readString } from "../../convex/jsonUtils";
import type { AlchemyStage } from "../../shared/alchemyStateModel";
import type { TopologyNode } from "./stageTopology";

// Prefix and escape each part. Logical IDs can themselves contain slashes, dots or colons.
export const topologyId = (...parts: string[]) => parts.map(encodeURIComponent).join(":");

export function readStageResources(rows: AlchemyStage["resources"]) {
  return rows.map(({ fqn, value }) => {
    const state = asRecord(JSON.parse(value));
    return {
      fqn,
      type: readString(state, "resourceType") ?? "unknown",
      attr: asRecord(state["attr"]),
      state,
    };
  });
}
type Resource = ReturnType<typeof readStageResources>[number];

type Binding = {
  name: string;
  label: string;
  target?: string;
  endpoint?: TopologyNode;
  entrypoint?: string;
};

const boundResources = {
  d1: {
    type: "Cloudflare.D1Database",
    field: "databaseId",
    kind: "database",
    label: "D1 database",
  },
  r2_bucket: {
    type: "Cloudflare.R2.Bucket",
    field: "bucketName",
    kind: "bucket",
    label: "R2 bucket",
  },
  service: { type: "Cloudflare.Worker", field: "workerName", kind: "worker", label: "Worker" },
} as const;

// Cloudflare persists compiled Worker bindings under data.bindings. Only read identifiers for the
// given binding type: plain text, JSON and secrets store their values alongside these fields.
// https://github.com/alchemy-run/alchemy/blob/v2.0.0-beta.85/packages/cloudflare/src/Workers/WorkerAsyncBindings.ts
function describeBinding(
  binding: Record<string, unknown>,
  name: string,
  type: string,
  worker: Resource,
  resources: Resource[],
): Binding {
  const field = (key: string) => readString(binding, key);
  const environment = field("environment");
  const account = readString(worker.attr, "accountId");
  const jurisdiction = field("jurisdiction") ?? "default";
  // Names can repeat across Cloudflare accounts and R2 jurisdictions. Preserve the provider
  // identifier if a preview points outside this stage, or a target is ambiguous.
  function resolve(
    provider: keyof typeof boundResources,
    id: string | undefined,
    env?: string,
  ): TopologyNode | undefined {
    if (!id) return undefined;
    const { type: resourceType, field: attribute, kind, label } = boundResources[provider];
    const matches = env
      ? []
      : resources.filter(
          (r) =>
            r.type === resourceType &&
            r.attr[attribute] === id &&
            r.attr["accountId"] === worker.attr["accountId"] &&
            (provider !== "r2_bucket" || (r.attr["jurisdiction"] ?? "default") === jurisdiction),
        );
    if (matches.length === 1) {
      const fqn = matches[0].fqn;
      return { id: topologyId("resource", fqn), name: fqn, kind, type: label };
    }
    return {
      id: topologyId(
        "provider",
        resourceType,
        account ?? worker.fqn,
        id,
        env ?? "",
        provider === "r2_bucket" ? jurisdiction : "",
      ),
      name: env ? `${id} (${env})` : id,
      kind,
      type: label,
      detail: "Provider target",
    };
  }

  switch (type) {
    case "d1":
    case "r2_bucket": {
      const { field: targetField, label } = boundResources[type];
      const endpoint = resolve(type, field(targetField));
      return { name, label, target: endpoint?.name, endpoint };
    }
    case "service":
    case "self_service": {
      const endpoint: TopologyNode | undefined =
        type === "self_service"
          ? {
              id: topologyId("resource", worker.fqn),
              name: worker.fqn,
              kind: "worker",
              type: "Worker",
            }
          : resolve("service", field("service"), environment);
      const entrypoint = field("entrypoint");
      return {
        name,
        label: "Worker service",
        target: [endpoint?.name, entrypoint].filter(Boolean).join("."),
        endpoint,
        entrypoint,
      };
    }
    case "durable_object_namespace": {
      const owner = resolve("service", field("scriptName"), environment);
      const className = field("className");
      const label = field("storage") === "sqlite" ? "Durable Object · SQLite" : "Durable Object";
      return {
        name,
        label,
        target: [owner?.name, className].filter(Boolean).join("."),
        endpoint: className
          ? {
              id: topologyId("class", owner?.id ?? topologyId("resource", worker.fqn), className),
              name: className,
              kind: "durable-object",
              type: label,
              detail: owner?.name ?? worker.fqn,
            }
          : undefined,
      };
    }
    case "browser":
      return {
        name,
        label: "Browser Rendering",
        endpoint: {
          id: topologyId("browser", worker.fqn, name),
          name: "Browser Rendering",
          kind: "browser",
          type: "Browser binding",
        },
      };
    case "plain_text":
      return { name, label: "Text" };
    case "secret_text":
      return { name, label: "Secret" };
    case "json":
      return { name, label: "JSON" };
    default:
      return { name, label: type };
  }
}

export function workerBindingGroups(resources: Resource[]) {
  return resources
    .filter((r) => r.type === "Cloudflare.Worker")
    .map((worker) => {
      const groups: unknown[] = Array.isArray(worker.state["bindings"])
        ? worker.state["bindings"]
        : [];
      const bindings = groups.flatMap((group) => {
        const parts = asRecord(asRecord(group)["data"])["bindings"];
        const entries: unknown[] = Array.isArray(parts) ? parts : [];
        return entries.flatMap((entry) => {
          const binding = asRecord(entry);
          const name = readString(binding, "name");
          const type = readString(binding, "type");
          return name && type ? [describeBinding(binding, name, type, worker, resources)] : [];
        });
      });
      return { fqn: worker.fqn, bindings };
    });
}
