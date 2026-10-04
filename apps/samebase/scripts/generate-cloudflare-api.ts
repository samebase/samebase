import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@hey-api/openapi-ts";
import traverse from "json-schema-traverse";
import { regexes } from "zod/v4/core";
import { includes, isRecord } from "@samebase/dependent/main";

import { valibotResolvers } from "./lib/valibotResolvers.ts";
import { samebaseAppFilePath } from "../../../scripts/lib/trackedFilePath.ts";

const sourceUrl = "https://raw.githubusercontent.com/cloudflare/api-schemas/main/openapi.json";
const sourceFetchTimeoutMs = 30_000;
const appRoot = fileURLToPath(new URL("../", import.meta.url));
const openApiDocumentOutputPath = fileURLToPath(
  new URL(
    `../${samebaseAppFilePath("convex/cloudflareApi/openApi.generated.json")}`,
    import.meta.url,
  ),
);
const cloudflareApiFamilyPathPrefixes = [
  "/accounts/{account_id}/workers",
  "/accounts/{account_id}/builds",
] as const;
const cloudflareApiExactPaths = ["/accounts", "/user/tokens/verify"] as const;
const cloudflareApiOperationMethods = ["delete", "get", "patch", "post", "put"] as const;
type JsonRecord = Record<string, unknown>;
// The full Cloudflare schema covers every product. Samebase pins a generated
// family subset so Workers/Builds additions drift visibly without pulling
// unrelated Cloudflare products into this boundary.
const response = await fetch(sourceUrl, {
  signal: AbortSignal.timeout(sourceFetchTimeoutMs),
});
if (!response.ok) {
  throw new Error(`Failed to fetch ${sourceUrl}: ${response.status}`);
}

const documentText = await response.text();
const documentJson = parseJsonSchemaDocument(documentText);
normalizeGeneratedExternalText(documentJson);
const subsetDocumentJson = buildCloudflareApiSubsetDocument(documentJson);

function parseJsonSchemaDocument(documentText: string) {
  const payload: unknown = JSON.parse(documentText);
  if (
    isRecord(payload) &&
    typeof payload["openapi"] === "string" &&
    isRecord(payload["info"]) &&
    isRecord(payload["paths"])
  ) {
    return payload;
  }
  throw new Error(`${sourceUrl} did not return an OpenAPI document.`);
}

function normalizeGeneratedExternalText(value: unknown): void {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const item = value[index];
      if (typeof item === "string") {
        value[index] = item.replaceAll("\u2014", "-");
        continue;
      }
      normalizeGeneratedExternalText(item);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const key of Object.keys(value)) {
    const item = value[key];
    if (typeof item === "string") {
      value[key] = item.replaceAll("\u2014", "-");
      continue;
    }
    normalizeGeneratedExternalText(item);
  }
}

