import { icons, type IconName } from "../ui/icons.generated.ts";
import type { IconNode } from "../ui/ResourceTypeUI.ts";
import { asRecord, list, readString, type JsonRecord } from "./json.ts";

/**
How a binding names a row of the stage: the resource types of the row, and pairs of a field of the
binding and the field of the row's `attr` that holds the same value.
*/
interface TargetMatch {
  types: readonly string[];
  fields: readonly (readonly [binding: string, attr: string])[];
}

interface BindingKind {
  /** The name of the type in the bindings list of a Worker on the Cloudflare dashboard. */
  kind: string;
  icon: IconName;
  /** The field that names the target, such as the class of a Durable Object. */
  target?: string;
  match?: TargetMatch;
}

const WORKER = ["Cloudflare.Worker"];

/**
Each binding type that Alchemy writes for a Worker, by its Cloudflare `type`.

@see https://github.com/alchemy-run/alchemy/blob/v2.0.0-beta.87/packages/cloudflare/src/Workers/WorkerAsyncBindings.ts
*/
const KINDS = new Map<string, BindingKind>([
  ["ai", { kind: "Workers AI", icon: "sparkles" }],
  ["ai_search", { kind: "AI Search", icon: "search", target: "instanceName" }],
  [
    "ai_search_namespace",
    {
      kind: "AI Search",
      icon: "search",
      target: "namespace",
      match: { types: ["Cloudflare.AI.SearchNamespace"], fields: [["namespace", "name"]] },
    },
  ],
  ["analytics_engine", { kind: "Analytics Engine", icon: "chart-line", target: "dataset" }],
  ["artifacts", { kind: "Artifacts", icon: "archive", target: "namespace" }],
  ["assets", { kind: "Assets", icon: "file" }],
  ["browser", { kind: "Browser Rendering", icon: "globe" }],
  [
    "d1",
    {
      kind: "D1 database",
      icon: "database",
      match: { types: ["Cloudflare.D1Database"], fields: [["databaseId", "databaseId"]] },
    },
  ],
  ["dispatch_namespace", { kind: "Dispatch namespace", icon: "layers", target: "namespace" }],
  [
    "durable_object_namespace",
    {
      kind: "Durable Object",
      icon: "boxes",
      target: "className",
      match: { types: WORKER, fields: [["scriptName", "workerName"]] },
    },
  ],
  ["flagship", { kind: "Flagship", icon: "flag", target: "appId" }],
  [
    "hyperdrive",
    {
      kind: "Hyperdrive",
      icon: "plug-zap",
      match: { types: ["Cloudflare.Hyperdrive"], fields: [["id", "hyperdriveId"]] },
    },
  ],
  ["images", { kind: "Images", icon: "image" }],
  ["k2", { kind: "K2", icon: "waves", target: "stream" }],
  [
    "kv_namespace",
    {
      kind: "KV namespace",
      icon: "key-round",
      match: {
        types: ["Cloudflare.KV.Namespace", "Cloudflare.KV.InstantNamespace"],
        fields: [["namespaceId", "namespaceId"]],
      },
    },
  ],
  ["mtls_certificate", { kind: "mTLS certificate", icon: "file-lock" }],
  ["pipelines", { kind: "Pipeline", icon: "waves", target: "pipeline" }],
  [
    "queue",
    {
      kind: "Queue",
      icon: "list-ordered",
      target: "queueName",
      match: { types: ["Cloudflare.Queues.Queue"], fields: [["queueName", "queueName"]] },
    },
  ],
  [
    "r2_bucket",
    {
      kind: "R2 bucket",
      icon: "hard-drive",
      target: "bucketName",
      match: {
        types: ["Cloudflare.R2.Bucket"],
        fields: [
          ["bucketName", "bucketName"],
          ["jurisdiction", "jurisdiction"],
        ],
      },
    },
  ],
  ["ratelimit", { kind: "Rate limiting", icon: "gauge" }],
  ["secrets_store_secret", { kind: "Secrets Store", icon: "key-round", target: "secretName" }],
  ["self_service", { kind: "Service binding", icon: "zap", target: "entrypoint" }],
  ["self_url", { kind: "Self URL", icon: "link" }],
  ["send_email", { kind: "Send Email", icon: "mail" }],
  [
    "service",
    {
      kind: "Service binding",
      icon: "zap",
      target: "service",
      match: { types: WORKER, fields: [["service", "workerName"]] },
    },
  ],
  ["stream", { kind: "Stream", icon: "video" }],
  [
    "vectorize",
    {
      kind: "Vectorize",
      icon: "layers",
      target: "indexName",
      match: { types: ["Cloudflare.VectorizeIndex"], fields: [["indexName", "indexName"]] },
    },
  ],
  ["version_metadata", { kind: "Version metadata", icon: "tag" }],
  ["vpc_service", { kind: "VPC service", icon: "network" }],
  ["worker_loader", { kind: "Worker Loader", icon: "zap" }],
  [
    "workflow",
    {
      kind: "Workflow",
      icon: "workflow",
      target: "workflowName",
      match: { types: ["Cloudflare.Workflow"], fields: [["workflowName", "workflowName"]] },
    },
  ],
]);

/**
Bindings that hold a value instead of naming a resource. Cloudflare lists them apart, as variables
and secrets, and their values are in clear text in the state.
*/
const VALUE_TYPES = new Set(["plain_text", "secret_text", "json", "secret_key"]);

/**
A field that a binding or a row leaves out when it has its default value: an R2 binding in the
default jurisdiction has no `jurisdiction`.
*/
const DEFAULTS = new Map([["jurisdiction", "default"]]);

const readField = (record: JsonRecord, field: string) =>
  readString(record, field) ?? DEFAULTS.get(field);

/** The `attr` fields of a row that a binding can name it by, such as the bucket of an R2 bucket. */
const TARGET_FIELDS = [
  ...new Set([...KINDS.values()].flatMap((spec) => spec.match?.fields ?? []).map(([, a]) => a)),
];

/** The values of the `TARGET_FIELDS` of a row's `attr`. */
export const targetFields = (attr: JsonRecord) =>
  new Map(
    TARGET_FIELDS.flatMap((field) => {
      const value = readField(attr, field);
      return value === undefined ? [] : [[field, value] as const];
    }),
  );

export interface WorkerBinding {
  /** The name in `env`, such as `PAGES`. */
  name: string;
  kind: string;
  icon: IconNode;
  /** What the binding names, when its own fields say it, such as the class `PageStore`. */
  target: string | null;
  /** The resource types of the target, and the `attr` values it holds, if the binding names one. */
  match: { types: readonly string[]; values: [attr: string, value: string][] } | null;
}

/** The `attr` values of the target that `binding` names, or null when a field is missing. */
function matchOf(binding: JsonRecord, match: TargetMatch | undefined): WorkerBinding["match"] {
  if (match === undefined) {
    return null;
  }
  const values = match.fields.flatMap(([field, attr]) => {
    const value = readField(binding, field);
    return value === undefined ? [] : [[attr, value] satisfies [string, string]];
  });
  return values.length === match.fields.length ? { types: match.types, values } : null;
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
          match: matchOf(binding, spec?.match),
        },
      ];
    });
}
