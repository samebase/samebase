import { asRecord, readString } from "../../convex/jsonUtils";
import type { AlchemyStage } from "../../shared/alchemyStateModel";

type Resource = {
  fqn: string;
  type: string;
  attr: Record<string, unknown>;
  bindings: unknown;
};

/**
 * Cloudflare persists compiled Worker bindings under `data.bindings` on each Alchemy binding.
 * Use only the target fields for that binding type. Text, JSON and secret bindings carry values
 * in the same object.
 *
 * @see https://github.com/alchemy-run/alchemy/blob/v2.0.0-beta.85/packages/cloudflare/src/Workers/WorkerAsyncBindings.ts
 */
function bindingTarget(
  binding: Record<string, unknown>,
  type: string,
  worker: Resource,
  resources: Resource[],
): { label: string; target?: string } {
  const field = (key: string) => readString(binding, key);
  const environment = field("environment");

  // Physical names can repeat across Cloudflare accounts and R2 jurisdictions. Only replace an
  // identifier with a logical resource name when the captured state identifies a single target.
  function resolve(resourceType: string, attribute: string, id: string | undefined) {
    if (!id) return undefined;
    const matches = resources.filter(
      (resource) =>
        resource.type === resourceType &&
        resource.attr[attribute] === id &&
        resource.attr["accountId"] === worker.attr["accountId"] &&
        (type !== "r2_bucket" ||
          (resource.attr["jurisdiction"] ?? "default") === (field("jurisdiction") ?? "default")),
    );
    return matches.length === 1 ? matches[0].fqn : id;
  }

  switch (type) {
    case "d1":
      return {
        label: "D1 database",
        target: resolve("Cloudflare.D1Database", "databaseId", field("databaseId")),
      };
    case "r2_bucket":
      return {
        label: "R2 bucket",
        target: resolve("Cloudflare.R2.Bucket", "bucketName", field("bucketName")),
      };
    case "service":
    case "self_service": {
      const service = field("service");
      const name =
        type === "self_service"
          ? worker.fqn
          : service && environment
            ? `${service} (${environment})`
            : resolve("Cloudflare.Worker", "workerName", service);
      return {
        label: "Worker service",
        target: [name, field("entrypoint")].filter(Boolean).join("."),
      };
    }
    case "durable_object_namespace": {
      const script = field("scriptName");
      const owner =
        script && environment
          ? `${script} (${environment})`
          : resolve("Cloudflare.Worker", "workerName", script);
      return {
        label: field("storage") === "sqlite" ? "Durable Object · SQLite" : "Durable Object",
        target: [owner, field("className")].filter(Boolean).join("."),
      };
    }
    case "browser":
      return { label: "Browser Rendering" };
    case "plain_text":
      return { label: "Text" };
    case "secret_text":
      return { label: "Secret" };
    case "json":
      return { label: "JSON" };
    default:
      return { label: type };
  }
}

export function stageWorkerBindings(rows: AlchemyStage["resources"]) {
  const resources: Resource[] = rows.flatMap(({ fqn, value }) => {
    const state = asRecord(JSON.parse(value));
    const type = readString(state, "resourceType");
    return type ? [{ fqn, type, attr: asRecord(state["attr"]), bindings: state["bindings"] }] : [];
  });

  return resources
    .filter((resource) => resource.type === "Cloudflare.Worker")
    .map((worker) => {
      const groups: unknown[] = Array.isArray(worker.bindings) ? worker.bindings : [];
      const bindings = groups.flatMap((group) => {
        const parts = asRecord(asRecord(group)["data"])["bindings"];
        const entries: unknown[] = Array.isArray(parts) ? parts : [];
        return entries.flatMap((entry) => {
          const binding = asRecord(entry);
          const name = readString(binding, "name");
          const type = readString(binding, "type");
          return name && type ? [{ name, ...bindingTarget(binding, type, worker, resources) }] : [];
        });
      });
      return { fqn: worker.fqn, bindings };
    });
}