function readOptionalString(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function buildCloudflareApiSubsetDocument(document: JsonRecord) {
  const selectedPaths = collectSelectedCloudflareApiPaths(document);
  ensureCloudflareApiOperationIds(selectedPaths);
  const info = readCloudflareApiSubsetInfo(document);
  const subsetDocument: JsonRecord = {
    openapi: document["openapi"],
    info,
    paths: selectedPaths,
    components: {},
  };

  if (document["servers"] !== undefined) {
    subsetDocument["servers"] = structuredClone(document["servers"]);
  }
  if (document["security"] !== undefined) {
    subsetDocument["security"] = structuredClone(document["security"]);
  }

  collectReferencedComponents({
    source: document,
    target: subsetDocument,
    root: selectedPaths,
  });
  normalizeObservedCloudflareApiResponseShapes(subsetDocument);

  return subsetDocument;
}

function normalizeObservedCloudflareApiResponseShapes(document: JsonRecord) {
  // Observed Worker responses use null for empty errors and messages.
  markSchemaNullable(document, "#/components/schemas/workers_messages");
  // Cloudflare /accounts returns null for this field when no abuse contact
  // email is set, while the upstream schema currently declares only string.
  markSchemaNullable(
    document,
    "#/components/schemas/iam_account/properties/settings/properties/abuse_contact_email",
  );
  // Worker detail responses can include domain references without
  // certificate_id. Keep the provider response visible as-is instead of
  // patching validated payloads at request time.
  markSchemaPropertyOptional({
    document,
    pointer: "#/components/schemas/workers_Worker/properties/references/properties/domains/items",
    property: "certificate_id",
  });
  // Active Workers Builds responses return null before a final outcome exists,
  // while the upstream schema currently declares only terminal strings.
  markSchemaNullable(document, "#/components/schemas/builds_BuildOutcome");
  // Workers Builds history returns push_event and response-shaped environment
  // variable objects, while the upstream metadata schema declares push and a
  // string map. Patch the schema boundary instead of rewriting provider data.
  normalizeObservedCloudflareBuildMetadataResponse(document);
  // Workers Builds operation schemas own the concrete result shape. The shared
  // envelope currently says result is an object, which rejects list endpoints
  // whose documented and observed result is an array.
  removeBuildsApiResponseResultShape(document);
}

function markSchemaNullable(document: JsonRecord, pointer: string): void {
  const schema = readJsonPointer(document, pointer);
  if (!isRecord(schema)) {
    throw new Error(`Expected Cloudflare API schema ${pointer} to be an object.`);
  }
  schema["nullable"] = true;
  const values = schema["enum"];
  if (Array.isArray(values) && !values.includes(null)) {
    values.push(null);
  }
}

function markSchemaPropertyOptional(args: {
  document: JsonRecord;
  pointer: string;
  property: string;
}): void {
  const schema = readJsonPointer(args.document, args.pointer);
  if (!isRecord(schema)) {
    throw new Error(`Expected Cloudflare API schema ${args.pointer} to be an object.`);
  }
  const required = schema["required"];
  if (!Array.isArray(required)) {
    throw new Error(`Expected Cloudflare API schema ${args.pointer} to have required fields.`);
  }
  if (!required.includes(args.property)) {
    throw new Error(`Expected Cloudflare API schema ${args.pointer} to require ${args.property}.`);
  }
  schema["required"] = required.filter((field) => field !== args.property);
}

function normalizeObservedCloudflareBuildMetadataResponse(document: JsonRecord): void {
  const triggerSource = readRecordPath(document, [
    "components",
    "schemas",
    "builds_BuildTriggerSource",
  ]);
  const publishedTriggerSources = ["push", "pull_request", "manual", "api"];
  const triggerSources = triggerSource["enum"];
  if (
    triggerSource["type"] !== "string" ||
    !Array.isArray(triggerSources) ||
    triggerSources.length !== publishedTriggerSources.length ||
    triggerSources.some((value, index) => value !== publishedTriggerSources[index])
  ) {
    throw new Error("Expected the unpatched Cloudflare Builds trigger source schema.");
  }
  triggerSource["enum"] = ["push", "push_event", "pull_request", "manual", "api", "retry"];

  const metadata = readRecordPath(document, [
    "components",
    "schemas",
    "builds_BuildTriggerMetadataResponse",
  ]);
  const properties = readRecordPath(metadata, ["properties"]);
  const environmentVariables = properties["environment_variables"];
  if (!isRecord(environmentVariables)) {
    throw new Error("Expected the Cloudflare Builds metadata environment variable schema.");
  }
  const values = environmentVariables["additionalProperties"];
  if (
    environmentVariables["type"] !== "object" ||
    !isRecord(values) ||
    values["type"] !== "string"
  ) {
    throw new Error("Expected the unpatched Cloudflare Builds metadata string map.");
  }
  properties["environment_variables"] = {
    $ref: "#/components/schemas/builds_EnvironmentVariablesResponse",
  };
}

/**
 * Lets Workers Builds operations define their own `result` shapes.
 *
 * Cloudflare composes Builds responses with `allOf`: the shared
 * `builds_APIResponse` envelope plus an operation-specific schema. `allOf`
 * validates both schemas independently, so a shared `result: object` does not
 * get overridden by an endpoint's `result: array`; it makes array-list
 * responses impossible. Keep the shared schema to envelope fields only, then
 * let each operation's schema carry the concrete `result` contract.
 */
function removeBuildsApiResponseResultShape(document: JsonRecord): void {
  const schema = readRecordPath(document, ["components", "schemas", "builds_APIResponse"]);
  const properties = readRecordPath(schema, ["properties"]);
  delete properties["result"];

  const required = schema["required"];
  if (Array.isArray(required)) {
    schema["required"] = required.filter((field) => field !== "result");
  }
}

function ensureCloudflareApiOperationIds(paths: JsonRecord): void {
  for (const [path, pathItem] of Object.entries(paths)) {
    if (!isRecord(pathItem)) {
      throw new Error(`Expected selected path ${path} to be an object.`);
    }

    for (const method of cloudflareApiOperationMethods) {
      const operation = pathItem[method];
      if (operation === undefined) {
        continue;
      }
      if (!isRecord(operation)) {
        throw new Error(`Expected ${method.toUpperCase()} ${path} to be an object.`);
      }
      const operationId = operation["operationId"];
      if (typeof operationId === "string" && operationId.length > 0) {
        continue;
      }

      operation["operationId"] = `samebase ${method} ${path}`;
    }
  }
}

function collectSelectedCloudflareApiPaths(document: JsonRecord): JsonRecord {
  const selectedPaths: JsonRecord = {};
  const entries = Object.entries(readRecordPath(document, ["paths"])).sort(([left], [right]) =>
    left.localeCompare(right),
  );

  for (const [path, pathItem] of entries) {
    if (!isSelectedCloudflareApiPath(path)) {
      continue;
    }
    selectedPaths[path] = structuredClone(pathItem);
  }

  if (Object.keys(selectedPaths).length === 0) {
    throw new Error("Cloudflare API subset did not match any paths.");
  }

  return selectedPaths;
}

function isSelectedCloudflareApiPath(path: string): boolean {
  return (
    includes(cloudflareApiExactPaths, path) ||
    cloudflareApiFamilyPathPrefixes.some((prefix) => path.startsWith(prefix))
  );
}

function readCloudflareApiSubsetInfo(document: JsonRecord): JsonRecord {
  const sourceInfo = isRecord(document["info"]) ? document["info"] : {};
  return {
    title: "Cloudflare Samebase API Family Subset",
    version: readOptionalString(sourceInfo, "version") ?? "0.0.0",
    description:
      "Generated subset for Samebase-owned Cloudflare Workers and Workers Builds API families.",
  };
}

function collectReferencedComponents(args: {
  source: JsonRecord;
  target: JsonRecord;
  root: unknown;
}): void {
  const seen = new Set<string>();

  function visit(value: unknown): void {
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }
    if (!isRecord(value)) {
      return;
    }

    const ref = readOptionalString(value, "$ref");
    if (ref?.startsWith("#/components/") && !seen.has(ref)) {
      seen.add(ref);
      const resolved = readJsonPointer(args.source, ref);
      setJsonPointer(args.target, ref, resolved);
      visit(resolved);
    }

    for (const entry of Object.values(value)) {
      visit(entry);
    }
  }

  visit(args.root);
}

