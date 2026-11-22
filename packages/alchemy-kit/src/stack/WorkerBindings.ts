import { icons, type IconName } from "../ui/icons.generated.ts";
import type { IconNode } from "../ui/ResourceTypeUI.ts";
import { asRecord, list, readString } from "./json.ts";

interface BindingKind {
  /** The name of the type in the bindings list of a Worker on the Cloudflare dashboard. */
  kind: string;
  icon: IconName;
  /** The field that names the target, such as the class of a Durable Object. */
  target?: string;
  /** The fields that identify the target, as a row of the target holds them in its `attr`. */
  ids?: readonly string[];
}

/**
Each binding type that Alchemy writes for a Worker, by its Cloudflare `type`.

@see https://github.com/alchemy-run/alchemy/blob/v2.0.0-beta.87/packages/cloudflare/src/Workers/WorkerAsyncBindings.ts
*/
const KINDS = new Map<string, BindingKind>([
  ["ai", { kind: "Workers AI", icon: "sparkles" }],
  ["ai_search", { kind: "AI Search", icon: "search", target: "instanceName" }],
  ["ai_search_namespace", { kind: "AI Search", icon: "search", target: "namespace" }],
  ["analytics_engine", { kind: "Analytics Engine", icon: "chart-line", target: "dataset" }],
  ["artifacts", { kind: "Artifacts", icon: "archive", target: "namespace" }],
  ["assets", { kind: "Assets", icon: "file" }],
  ["browser", { kind: "Browser Rendering", icon: "globe" }],
  ["d1", { kind: "D1 database", icon: "database", ids: ["databaseId"] }],
  ["dispatch_namespace", { kind: "Dispatch namespace", icon: "layers", target: "namespace" }],
  [
    "durable_object_namespace",
    { kind: "Durable Object", icon: "boxes", target: "className", ids: ["scriptName"] },
  ],
  ["flagship", { kind: "Flagship", icon: "flag", target: "appId" }],
  ["hyperdrive", { kind: "Hyperdrive", icon: "plug-zap" }],
  ["images", { kind: "Images", icon: "image" }],
  ["k2", { kind: "K2", icon: "waves", target: "stream" }],
  ["kv_namespace", { kind: "KV namespace", icon: "key-round", ids: ["namespaceId"] }],
  ["mtls_certificate", { kind: "mTLS certificate", icon: "file-lock" }],
  ["pipelines", { kind: "Pipeline", icon: "waves", target: "pipeline" }],
  [
    "queue",
    { kind: "Queue", icon: "list-ordered", target: "queueName", ids: ["queueName", "queueId"] },
  ],
  [
    "r2_bucket",
    { kind: "R2 bucket", icon: "hard-drive", target: "bucketName", ids: ["bucketName"] },
  ],
  ["ratelimit", { kind: "Rate limiting", icon: "gauge" }],
  ["secrets_store_secret", { kind: "Secrets Store", icon: "key-round", target: "secretName" }],
  ["self_service", { kind: "Service binding", icon: "zap", target: "entrypoint" }],
  ["self_url", { kind: "Self URL", icon: "link" }],
  ["send_email", { kind: "Send Email", icon: "mail" }],
  ["service", { kind: "Service binding", icon: "zap", target: "service", ids: ["service"] }],
  ["stream", { kind: "Stream", icon: "video" }],
  ["vectorize", { kind: "Vectorize", icon: "layers", target: "indexName", ids: ["indexName"] }],
  ["version_metadata", { kind: "Version metadata", icon: "tag" }],
  ["vpc_service", { kind: "VPC service", icon: "network" }],
  ["worker_loader", { kind: "Worker Loader", icon: "zap" }],
  [
    "workflow",
    {
      kind: "Workflow",
      icon: "workflow",
      target: "workflowName",
      ids: ["workflowName", "scriptName"],
    },
  ],
]);

/**
Bindings that hold a value instead of naming a resource. Cloudflare lists them apart, as variables
and secrets, and their values are in clear text in the state.
*/
const VALUE_TYPES = new Set(["plain_text", "secret_text", "json", "secret_key"]);

/** The `attr` fields of a row that a binding can name it by, such as the bucket of an R2 bucket. */
export const TARGET_IDS = [
  "bucketName",
  "databaseId",
  "namespaceId",
  "queueName",
  "queueId",
  "workerName",
  "workflowName",
  "indexName",
] as const;

export interface WorkerBinding {
  /** The name in `env`, such as `PAGES`. */
  name: string;
  kind: string;
  icon: IconNode;
  /** What the binding names, when its own fields say it, such as the class `PageStore`. */
  target: string | null;
  /** The values that a row of the target holds in one of its `TARGET_IDS`. */
  ids: string[];
}

/**
The resource bindings of a Worker row, from its `bindings`: Alchemy keeps each `env` entry as
`{ sid, data: { bindings: [{ type, name, ... }] } }`. A binding of a type that holds a value gives
nothing, and only the fields in `KINDS` are read.
*/
export function workerBindings(rowBindings: unknown): WorkerBinding[] {
  return list(rowBindings)
    .flatMap((group) => list(asRecord(asRecord(group)["data"])["bindings"]))
    .map(asRecord)
    .flatMap((binding) => {
      const type = readString(binding, "type");
      const name = readString(binding, "name");
      if (type === undefined || name === undefined || VALUE_TYPES.has(type)) {
        return [];
      }
      const spec = KINDS.get(type);
      return [
        {
          name,
          kind: spec?.kind ?? type,
          icon: icons[spec?.icon ?? "plug"],
          target: (spec?.target && readString(binding, spec.target)) ?? null,
          ids: (spec?.ids ?? []).flatMap((field) => readString(binding, field) ?? []),
        },
      ];
    });
}