function readJsonPointer(root: unknown, pointer: string): unknown {
  if (!pointer.startsWith("#/")) {
    throw new Error(`Cloudflare API subset cannot resolve external ref ${pointer}.`);
  }

  let value = root;
  for (const segment of parseJsonPointerSegments(pointer)) {
    if (!isRecord(value)) {
      throw new Error(`Cloudflare API ref ${pointer} passed through a non-object.`);
    }
    value = value[segment];
  }

  if (value === undefined) {
    throw new Error(`Cloudflare API ref ${pointer} was not found.`);
  }
  return value;
}

function setJsonPointer(root: JsonRecord, pointer: string, value: unknown): void {
  const segments = parseJsonPointerSegments(pointer);
  let target = root;
  for (const segment of segments.slice(0, -1)) {
    const existing = target[segment];
    if (isRecord(existing)) {
      target = existing;
      continue;
    }

    const next: JsonRecord = {};
    target[segment] = next;
    target = next;
  }

  const finalSegment = segments[segments.length - 1];
  if (!finalSegment) {
    throw new Error(`Cloudflare API ref ${pointer} has no final segment.`);
  }
  target[finalSegment] = structuredClone(value);
}

function parseJsonPointerSegments(pointer: string): string[] {
  return pointer
    .slice(2)
    .split("/")
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
}

function readRecordPath(root: unknown, pathSegments: readonly string[]): JsonRecord {
  let value = root;
  for (const segment of pathSegments) {
    if (!isRecord(value)) {
      throw new Error(`Expected ${pathSegments.join(".")} to be an object.`);
    }
    value = value[segment];
  }
  if (isRecord(value)) {
    return value;
  }
  throw new Error(`Expected ${pathSegments.join(".")} to be an object.`);
}

writeFileSync(openApiDocumentOutputPath, `${JSON.stringify(subsetDocumentJson, null, 2)}\n`);

// Defaults describe provider behavior. Validators must check the received data
// because the SDK returns it without applying validator transformations.
function stripSchemaDefaults(schema: unknown) {
  if (isRecord(schema))
    traverse(schema, {
      cb: (node) => {
        delete node["default"];
      },
    });
}

function visitSchemaContainers(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) visitSchemaContainers(item);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "example" || key === "examples" || key.startsWith("x-")) continue;
    if (key === "schema") stripSchemaDefaults(child);
    else visitSchemaContainers(child);
  }
}

await createClient({
  input: openApiDocumentOutputPath,
  parser: {
    // Keep the family document for drift checks. Runtime code covers current callers only.
    filters: {
      orphans: false,
      operations: {
        include: [
          "DELETE /accounts/{account_id}/builds/triggers/{trigger_uuid}",
          "DELETE /accounts/{account_id}/workers/workers/{worker_id}",
          "GET /accounts",
          "GET /accounts/{account_id}/builds/account/limits",
          "GET /accounts/{account_id}/builds/tokens",
          "GET /accounts/{account_id}/builds/workers/{external_script_id}/builds",
          "GET /accounts/{account_id}/builds/workers/{external_script_id}/triggers",
          "GET /accounts/{account_id}/builds/workers/{script_tag}",
          "GET /accounts/{account_id}/builds/workers/{script_tag}/previews",
          "GET /accounts/{account_id}/workers/account-settings",
          "GET /accounts/{account_id}/workers/scripts",
          "GET /accounts/{account_id}/workers/workers",
          "GET /accounts/{account_id}/workers/workers/{worker_id}",
          "GET /accounts/{account_id}/workers/workers/{worker_id}/previews/{preview_id}",
          "GET /user/tokens/verify",
          "PATCH /accounts/{account_id}/builds/workers/{script_tag}",
          "POST /accounts/{account_id}/builds/triggers/{trigger_uuid}/builds",
          "POST /accounts/{account_id}/builds/workers",
          "POST /accounts/{account_id}/builds/workers/{script_tag}/migrate_to_previews",
          "POST /accounts/{account_id}/workers/workers",
        ],
      },
    },
    patch: {
      input(document) {
        if (!("components" in document))
          throw new Error("Expected a Cloudflare OpenAPI 3 document.");
        const components = document.components;
        for (const schema of Object.values(components?.schemas ?? {})) stripSchemaDefaults(schema);
        for (const container of [
          document.paths,
          components?.parameters,
          components?.headers,
          components?.requestBodies,
          components?.responses,
        ])
          visitSchemaContainers(container);
      },
    },
  },
  output: { path: fileURLToPath(new URL("../convex/cloudflareApi/generated", import.meta.url)) },
  plugins: [
    "@hey-api/typescript",
    { name: "@hey-api/client-fetch", throwOnError: true },
    {
      name: "valibot",
      $resolvers: {
        ...valibotResolvers,
        number(ctx) {
          if (ctx.utils.shouldCoerceToBigInt(ctx.schema.format)) return;
          valibotResolvers.number(ctx);
        },
        string(ctx) {
          if (ctx.schema.format !== "date-time") return;
          const { $ } = ctx;
          const { v } = ctx.plugin.imports;
          // Emit the existing calendar/offset rule as a regex literal, without runtime Zod schemas.
          ctx.nodes.format = () =>
            $(v)
              .attr("regex")
              .call($.regexp(regexes.datetime({ offset: true }).source));
        },
      },
    },
    {
      name: "@hey-api/sdk",
      client: false,
      validator: true,
      responseStyle: "data",
      operations: {
        strategy: "single",
        containerName: "Cloudflare",
        methods: "static",
        nesting: (operation) => [operation.method.toUpperCase(), operation.path],
        methodName: { casing: "preserve" },
        segmentName: { casing: "preserve" },
      },
    },
  ],
});

execFileSync(
  "pnpm",
  ["exec", "vp", "fmt", "convex/cloudflareApi/generated", openApiDocumentOutputPath],
  {
    cwd: appRoot,
    stdio: "inherit",
  },
);

if (process.argv.includes("--verify")) {
  const outputs = [openApiDocumentOutputPath, "convex/cloudflareApi/generated"];
  execFileSync("git", ["diff", "--exit-code", "HEAD", "--", ...outputs], {
    cwd: appRoot,
    stdio: "inherit",
  });
  const untracked = execFileSync(
    "git",
    ["ls-files", "--others", "--exclude-standard", "--", ...outputs],
    {
      cwd: appRoot,
      encoding: "utf8",
    },
  );
  if (untracked.trim())
    throw new Error(`Cloudflare API generation added untracked files:\n${untracked}`);
}
